import type { Tool } from '../types.js';

export const subagentTool: Tool = {
  name: 'subagent',
  description:
    'Execute a sub-agent with a given prompt. The sub-agent starts fresh with no conversation history.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Task for the sub-agent to execute',
      },
      maxIterations: {
        type: 'number',
        description: 'Max iterations for the sub-agent (optional)',
      },
    },
    required: ['prompt'],
  },
  handler: async (params, context) => {
    const { prompt, maxIterations } = params as {
      prompt: string;
      maxIterations?: number;
    };

    const mod = await import('../../harness.js');
    const Harness = mod.Harness;

    type HarnessConfig = ConstructorParameters<typeof Harness>[0];
    const parentConfig = (
      context.harness as { config: HarnessConfig }
    ).config;

    const sub = new Harness({
      ...parentConfig,
      maxIterations: maxIterations ?? parentConfig.maxIterations ?? 25,
    });

    const result = await sub.run(prompt, { ask: context.ask });
    return { output: result.output };
  },
};
