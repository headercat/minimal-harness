import { Bot } from 'grammy';
import type { Harness, HarnessContext } from '@minimal-harness/core';

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

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (!text) return;

    try {
      await ctx.api.sendChatAction(ctx.chat.id, 'typing');

      let messageId: number | undefined;
      let lastEdit = 0;
      const THROTTLE_MS = 1000;
      const typingInterval = setInterval(() => {
        ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
      }, config.typingInterval ?? 4000);

      const result = await harness.run(text, {
        ...override,
        onStream: async (chunk: string) => {
          const now = Date.now();
          if (!messageId) {
            const sent = await ctx.reply(chunk);
            messageId = sent.message_id;
            lastEdit = now;
          } else if (now - lastEdit >= THROTTLE_MS) {
            await ctx.api.editMessageText(ctx.chat.id, messageId, chunk).catch(() => {});
            lastEdit = now;
          }
        },
      });

      clearInterval(typingInterval);

      if (messageId && result.output) {
        await ctx.api.editMessageText(ctx.chat.id, messageId, result.output).catch(() => {});
      } else if (result.output) {
        await ctx.reply(result.output);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await ctx.reply(`Error: ${message}`).catch(() => {});
    }
  });

  let running = false;

  return {
    async start() {
      if (running) return;
      running = true;
      bot.start();
    },
    async stop() {
      if (!running) return;
      running = false;
      await bot.stop();
    },
  };
}
