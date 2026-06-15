import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import type { Harness, HarnessContext, Message } from '@minimal-harness/core';

const MAX_HTML = 4000;

function html(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitPlain(text: string, maxHtml: number): number {
  if (text.length < 100) return text.length;
  let split = Math.min(text.length, Math.floor(maxHtml * 0.85));
  const nl = text.lastIndexOf('\n', split);
  if (nl > 0) split = nl + 1;
  else {
    const sp = text.lastIndexOf(' ', split);
    if (sp > 0) split = sp + 1;
  }
  return split;
}

function mdToHtml(s: string): string {
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\x00CODE${codes.length - 1}\x00`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<i>$1</i>');
  s = s.replace(/\[([^\]]+)]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const tags: string[] = [];
  s = s.replace(/<\/?[^>]+>/g, (m) => {
    tags.push(m);
    return `\x00TAG${tags.length - 1}\x00`;
  });

  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/\x00TAG(\d+)\x00/g, (_, i) => tags[+i]);
  s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => `<code>${html(codes[+i])}</code>`);
  return s;
}

export interface TelegramBotConfig {
  botToken: string;
  harness: Harness;
  override?: HarnessContext;
  typingInterval?: number;
}

export interface TelegramBotInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createTelegramBot(config: TelegramBotConfig): TelegramBotInstance {
  const { botToken, harness, override } = config;
  const bot = new Bot(botToken);

  const pendingConfirmations = new Map<
    string,
    { resolve: (v: boolean) => void; userId: number; chatId: number; messageId: number }
  >();

  const chatHistories = new Map<string, Message[]>();

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!data.startsWith('cf:')) return;

    const parts = data.split(':');
    const action = parts[1];
    const uniqueId = parts.slice(2).join(':');
    const entry = pendingConfirmations.get(uniqueId);
    if (!entry) {
      await ctx.answerCallbackQuery({ text: 'Expired or already handled.' });
      return;
    }
    if (ctx.callbackQuery.from.id !== entry.userId) {
      await ctx.answerCallbackQuery({ text: 'This request is not for you.' });
      return;
    }

    entry.resolve(action === 'y');

    try {
      await ctx.api.deleteMessage(entry.chatId, entry.messageId);
    } catch {
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      } catch {
        // ignore
      }
    }
    pendingConfirmations.delete(uniqueId);
    await ctx.answerCallbackQuery(
      action === 'y' ? { text: '\u2705 Approved' } : { text: '\u274c Denied' },
    );
  });

  bot.on('message:text', async (ctx) => {
    let text = ctx.message.text;
    if (!text) return;

    const repliedTo = ctx.message.reply_to_message;
    if (repliedTo) {
      const repliedText = repliedTo.text ?? repliedTo.caption;
      if (repliedText) {
        text = `[Replying to: ${repliedText}]\n${text}`;
      }
    }

    try {
      ctx.api.sendChatAction(ctx.chat.id, 'typing');

      const sent = await ctx.reply('\u2026');
      let streamMsgId = sent.message_id;
      let accumulated = '';
      let committedLen = 0;
      let toolSuffix = '';
      let flushing = false;

      const typingInterval = setInterval(() => {
        ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
      }, config.typingInterval ?? 4000);

      async function flush() {
        if (flushing) return;
        flushing = true;
        try {
          let pending = accumulated.slice(committedLen);
          let html = mdToHtml(pending) + toolSuffix;

          while (html.length > MAX_HTML && pending.length > 0) {
            const split = splitPlain(pending, MAX_HTML);
            const committed = pending.slice(0, split);
            pending = pending.slice(split);
            committedLen += split;

            await ctx.api
              .editMessageText(ctx.chat.id, streamMsgId, mdToHtml(committed), {
                parse_mode: 'HTML',
              })
              .catch(() => {});

            if (pending.length > 0) {
              const newMsg = await ctx.api.sendMessage(ctx.chat.id, '\u2026');
              streamMsgId = newMsg.message_id;
            }
            html = mdToHtml(pending) + toolSuffix;
          }

          if (pending.length > 0 || toolSuffix) {
            await ctx.api
              .editMessageText(ctx.chat.id, streamMsgId, html, {
                parse_mode: 'HTML',
              })
              .catch(() => {});
          }
        } catch {
          // ignore
        } finally {
          flushing = false;
        }
      }

      const flushInterval = setInterval(flush, 1000);

      const chatId = ctx.chat.id.toString();
      const prevMessages = chatHistories.get(chatId) ?? [];
      const result = await harness.run(
        text,
        {
          userId: ctx.message.from.id.toString(),
          channelId: ctx.chat.id.toString(),
          ...override,
          onStream: (chunk: string) => {
            const wasEmpty = accumulated.length === committedLen;
            accumulated += chunk;
            if (wasEmpty) {
              setTimeout(flush, 200);
            }
          },
          onToolCall: (call) => {
            const detail = Object.values(call.params)
              .filter((v) => typeof v === 'string' || typeof v === 'number')
              .map((v) => String(v).split('\n')[0].slice(0, 80))
              .join(', ');
            toolSuffix = detail
              ? `\n\n<pre><code class="language-${html(call.name)}">${html(detail)}</code></pre>`
              : '';
            flush();
          },
          onToolResult: () => {
            toolSuffix = '';
            flush();
          },
          confirm: async (message) => {
            const uniqueId = `${ctx.chat.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
            const msg = await ctx.reply(mdToHtml(message), {
              parse_mode: 'HTML',
              reply_markup: new InlineKeyboard()
                .text('\u2705 Approve', `cf:y:${uniqueId}`)
                .text('\u274c Deny', `cf:n:${uniqueId}`),
            });

            return new Promise<boolean>((resolve) => {
              pendingConfirmations.set(uniqueId, {
                resolve,
                userId: ctx.message.from.id,
                chatId: ctx.chat.id,
                messageId: msg.message_id,
              });
            });
          },
        },
        prevMessages,
      );

      clearInterval(typingInterval);
      clearInterval(flushInterval);

      chatHistories.set(chatId, result.messages);

      const remaining = accumulated.slice(committedLen);
      if (remaining.length > 0) {
        let rest = remaining;
        let first = true;
        while (rest.length > 0) {
          const split = splitPlain(rest, MAX_HTML);
          const part = rest.slice(0, split);
          rest = rest.slice(split);
          if (first) {
            await ctx.api
              .editMessageText(ctx.chat.id, streamMsgId, mdToHtml(part), {
                parse_mode: 'HTML',
              })
              .catch(() => {});
            first = false;
          } else {
            await ctx.api
              .sendMessage(ctx.chat.id, mdToHtml(part), {
                parse_mode: 'HTML',
              })
              .catch(() => {});
          }
        }
      } else if (accumulated.length === 0 && result.output) {
        let rest = result.output;
        let first = true;
        while (rest.length > 0) {
          const split = splitPlain(rest, MAX_HTML);
          const part = rest.slice(0, split);
          rest = rest.slice(split);
          if (first) {
            await ctx.api
              .editMessageText(ctx.chat.id, streamMsgId, mdToHtml(part), {
                parse_mode: 'HTML',
              })
              .catch(() => {});
            first = false;
          } else {
            await ctx.api
              .sendMessage(ctx.chat.id, mdToHtml(part), {
                parse_mode: 'HTML',
              })
              .catch(() => {});
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await ctx.reply(`Error: ${message}`).catch(() => {});
    }
  });

  let runnerHandle: ReturnType<typeof run> | undefined;

  return {
    async start() {
      if (runnerHandle) return;
      runnerHandle = run(bot);
    },
    async stop() {
      if (!runnerHandle) return;
      await runnerHandle.stop();
      runnerHandle = undefined;
    },
  };
}
