import { tool } from 'ai';
import type { Tool } from '@minimal-harness/core';

export function toToolDef(t: Tool) {
  return { description: t.description, inputSchema: t.inputSchema };
}

export function toTools(tools: Tool[]) {
  return Object.fromEntries(
    tools.map((t) => [t.name, tool({ description: t.description, inputSchema: t.inputSchema })]),
  );
}
