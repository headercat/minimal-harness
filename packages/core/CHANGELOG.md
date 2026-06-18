# @minimal-harness/core

## 0.1.1

### Patch Changes

- e565832: fix(core): add timeouts, retry with backoff, MCP crash handling, and JSON parse safety
  fix(telegram): fix concurrent history overwrite, flush race, timer leak, and group chat context mixing

## 0.1.0

### Minor Changes

- c353cf9: Add userId/channelId to HarnessContext, ToolContext, and PermissionCheckContext

  Telegram handler now passes userId and channelId when calling harness.run().
  Removed module-level `_currentChatId` in send-media.ts in favor of context.channelId.

### Patch Changes

- 6843cb3: initial 0.0.1
