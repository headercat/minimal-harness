import type { Message } from './tool/types.js';

export function filterByRole(messages: Message[], role: Message['role']): Message[] {
  return messages.filter((m) => m.role === role);
}

export function getSystemMessages(messages: Message[]): Message[] {
  return filterByRole(messages, 'system');
}

export function getUserMessages(messages: Message[]): Message[] {
  return filterByRole(messages, 'user');
}

export function getAssistantMessages(messages: Message[]): Message[] {
  return filterByRole(messages, 'assistant');
}

export function getToolMessages(messages: Message[]): Message[] {
  return filterByRole(messages, 'tool');
}

export class MessageHistory {
  private messages: Message[];

  constructor(initialMessages?: Message[]) {
    this.messages = initialMessages ? [...initialMessages] : [];
  }

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
    return [...this.messages];
  }

  getByRole(role: Message['role']): Message[] {
    return filterByRole(this.messages, role);
  }

  getSystem(): Message[] {
    return this.getByRole('system');
  }

  getUser(): Message[] {
    return this.getByRole('user');
  }

  getAssistant(): Message[] {
    return this.getByRole('assistant');
  }

  getTool(): Message[] {
    return this.getByRole('tool');
  }

  replaceAll(messages: Message[]): void {
    this.messages = messages;
  }

  clear(): void {
    this.messages = [];
  }
}
