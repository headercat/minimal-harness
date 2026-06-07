import { z } from 'zod';
import type { Tool } from '@headercat/minimal-harness';

export const questionTool: Tool = {
  name: 'question',
  description: 'Ask the user a question and get their response',
  inputSchema: z.object({
    question: z.string().describe('The question to ask the user'),
  }),
  handler: async (params, context) => {
    const { question } = params as { question: string };
    const answer = await context.ask(question);
    return { answer };
  },
};
