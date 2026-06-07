import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

export function readdirTool(): Tool {
  return {
    name: 'readdir',
    description: 'List files and directories in a given directory path',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the directory to list'),
    }),
    handler: async (params) => {
      const { path: dirPath } = params as { path: string };
      const resolvedPath = resolve(dirPath);

      const entries = await readdir(resolvedPath);
      const results: DirEntry[] = [];

      for (const entry of entries) {
        let stats;
        try {
          stats = await stat(resolve(resolvedPath, entry));
        } catch {
          continue;
        }

        results.push({
          name: entry,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.isFile() ? stats.size : undefined,
        });
      }

      results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return { path: resolvedPath, entries: results, count: results.length };
    },
  };
}
