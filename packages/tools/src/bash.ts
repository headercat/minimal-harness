import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Tool } from '@minimal-harness/core';

const execFileAsync = promisify(execFile);

export function bashTool(): Tool {
  return {
    name: 'bash',
    description: 'Execute a shell command and return the result',
    inputSchema: z.object({
      command: z.string().describe('The shell command to execute'),
      workdir: z.string().optional().describe('Working directory (optional)'),
      timeout: z.number().optional().describe('Timeout in milliseconds (optional)'),
    }),
    handler: async (params) => {
      const { command, workdir, timeout } = params as {
        command: string;
        workdir?: string;
        timeout?: number;
      };

      try {
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: workdir,
          timeout,
          maxBuffer: 10 * 1024 * 1024,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException & {
          stdout?: string;
          stderr?: string;
          code?: string | number;
        };
        return {
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? error.message,
          exitCode: typeof error.code === 'number' ? error.code : 1,
        };
      }
    },
  };
}
