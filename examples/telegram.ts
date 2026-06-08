import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractSystemMessage, toMessages, toTools } from '@minimal-harness/ai-sdk';
import { getSystemMessages, Harness, loadSkills } from '@minimal-harness/core';
import type { PermissionCheckContext } from '@minimal-harness/core';
import { createTelegramBot } from '@minimal-harness/telegram';
import {
  bashTool,
  editTool,
  globTool,
  grepTool,
  readdirTool,
  readTool,
  webFetchTool,
  writeTool,
} from '@minimal-harness/tools';
import { streamText } from 'ai';

const model = createOpenAICompatible({
  name: 'AI model',
  baseURL: process.env.OPENAI_BASE_URL!,
  apiKey: process.env.OPENAI_API_KEY!,
}).chatModel(process.env.OPENAI_MODEL_ID!);

const harness = new Harness({
  systemPrompt: 'You are a helpful assistant running on Telegram.',
  llm: async (messages, tools, { onStream } = {}) => {
    const system = extractSystemMessage(messages);

    const result = streamText({
      model,
      system,
      messages: toMessages(messages),
      tools: toTools(tools),
    });

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
      onStream?.(chunk);
    }

    return {
      content: fullText.trim() || undefined,
      tool_calls: (await result.toolCalls)?.map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.input as Record<string, unknown>,
      })),
    };
  },
  skills: {
    resolve: () => loadSkills('./skills/**/*.md'),
  },
  tools: [
    bashTool(),
    webFetchTool(),
    editTool(),
    readTool(),
    writeTool(),
    globTool(),
    grepTool(),
    readdirTool(),
  ],
  compress: async (messages, { harness }) => {
    const totalLen = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
    if (totalLen < 40_000) return messages;

    const res = await harness.config.llm(
      [{ role: 'system', content: 'Summarize the following conversation concisely.' }, ...messages],
      [],
    );

    return [
      ...getSystemMessages(messages),
      { role: 'user', content: `[Previous conversation summary]\n${res.content}` },
    ];
  },
  permissions: async (name, params, context) => {
    const { confirm } = context as PermissionCheckContext;
    const sensitive = ['bash', 'write', 'edit'];
    if (sensitive.includes(name)) {
      const approved = await confirm?.(
        `Allow \`${name}\` with:\n\`\`\`\n${JSON.stringify(params, null, 2)}\n\`\`\``,
      );
      if (!approved) throw new Error('User denied the request');
    }
  },
});

const bot = createTelegramBot({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  harness,
  typingInterval: 3000,
});

console.log('Starting Telegram bot...');
bot.start().then();
