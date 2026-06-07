export class MessageHistory {
  private messages: Record<string, unknown>[] = [];

  add(msg: Record<string, unknown>): void {
    this.messages.push(msg);
  }

  getAll(): Record<string, unknown>[] {
    return this.messages;
  }
}
