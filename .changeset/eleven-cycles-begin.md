---
'@minimal-harness/core': patch
'@minimal-harness/telegram': patch
---

fix(core): add timeouts, retry with backoff, MCP crash handling, and JSON parse safety
fix(telegram): fix concurrent history overwrite, flush race, timer leak, and group chat context mixing
