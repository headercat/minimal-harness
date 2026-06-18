# @minimal-harness/telegram

## 0.2.0

### Minor Changes

- c76985a: Add reply-to message context for Telegram bot

  When a user replies to a message in Telegram, the replied-to message
  text/caption is now prepended as context to the user's input, enabling
  the LLM to understand what the user is referring to.

### Patch Changes

- 5df2bb7: Sanitize bot token from fetch error messages and auto-restart runner on crash

## 0.1.0

### Minor Changes

- c353cf9: Add userId/channelId to HarnessContext, ToolContext, and PermissionCheckContext

  Telegram handler now passes userId and channelId when calling harness.run().
  Removed module-level `_currentChatId` in send-media.ts in favor of context.channelId.

### Patch Changes

- 6843cb3: initial 0.0.1
- Updated dependencies [6843cb3]
- Updated dependencies [c353cf9]
  - @minimal-harness/core@0.1.0
