import type {
  Tool,
  LLMResponse,
  Message,
} from './tool/types.js';
import { ToolSchemaValidationError } from './tool/types.js';
import { z } from 'zod';
import { ToolRegistry } from './tool/registry.js';
import { SkillInjector, type SkillInjectorConfig } from './skill/injector.js';
import { MCPManager, type MCPServerConfig } from './mcp/client.js';
import { PermissionManager, type PermissionChecker } from './permission/manager.js';
import { MessageHistory } from './message.js';

export interface HarnessConfig {
  systemPrompt?: string;
  llm: (
    messages: Message[],
    tools: Tool[],
  ) => Promise<LLMResponse>;
  tools?: Tool[];
  skills?: SkillInjectorConfig;
  mcp?: MCPServerConfig[];
  permissions?: PermissionChecker;
  maxIterations?: number;
}

export interface HarnessResult {
  messages: Message[];
  output: string;
}

export interface HarnessContext {
  ask?: (question: string) => Promise<string>;
  onToolCall?: (call: { name: string; params: Record<string, unknown> }) => void;
}

export class Harness {
  readonly config: HarnessConfig;
  private toolRegistry = new ToolRegistry();
  private permissionManager?: PermissionManager;
  private skillInjector?: SkillInjector;
  private mcpManager?: MCPManager;

  constructor(config: HarnessConfig) {
    this.config = config;

    if (config.tools) {
      this.toolRegistry.registerMany(config.tools);
    }

    if (config.permissions) {
      this.permissionManager = new PermissionManager(config.permissions);
    }

    if (config.skills) {
      this.skillInjector = new SkillInjector(config.skills);
    }

    if (config.mcp && config.mcp.length > 0) {
      this.mcpManager = new MCPManager(config.mcp);
    }
  }

  async run(input: string, context?: HarnessContext): Promise<HarnessResult> {
    const ask =
      context?.ask ??
      (async () => {
        throw new Error('No ask handler configured');
      });
    const onToolCall = context?.onToolCall;
    const maxIter = this.config.maxIterations ?? 25;
    const history = new MessageHistory();

    let systemPrompt = this.config.systemPrompt ?? '';
    if (this.skillInjector) {
      systemPrompt = await this.skillInjector.build(systemPrompt);
    }

    await this.mcpManager?.connect();
    if (this.mcpManager) {
      const mcpTools = await this.mcpManager.fetchTools();
      for (const t of mcpTools) {
        const name = t.name;
        this.toolRegistry.register({
          name,
          description: t.description,
          inputSchema: z.object({}),
          parameters: t.parameters,
          handler: async (params) => {
            const slashIdx = name.indexOf('/');
            if (slashIdx === -1) throw new Error('Invalid MCP tool name');
            const serverLabel = name.slice(0, slashIdx);
            const toolName = name.slice(slashIdx + 1);
            return this.mcpManager!.callTool(serverLabel, toolName, params as Record<string, unknown>);
          },
        });
      }
    }

    if (systemPrompt) {
      history.addSystem(systemPrompt);
    }
    history.addUser(input);

    for (let i = 0; i < maxIter; i++) {
      const tools = this.toolRegistry.getAll();
      const messages = history.getAll();

      const response = await this.config.llm(messages, tools);

      const content = typeof response.content === 'string' ? response.content : undefined;
      const rawCalls = response.tool_calls;
      const toolCalls = Array.isArray(rawCalls) ? rawCalls : undefined;

      if (!toolCalls || toolCalls.length === 0) {
        history.addAssistant(content);
        return {
          messages: history.getAll(),
          output: content ?? '',
        };
      }

      history.addAssistant(content, toolCalls);

      for (const tc of toolCalls) {
        onToolCall?.({ name: tc.name, params: tc.arguments });

        try {
          await this.permissionManager?.check(tc.name, tc.arguments, {
            messages: history.getAll(),
            harness: this,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Permission denied';
          history.addToolResult(tc.id, `[Permission denied] ${reason}`);
          continue;
        }

        try {
          const result = await this.toolRegistry.execute(tc.name, tc.arguments, {
            ask,
            messages: history.getAll(),
            harness: this,
          });
          history.addToolResult(
            tc.id,
            typeof result === 'string' ? result : JSON.stringify(result),
          );
        } catch (err) {
          if (err instanceof ToolSchemaValidationError) {
            history.addToolResult(tc.id, `[Invalid arguments]\n${err.message}`);
          } else {
            const reason = err instanceof Error ? err.message : 'Unknown error';
            history.addToolResult(tc.id, `[Error] ${reason}`);
          }
        }
      }
    }

    return {
      messages: history.getAll(),
      output: 'Max iterations reached',
    };
  }
}
