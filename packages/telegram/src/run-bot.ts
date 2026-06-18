import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import type { Harness, HarnessContext, Message } from '@minimal-harness/core';

const MAX_HTML = 4000;
const CONFIRM_TIMEOUT_MS = 60_000;
const MAX_HISTORY_ENTRIES = 1000;

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

  const sanitizingFetch: typeof globalThis.fetch = async (url, opts) => {
    try {
      return await fetch(url, opts);
    } catch (err) {
      if (err instanceof Error) {
        err.message = err.message.replaceAll(botToken, '***');
        if ('error' in err && err.error instanceof Error) {
          err.error.message = err.error.message.replaceAll(botToken, '***');
        }
      }
      throw err;
    }
  };

  const bot = new Bot(botToken, {
    client: {
      fetch: sanitizingFetch as any,
    },
  });

  bot.catch((err) => {
    console.error('Bot middleware error:', err.message);
  });

  const pendingConfirmations = new Map<
    string,
    {
      resolve: (v: boolean) => void;
      userId: number;
      chatId: number;
      messageId: number;
      createdAt: number;
    }
  >();

  const chatHistories = new Map<string, Message[]>();
  const chatQueues = new Map<string, Promise<void>>();

  let cleanupTimer: ReturnType<typeof setInterval> | undefined;

  function evictOldestFromHistories() {
    while (chatHistories.size > MAX_HISTORY_ENTRIES) {
      chatHistories.delete(chatHistories.keys().next().value!);
    }
  }

  function cleanExpiredConfirmations() {
    const now = Date.now();
    for (const [key, entry] of pendingConfirmations) {
      if (now - entry.createdAt > CONFIRM_TIMEOUT_MS) {
        entry.resolve(false);
        bot.api.deleteMessage(entry.chatId, entry.messageId).catch(() => {});
        pendingConfirmations.delete(key);
      }
    }
  }

  bot.command('clear', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const isGroup = ctx.chat.id < 0;
    const uid = ctx.from?.id.toString();
    const historyKey = isGroup && uid ? `${chatId}:${uid}` : chatId;
    chatHistories.delete(historyKey);
    await ctx.reply('Context cleared.').catch(() => {});
  });

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
    const chatId = ctx.chat.id.toString();
    const prev = chatQueues.get(chatId) ?? Promise.resolve();
    let resolveCurrent: (() => void) | undefined;
    const current = new Promise<void>((r) => {
      resolveCurrent = r;
    });
    chatQueues.set(chatId, current);

    try {
      await prev.catch(() => {});

      let text = ctx.message.text;
      if (!text) return;

      const repliedTo = ctx.message.reply_to_message;
      if (repliedTo) {
        const repliedText = repliedTo.text ?? repliedTo.caption;
        const repliedBy = repliedTo.from
          ? ` (${repliedTo.from.first_name}${repliedTo.from.last_name ? ` ${repliedTo.from.last_name}` : ''})`
          : '';
        if (repliedText) {
          const role = repliedTo.from?.is_bot ? 'bot response' : `user${repliedBy}`;
          text = `[Replying to ${role}: ${repliedText}]\n${text}`;
        }
      }

      const sent = await ctx.reply('\u2026');
      let streamMsgId = sent.message_id;
      let accumulated = '';
      let committedLen = 0;
      let lastSentHtml = '';
      let toolSuffix = '';
      let flushing = false;

      let typingInterval: ReturnType<typeof setInterval> | undefined;
      let flushInterval: ReturnType<typeof setInterval> | undefined;

      try {
        typingInterval = setInterval(() => {
          ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
        }, config.typingInterval ?? 4000);

        async function flush() {
          if (flushing) return;
          flushing = true;
          try {
            let pending = accumulated.slice(committedLen);

            while (pending.length > 0) {
              const fullHtml = mdToHtml(pending) + toolSuffix;
              if (fullHtml.length <= MAX_HTML) break;
              const split = splitPlain(pending, MAX_HTML);
              const committed = pending.slice(0, split);
              pending = pending.slice(split);
              const commitHtml = mdToHtml(committed);

              let ok = false;
              if (commitHtml !== lastSentHtml) {
                try {
                  await ctx.api.editMessageText(ctx.chat.id, streamMsgId, commitHtml, {
                    parse_mode: 'HTML',
                  });
                  lastSentHtml = commitHtml;
                  ok = true;
                } catch {
                  // will retry on next flush cycle
                }
              } else {
                ok = true;
              }
              if (!ok) break;
              committedLen += split;

              if (pending.length > 0) {
                const newMsg = await ctx.api.sendMessage(ctx.chat.id, '\u2026');
                streamMsgId = newMsg.message_id;
                lastSentHtml = '';
              }
            }

            const remaining = accumulated.slice(committedLen);
            if (remaining.length > 0 || toolSuffix) {
              const finalHtml = mdToHtml(remaining) + toolSuffix;
              if (finalHtml !== lastSentHtml) {
                try {
                  await ctx.api.editMessageText(ctx.chat.id, streamMsgId, finalHtml, {
                    parse_mode: 'HTML',
                  });
                  lastSentHtml = finalHtml;
                } catch {
                  // will retry on next flush cycle
                }
              }
            }
          } finally {
            flushing = false;
          }
        }

        flushInterval = setInterval(flush, 1000);

        const userId = ctx.message.from.id.toString();
        const isGroup = ctx.chat.id < 0;
        const historyKey = isGroup ? `${chatId}:${userId}` : chatId;
        const prevMessages = chatHistories.get(historyKey) ?? [];
        const result = await harness.run(
          text,
          {
            userId,
            channelId: chatId,
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
              const createdAt = Date.now();
              const msg = await ctx.reply(mdToHtml(message), {
                parse_mode: 'HTML',
                reply_markup: new InlineKeyboard()
                  .text('\u2705 Approve', `cf:y:${uniqueId}`)
                  .text('\u274c Deny', `cf:n:${uniqueId}`),
              });

              const confirmPromise = new Promise<boolean>((resolve) => {
                pendingConfirmations.set(uniqueId, {
                  resolve,
                  userId: ctx.message.from.id,
                  chatId: ctx.chat.id,
                  messageId: msg.message_id,
                  createdAt,
                });
              });

              const timeoutPromise = new Promise<boolean>((resolve) => {
                setTimeout(() => {
                  const entry = pendingConfirmations.get(uniqueId);
                  if (entry) {
                    pendingConfirmations.delete(uniqueId);
                    ctx.api.deleteMessage(entry.chatId, entry.messageId).catch(() => {});
                    resolve(false);
                  }
                }, CONFIRM_TIMEOUT_MS);
              });

              return Promise.race([confirmPromise, timeoutPromise]);
            },
          },
          prevMessages,
        );

        evictOldestFromHistories();
        chatHistories.set(historyKey, result.messages);

        const remaining = accumulated.slice(committedLen);
        if (remaining.length > 0) {
          let rest = remaining;
          let first = true;
          while (rest.length > 0) {
            const split = splitPlain(rest, MAX_HTML);
            const part = rest.slice(0, split);
            rest = rest.slice(split);
            const partHtml = mdToHtml(part);
            if (first) {
              if (partHtml !== lastSentHtml) {
                await ctx.api
                  .editMessageText(ctx.chat.id, streamMsgId, partHtml, {
                    parse_mode: 'HTML',
                  })
                  .catch(() => {});
              }
              first = false;
            } else {
              await ctx.api
                .sendMessage(ctx.chat.id, partHtml, {
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
            const partHtml = mdToHtml(part);
            if (first) {
              if (partHtml !== lastSentHtml) {
                await ctx.api
                  .editMessageText(ctx.chat.id, streamMsgId, partHtml, {
                    parse_mode: 'HTML',
                  })
                  .catch(() => {});
              }
              first = false;
            } else {
              await ctx.api
                .sendMessage(ctx.chat.id, partHtml, {
                  parse_mode: 'HTML',
                })
                .catch(() => {});
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        await ctx.reply(`Error: ${message}`).catch(() => {});
      } finally {
        if (typingInterval) clearInterval(typingInterval);
        if (flushInterval) clearInterval(flushInterval);
      }
    } finally {
      resolveCurrent!();
    }
  });

  let runnerHandle: ReturnType<typeof run> | undefined;

  const instance: TelegramBotInstance = {
    async start() {
      if (runnerHandle) return;
      cleanupTimer = setInterval(() => {
        cleanExpiredConfirmations();
        evictOldestFromHistories();
        while (chatQueues.size > MAX_HISTORY_ENTRIES) {
          chatQueues.delete(chatQueues.keys().next().value!);
        }
      }, 15_000);
      const handle = run(bot);
      runnerHandle = handle;
      handle.task()?.catch(async () => {
        runnerHandle = undefined;
        if (cleanupTimer) clearInterval(cleanupTimer);
        await new Promise((r) => setTimeout(r, 5000));
        instance.start();
      });
    },
    async stop() {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = undefined;
      }
      if (!runnerHandle) return;
      await runnerHandle.stop();
      runnerHandle = undefined;
    },
  };

  return instance;
}
