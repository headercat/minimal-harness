import type { Tool } from '../types.js';

export const subagentTool: Tool = {
  name: 'subagent',
  description: 'Execute a sub-agent with a given prompt',
  parameters: {
    prompt: { type: 'string', description: 'Task for the sub-agent' },
  },
  handler: async () => {
    throw new Error('Not implemented');
  },
};
