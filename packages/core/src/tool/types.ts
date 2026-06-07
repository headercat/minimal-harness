import type { z } from 'zod';

export type ToolHandler = (
  params: Record<string, unknown>,
  context: ToolContext,
) => unknown | Promise<unknown>;

export interface ToolContext {
  ask: (question: string) => Promise<string>;
  messages: Message[];
  harness: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  parameters?: Record<string, unknown>;
  handler: ToolHandler;
}

export function toToolDescriptor(t: Tool) {
  return { description: t.description, inputSchema: t.inputSchema };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export class ToolSchemaValidationError extends Error {
  constructor(
    public readonly toolName: string,
    issues: z.ZodIssue[],
  ) {
    const lines = issues.map((i) => `- '${i.path.join('.')}': ${i.message}`);
    super(`Tool '${toolName}' received invalid arguments:\n${lines.join('\n')}`);
    this.name = 'ToolSchemaValidationError';
  }
}

export interface LLMResponse {
  content?: string;
  tool_calls?: ToolCall[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}
