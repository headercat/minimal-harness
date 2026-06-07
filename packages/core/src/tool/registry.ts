import type { Tool, ToolContext } from './types.js';
import { ToolSchemaValidationError } from './types.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions() {
    return this.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: (t.inputSchema?.toJSONSchema() ?? t.parameters) as Record<string, unknown>,
    }));
  }

  async execute(name: string, params: Record<string, unknown>, context: ToolContext) {
    const tool = this.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const parsed = tool.inputSchema.safeParse(params);
    if (!parsed.success) {
      throw new ToolSchemaValidationError(name, parsed.error.issues);
    }

    return tool.handler(params, context);
  }
}
