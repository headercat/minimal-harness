import type { Message } from './tool/types.js';

export class MessageHistory {
  private messages: Message[] = [];

  add(msg: Message): void {
    this.messages.push(msg);
  }

  addUser(content: string): void {
    this.add({ role: 'user', content });
  }

  addSystem(content: string): void {
    this.add({ role: 'system', content });
  }

  addAssistant(content?: string, tool_calls?: Message['tool_calls']): void {
    this.add({ role: 'assistant', content, tool_calls });
  }

  addToolResult(tool_call_id: string, content: string): void {
    this.add({ role: 'tool', tool_call_id, content });
  }

  getAll(): Message[] {
    return this.messages;
  }

  replaceAll(messages: Message[]): void {
    this.messages = messages;
  }

  clear(): void {
    this.messages = [];
  }
}
