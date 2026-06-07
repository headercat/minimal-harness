import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from '../types.js';

const execFileAsync = promisify(execFile);

export const bashTool: Tool = {
  name: 'bash',
  description: 'Execute a shell command and return the result',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      workdir: { type: 'string', description: 'Working directory (optional)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (optional)' },
    },
    required: ['command'],
  },
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
        code?: number;
      };
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? error.message,
        exitCode: typeof error.code === 'number' ? error.code : 1,
      };
    }
  },
};
