import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

export function readTool(): Tool {
  return {
    name: 'read',
    description: 'Read file contents from the filesystem with optional offset and line limit',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to read'),
      offset: z.number().optional().describe('Line number to start from (1-indexed)'),
      limit: z.number().optional().describe('Maximum number of lines to return'),
    }),
    handler: async (params) => {
      const { filePath, offset, limit } = params as {
        filePath: string;
        offset?: number;
        limit?: number;
      };

      const content = await readFile(filePath, 'utf-8');

      if (offset === undefined && limit === undefined) {
        return { filePath, content, lineCount: content.split('\n').length };
      }

      const lines = content.split('\n');
      const start = offset ? Math.max(0, offset - 1) : 0;
      const end = limit ? start + limit : undefined;
      const selected = lines.slice(start, end);

      return {
        filePath,
        content: selected.join('\n'),
        lineCount: lines.length,
        startLine: start + 1,
        endLine: start + selected.length,
      };
    },
  };
}
