import { tool } from 'ai';
import type { Tool } from '@headercat/minimal-harness';

export function toToolDef(t: Tool) {
  return { description: t.description, inputSchema: t.inputSchema };
}

export function toTools(tools: Tool[]) {
  return Object.fromEntries(
    tools.map((t) => [t.name, tool({ description: t.description, inputSchema: t.inputSchema })]),
  );
}
