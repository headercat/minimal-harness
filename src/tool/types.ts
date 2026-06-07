export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext,
) => unknown | Promise<unknown>;

export interface ToolContext {
  ask: (question: string) => Promise<string>;
  messages: Record<string, unknown>[];
  harness: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: ToolHandler;
}
