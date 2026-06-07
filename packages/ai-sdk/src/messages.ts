import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import type { Message } from '@minimal-harness/core';
import { getSystemMessages } from '@minimal-harness/core';

export function extractSystemMessage(messages: Message[]): string | undefined {
  return getSystemMessages(messages)[0]?.content;
}

export function toMessages(messages: Message[]): ModelMessage[] {
  const toolNameMap = new Map<string, string>();

  const result: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    switch (m.role) {
      case 'user':
        result.push({ role: m.role, content: m.content ?? '' } as ModelMessage);
        break;

      case 'assistant': {
        if (m.tool_calls && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            toolNameMap.set(tc.id, tc.name);
          }
          const content: (ToolCallPart | { type: 'text'; text: string })[] = [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.tool_calls.map(
              (tc): ToolCallPart => ({
                type: 'tool-call',
                toolCallId: tc.id,
                toolName: tc.name,
                input: tc.arguments,
              }),
            ),
          ];
          result.push({ role: 'assistant', content });
        } else {
          result.push({ role: 'assistant', content: m.content ?? '' });
        }
        break;
      }

      case 'tool': {
        const content: ToolResultPart[] = [
          {
            type: 'tool-result',
            toolCallId: m.tool_call_id!,
            toolName: m.name ?? toolNameMap.get(m.tool_call_id!) ?? '',
            output: { type: 'text', value: m.content ?? '' },
          },
        ];
        result.push({ role: 'tool', content });
        break;
      }
    }
  }
  return result;
}
