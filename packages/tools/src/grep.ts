import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, relative, sep } from 'node:path';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

interface Match {
  file: string;
  line: number;
  content: string;
}

async function searchFile(filePath: string, regex: RegExp, maxMatches: number): Promise<Match[]> {
  const matches: Match[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, 'utf-8'),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (regex.test(line)) {
      matches.push({ file: filePath, line: lineNum, content: line });
      if (matches.length >= maxMatches) break;
    }
  }

  return matches;
}

async function recursiveGrep(
  dir: string,
  regex: RegExp,
  include: string | undefined,
  maxMatches: number,
  maxDepth: number,
  _depth = 0,
): Promise<Match[]> {
  if (_depth > maxDepth) return [];

  const matches: Match[] = [];
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return matches;
  }

  for (const entry of entries) {
    if (matches.length >= maxMatches) break;

    const fullPath = resolve(dir, entry);
    let stats;

    try {
      stats = await stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      matches.push(
        ...(await recursiveGrep(fullPath, regex, include, maxMatches, maxDepth, _depth + 1)),
      );
    } else if (stats.isFile()) {
      if (include && !entry.endsWith(include.replace('*', ''))) continue;
      matches.push(...(await searchFile(fullPath, regex, maxMatches)));
    }
  }

  return matches;
}

export function grepTool(): Tool {
  return {
    name: 'grep',
    description:
      'Search file contents using a regular expression. ' +
      'Returns matching file paths, line numbers, and line content.',
    inputSchema: z.object({
      pattern: z.string().describe('Regular expression pattern to search for'),
      include: z.string().optional().describe('File pattern to filter (e.g. *.ts, *.{ts,js})'),
      path: z.string().optional().describe('Directory to search in (defaults to cwd)'),
      maxDepth: z.number().optional().default(20).describe('Maximum directory depth'),
      maxMatches: z.number().optional().default(100).describe('Maximum number of matches'),
    }),
    handler: async (params) => {
      const {
        pattern,
        include,
        path: searchPath,
        maxDepth = 20,
        maxMatches = 100,
      } = params as {
        pattern: string;
        include?: string;
        path?: string;
        maxDepth?: number;
        maxMatches?: number;
      };

      const regex = new RegExp(pattern);
      const baseDir = searchPath ? resolve(searchPath) : process.cwd();
      const matches = await recursiveGrep(baseDir, regex, include, maxMatches, maxDepth);

      return { matches, count: matches.length };
    },
  };
}
