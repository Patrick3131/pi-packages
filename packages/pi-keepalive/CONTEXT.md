---
owner: repo-maintainers
last_verified: 2026-08-19
applies_to: packages/pi-keepalive/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-keepalive architecture
---

# pi-keepalive — Context

`src/index.ts` wires Pi lifecycle events to `KeepaliveController`. The
controller owns one-shot timers and sends an actual user message through
`pi.sendUserMessage()` only after the agent is idle.

The default `on-error` mode arms a timer only when an assistant message ends
with `stopReason: "error"`. `always` mode is opt-in through
`PI_KEEPALIVE_MODE=always` or `/keepalive on`. All settings are generic and
provider-independent.
