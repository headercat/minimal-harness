import type { Message } from '../tool/types.js';

export type PermissionChecker = (
  name: string,
  params: Record<string, unknown>,
  context: unknown,
) => void | Promise<void>;

export interface PermissionCheckContext {
  messages: Message[];
  harness: unknown;
  confirm?: (message: string) => Promise<boolean>;
}

export class PermissionManager {
  private checker?: PermissionChecker;

  constructor(checker?: PermissionChecker) {
    this.checker = checker;
  }

  async check(name: string, params: Record<string, unknown>, context: unknown): Promise<void> {
    await this.checker?.(name, params, context);
  }
}
