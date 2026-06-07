import type { Tool } from '../types.js';

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute shell commands',
  parameters: {
    command: { type: 'string', description: 'Command to execute' },
  },
  handler: async () => {
    throw new Error('Not implemented');
  },
};
