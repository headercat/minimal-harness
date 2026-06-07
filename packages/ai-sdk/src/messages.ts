import type { ModelMessage, ToolCallPart, ToolResultPart } from 'ai';
import type { Message } from '@minimal-harness/core';

export function toMessages(messages: Message[]): ModelMessage[] {
  const toolNameMap = new Map<string, string>();

  return messages.map((m) => {
    switch (m.role) {
      case 'system':
      case 'user':
        return { role: m.role, content: m.content ?? '' } as ModelMessage;

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
          return { role: 'assistant', content };
        }
        return { role: 'assistant', content: m.content ?? '' };
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
        return { role: 'tool', content };
      }
    }
  });
}
