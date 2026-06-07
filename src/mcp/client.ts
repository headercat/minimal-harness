export interface MCPServerConfig {
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
}

export class MCPManager {
  constructor(servers: MCPServerConfig[]) {
    void servers;
    throw new Error('Not implemented');
  }

  async connect(): Promise<void> {
    throw new Error('Not implemented');
  }

  async fetchTools(): Promise<{ name: string; description: string; parameters: Record<string, unknown> }[]> {
    throw new Error('Not implemented');
  }
}
