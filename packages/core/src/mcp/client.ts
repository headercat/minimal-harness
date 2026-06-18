import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

const MCP_TIMEOUT_MS = 30_000;

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

type PendingEntry = {
  resolve: (res: MCPResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

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
  private labelSeq = new Map<string, number>();

  constructor(configs: MCPServerConfig[]) {
    this.configs = configs;
  }

  async connect(): Promise<void> {
    if (this.servers.length > 0) return;
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

      proc.stderr!.on('data', (chunk: Buffer) => {
        process.stderr.write(`[mcp stderr] ${chunk.toString().trim()}\n`);
      });

      const rl = createInterface({ input: proc.stdout! });
      const pending = new Map<number, PendingEntry>();
      let closed = false;

      const failAllPending = (reason: string) => {
        closed = true;
        for (const [id, entry] of pending) {
          clearTimeout(entry.timer);
          entry.reject(new Error(reason));
        }
        pending.clear();
      };

      proc.on('error', reject);
      proc.on('exit', (code) => {
        failAllPending(`MCP process exited with code ${code}`);
      });

      rl.on('line', (line) => {
        try {
          const parsed = JSON.parse(line) as MCPResponse;
          const entry = pending.get(parsed.id);
          if (entry) {
            clearTimeout(entry.timer);
            pending.delete(parsed.id);
            entry.resolve(parsed);
          }
        } catch {
          process.stderr.write(`[mcp] skip malformed: ${line.slice(0, 200)}\n`);
        }
      });

      const baseLabel = cfg.command ?? 'unknown';
      const seq = (this.labelSeq.get(baseLabel) ?? 0) + 1;
      this.labelSeq.set(baseLabel, seq);
      const label = seq > 1 ? `${baseLabel}_${seq}` : baseLabel;

      const send = (method: string, params?: Record<string, unknown>) => {
        if (closed) return Promise.reject(new Error('MCP server connection closed'));
        const id = this.nextId++;
        return new Promise<MCPResponse>((resolve, rejectPromise) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            rejectPromise(new Error(`MCP request timed out after ${MCP_TIMEOUT_MS}ms: ${method}`));
          }, MCP_TIMEOUT_MS);
          pending.set(id, { resolve, reject: rejectPromise, timer });
          proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
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
