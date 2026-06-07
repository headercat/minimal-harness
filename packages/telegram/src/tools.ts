import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

export function createTelegramTools({ botToken }: { botToken: string }): Tool[] {
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  const telegramTool: Tool = {
    name: 'telegram',
    description:
      'Call any Telegram Bot API method. Use this to send messages, files, and interact with Telegram channels or chats.',
    inputSchema: z.object({
      method: z
        .string()
        .describe('The Telegram Bot API method name, e.g. "sendMessage", "getChat", "sendPhoto"'),
      params: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Parameters to pass to the API method'),
    }),
    handler: async (params) => {
      const { method, params: apiParams = {} } = params as {
        method: string;
        params?: Record<string, unknown>;
      };

      const response = await fetch(`${apiBase}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiParams),
      });

      const data = (await response.json()) as {
        ok: boolean;
        result?: unknown;
        description?: string;
      };

      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
      }

      return data.result;
    },
  };

  return [telegramTool];
}
