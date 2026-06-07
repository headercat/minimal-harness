import { readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

function minimatch(name: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  return new RegExp(`^${regexStr}$`).test(name);
}

async function recursiveGlob(
  dir: string,
  pattern: string,
  baseDir: string,
  maxDepth: number,
  _depth = 0,
): Promise<string[]> {
  if (_depth > maxDepth) return [];

  const results: string[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, entry);
    const relPath = relative(baseDir, fullPath);
    let stats;

    try {
      stats = await stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (minimatch(relPath + '/', pattern)) {
        results.push(fullPath + '/');
      }
      results.push(...(await recursiveGlob(fullPath, pattern, baseDir, maxDepth, _depth + 1)));
    } else if (stats.isFile()) {
      if (minimatch(relPath, pattern)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

export function globTool(): Tool {
  return {
    name: 'glob',
    description: 'Find files and directories matching a glob pattern (e.g. **/*.ts, src/**/*.js)',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern to match (e.g. **/*.ts)'),
      path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
      maxDepth: z.number().optional().default(20).describe('Maximum directory depth'),
    }),
    handler: async (params) => {
      const {
        pattern,
        path: searchPath,
        maxDepth = 20,
      } = params as {
        pattern: string;
        path?: string;
        maxDepth?: number;
      };

      const baseDir = searchPath ? resolve(searchPath) : process.cwd();
      const files = await recursiveGlob(baseDir, pattern, baseDir, maxDepth);
      files.sort();

      return { files, count: files.length };
    },
  };
}
