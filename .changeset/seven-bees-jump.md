---
'@minimal-harness/core': minor
'@minimal-harness/telegram': minor
---

Add userId/channelId to HarnessContext, ToolContext, and PermissionCheckContext

Telegram handler now passes userId and channelId when calling harness.run().
Removed module-level `_currentChatId` in send-media.ts in favor of context.channelId.
