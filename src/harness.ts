export interface HarnessConfig {
  systemPrompt?: string;
  llm: (
    messages: Record<string, unknown>[],
    toolDefs: { name: string; description: string; parameters: Record<string, unknown> }[],
  ) => Promise<Record<string, unknown>>;
  tools?: { name: string; description: string; parameters: Record<string, unknown>; handler: (...args: unknown[]) => unknown }[];
  skills?: import('./skill/injector.js').SkillInjectorConfig;
  mcp?: import('./mcp/client.js').MCPServerConfig[];
  permissions?: import('./permission/manager.js').PermissionChecker;
  maxIterations?: number;
}

export interface HarnessResult {
  messages: Record<string, unknown>[];
  output: string;
}

export interface HarnessContext {
  ask: (question: string) => Promise<string>;
  onToolCall?: (call: { name: string; params: Record<string, unknown> }) => void;
}

export class Harness {
  constructor(config: HarnessConfig) {
    void config;
    throw new Error('Not implemented');
  }

  async run(input: string, context?: HarnessContext): Promise<HarnessResult> {
    void input;
    void context;
    throw new Error('Not implemented');
  }
}
