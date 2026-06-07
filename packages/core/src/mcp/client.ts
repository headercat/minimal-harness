import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface MCPServerConfig {
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface ServerConnection {
  process: ChildProcess;
  tools: MCPToolDefinition[];
  send: (method: string, params?: Record<string, unknown>) => Promise<MCPResponse>;
  label: string;
}

export class MCPManager {
  private servers: ServerConnection[] = [];
  private configs: MCPServerConfig[];
  private nextId = 1;

  constructor(configs: MCPServerConfig[]) {
    this.configs = configs;
  }

  async connect(): Promise<void> {
    for (const cfg of this.configs) {
      if (cfg.transport === 'stdio') {
        const conn = await this.connectStdio(cfg);
        this.servers.push(conn);
      }
    }
  }

  private connectStdio(cfg: MCPServerConfig): Promise<ServerConnection> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cfg.command!, cfg.args ?? [], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const rl = createInterface({ input: proc.stdout! });
      const pending = new Map<number, (res: MCPResponse) => void>();

      rl.on('line', (line) => {
        try {
          const parsed = JSON.parse(line) as MCPResponse;
          const resolve = pending.get(parsed.id);
          if (resolve) {
            pending.delete(parsed.id);
            resolve(parsed);
          }
        } catch {
          /* skip malformed lines */
        }
      });

      proc.on('error', reject);

      const label = cfg.command ?? 'unknown';
      const send = (method: string, params?: Record<string, unknown>) => {
        const id = this.nextId++;
        return new Promise<MCPResponse>((resolve) => {
          pending.set(id, resolve);
          proc.stdin!.write(
            JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
          );
        });
      };

      send('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
      })
        .then((res) => {
          if (res.error) throw new Error(res.error.message);
          return send('tools/list');
        })
        .then((res) => {
          if (res.error) throw new Error(res.error.message);
          const tools = (res.result?.tools as MCPToolDefinition[]) ?? [];
          resolve({ process: proc, tools, send, label });
        })
        .catch(reject);
    });
  }

  async fetchTools(): Promise<
    { name: string; description: string; parameters: Record<string, unknown> }[]
  > {
    const result: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }[] = [];
    for (const conn of this.servers) {
      for (const tool of conn.tools) {
        result.push({
          name: `${conn.label}/${tool.name}`,
          description: tool.description ?? '',
          parameters: tool.inputSchema as Record<string, unknown>,
        });
      }
    }
    return result;
  }

  async callTool(
    serverLabel: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const conn = this.servers.find((s) => s.label === serverLabel);
    if (!conn) throw new Error(`MCP server not found: ${serverLabel}`);

    const res = await conn.send('tools/call', {
      name: toolName,
      arguments: args,
    });

    if (res.error) throw new Error(res.error.message);
    return res.result;
  }

  disconnect(): void {
    for (const conn of this.servers) {
      conn.process.kill();
    }
    this.servers = [];
  }
}
