import { Bot, InputFile } from 'grammy';
import { z } from 'zod';
import type { Tool, ToolContext } from '@minimal-harness/core';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);

function detectMediaType(filePath: string): 'photo' | 'video' | 'audio' | 'document' {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTS.has(ext)) return 'photo';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'document';
}

export function createTelegramMediaTool(config: { botToken: string }): Tool {
  const bot = new Bot(config.botToken);

  return {
    name: 'sendTelegramMedia',
    description:
      'Send an image, video, audio, or document file to a Telegram chat. ' +
      'Supports local file paths and remote URLs. Media type is auto-detected from file extension.',
    inputSchema: z.object({
      chatId: z
        .string()
        .optional()
        .describe(
          'Target chat ID. If omitted, sends to the chat that triggered the current request',
        ),
      filePath: z.string().describe('Local file path or http/https URL of the file to send'),
      type: z
        .enum(['photo', 'video', 'audio', 'document'])
        .optional()
        .describe('Media type. Auto-detected from file extension if not specified'),
      caption: z.string().optional().describe('Caption text for the media (max 1024 characters)'),
    }),
    handler: async (params, context) => {
      const {
        chatId: explicitChatId,
        filePath,
        type: explicitType,
        caption,
      } = params as {
        chatId?: string;
        filePath: string;
        type?: 'photo' | 'video' | 'audio' | 'document';
        caption?: string;
      };

      const targetChatId = explicitChatId ?? (context as ToolContext).channelId;
      if (!targetChatId) {
        throw new Error(
          'No chatId provided and no current chat context. ' +
            'Send the request via Telegram, or provide chatId explicitly.',
        );
      }

      const mediaType = explicitType ?? detectMediaType(filePath);
      const isUrl = filePath.startsWith('http://') || filePath.startsWith('https://');
      const file: string | InputFile = isUrl ? filePath : new InputFile(filePath);

      let result: { message_id: number };
      switch (mediaType) {
        case 'photo':
          result = await bot.api.sendPhoto(targetChatId, file, { caption });
          break;
        case 'video':
          result = await bot.api.sendVideo(targetChatId, file, { caption });
          break;
        case 'audio':
          result = await bot.api.sendAudio(targetChatId, file, { caption });
          break;
        default:
          result = await bot.api.sendDocument(targetChatId, file, { caption });
          break;
      }

      return {
        success: true,
        messageId: result.message_id,
        chatId: targetChatId,
        type: mediaType,
      };
    },
  };
}
