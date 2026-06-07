import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

export function writeTool(): Tool {
  return {
    name: 'write',
    description: 'Create a new file or overwrite an existing file with the given content',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('The content to write to the file'),
    }),
    handler: async (params) => {
      const { filePath, content } = params as {
        filePath: string;
        content: string;
      };

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf-8');

      return { filePath, charCount: content.length };
    },
  };
}
