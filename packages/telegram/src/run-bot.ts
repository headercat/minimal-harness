import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import type { Harness, HarnessContext } from '@minimal-harness/core';
import { setCurrentChatId } from './send-media.js';

function html(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    const text = ctx.message.text;
    if (!text) return;

    try {
      setCurrentChatId(ctx.chat.id.toString());
      ctx.api.sendChatAction(ctx.chat.id, 'typing');

      const sent = await ctx.reply('\u2026');
      let messageId = sent.message_id;
      let accumulated = '';
      let toolSuffix = '';
      let flushing = false;

      const typingInterval = setInterval(() => {
        ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
      }, config.typingInterval ?? 4000);

      const displayText = () => mdToHtml(accumulated) + toolSuffix;

      const flush = async () => {
        if (flushing) return;
        flushing = true;
        try {
          await ctx.api.editMessageText(ctx.chat.id, messageId, displayText(), {
            parse_mode: 'HTML',
          });
        } catch {
          // ignore Telegram API errors
        } finally {
          flushing = false;
        }
      };

      const flushInterval = setInterval(flush, 1000);

      const result = await harness.run(text, {
        ...override,
        onStream: (chunk: string) => {
          const wasEmpty = accumulated.length === 0;
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
      });

      clearInterval(typingInterval);
      clearInterval(flushInterval);

      if (result.output) {
        await ctx.api
          .editMessageText(ctx.chat.id, messageId, mdToHtml(result.output), {
            parse_mode: 'HTML',
          })
          .catch(() => {});
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
