import type { Tool } from '../types.js';

export const questionTool: Tool = {
  name: 'question',
  description: 'Ask the user a question',
  parameters: {
    question: { type: 'string', description: 'Question to ask' },
  },
  handler: async () => {
    throw new Error('Not implemented');
  },
};
