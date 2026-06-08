import type { Tool, LLMResponse, Message } from './tool/types.js';
import { ToolSchemaValidationError } from './tool/types.js';
import { z } from 'zod';
import { ToolRegistry } from './tool/registry.js';
import { SkillInjector, type SkillInjectorConfig } from './skill/injector.js';
import { MCPManager, type MCPServerConfig } from './mcp/client.js';
import { PermissionManager, type PermissionChecker } from './permission/manager.js';
import { MessageHistory } from './message.js';

export type CompressStrategy = (
  messages: Message[],
  context: { harness: Harness },
) => Message[] | Promise<Message[]>;

export interface HarnessConfig {
  systemPrompt?: string;
  llm: (
    messages: Message[],
    tools: Tool[],
    options?: { onStream?: (chunk: string) => void },
  ) => Promise<LLMResponse>;
  tools?: Tool[];
  skills?: SkillInjectorConfig;
  mcp?: MCPServerConfig[];
  permissions?: PermissionChecker;
  maxIterations?: number;
  compress?: CompressStrategy;
}

export interface HarnessResult {
  messages: Message[];
  output: string;
}

export interface HarnessContext {
  onToolCall?: (call: { name: string; params: Record<string, unknown> }) => void;
  onStream?: (chunk: string) => void;
  onToolResult?: (call: { name: string }) => void;
  confirm?: (message: string) => Promise<boolean>;
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

  async run(
    input: string,
    context?: HarnessContext,
    existingMessages?: Message[],
  ): Promise<HarnessResult> {
    const onToolCall = context?.onToolCall;
    const onStream = context?.onStream;
    const onToolResult = context?.onToolResult;
    const confirm = context?.confirm;
    const maxIter = this.config.maxIterations ?? 25;
    const history = new MessageHistory(existingMessages?.filter((m) => m.role !== 'system'));

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
            return this.mcpManager!.callTool(
              serverLabel,
              toolName,
              params as Record<string, unknown>,
            );
          },
        });
      }
    }

    if (systemPrompt) {
      history.addSystem(systemPrompt);
    }
    history.addUser(input);

    for (let i = 0; i < maxIter; i++) {
      if (this.config.compress) {
        const compressed = await this.config.compress(history.getAll(), { harness: this });
        history.replaceAll(compressed);
      }

      const tools = this.toolRegistry.getAll();
      const messages = history.getAll();

      const response = await this.config.llm(messages, tools, {
        onStream: onStream,
      });

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
            confirm,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Permission denied';
          history.addToolResult(tc.id, `[Permission denied] ${reason}`);
          onToolResult?.({ name: tc.name });
          continue;
        }

        try {
          const result = await this.toolRegistry.execute(tc.name, tc.arguments, {
            messages: history.getAll(),
            harness: this,
          });
          history.addToolResult(
            tc.id,
            typeof result === 'string' ? result : JSON.stringify(result),
          );
          onToolResult?.({ name: tc.name });
        } catch (err) {
          if (err instanceof ToolSchemaValidationError) {
            history.addToolResult(tc.id, `[Invalid arguments]\n${err.message}`);
          } else {
            const reason = err instanceof Error ? err.message : 'Unknown error';
            history.addToolResult(tc.id, `[Error] ${reason}`);
          }
          onToolResult?.({ name: tc.name });
        }
      }
    }

    return {
      messages: history.getAll(),
      output: 'Max iterations reached',
    };
  }
}
