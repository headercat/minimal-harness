import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

export function editTool(): Tool {
  return {
    name: 'edit',
    description:
      'Replace the first occurrence of oldString with newString in a file. ' +
      'Use replaceAll to replace all occurrences.',
    inputSchema: z.object({
      filePath: z.string().describe('Absolute path to the file to edit'),
      oldString: z.string().describe('The text to search for'),
      newString: z.string().describe('The text to replace with'),
      replaceAll: z.boolean().optional().default(false).describe('Replace all occurrences'),
    }),
    handler: async (params) => {
      const { filePath, oldString, newString, replaceAll } = params as {
        filePath: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
      };

      const original = await readFile(filePath, 'utf-8');

      if (!original.includes(oldString)) {
        throw new Error(`oldString not found in file: ${filePath}`);
      }

      const updated = replaceAll
        ? original.split(oldString).join(newString)
        : original.replace(oldString, newString);

      if (updated === original) {
        throw new Error(`oldString not found in file: ${filePath}`);
      }

      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, updated, 'utf-8');

      return { filePath, replaced: replaceAll ? 'all' : 'first' };
    },
  };
}
