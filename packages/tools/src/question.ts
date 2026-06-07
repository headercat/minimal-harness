import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

export function questionTool(config: { onAsk: (question: string) => Promise<string> }): Tool {
  return {
    name: 'question',
    description: 'Ask the user a question and get their response',
    inputSchema: z.object({
      question: z.string().describe('The question to ask the user'),
    }),
    handler: async (params) => {
      const { question } = params as { question: string };
      const answer = await config.onAsk(question);
      return { answer };
    },
  };
}
