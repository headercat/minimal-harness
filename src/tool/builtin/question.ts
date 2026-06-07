import type { Tool } from '../types.js';

export const questionTool: Tool = {
  name: 'question',
  description: 'Ask the user a question and get their response',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
    },
    required: ['question'],
  },
  handler: async (params, context) => {
    const { question } = params as { question: string };
    const answer = await context.ask(question);
    return { answer };
  },
};
