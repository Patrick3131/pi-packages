---
owner: platform-engineering
last_verified: 2026-08-19
applies_to: packages/pi-workspaces/**
inherits_from: ../../AGENTS.md
canonical_for: Melon Workspaces Pi Web plugin conventions
---

# Melon Workspaces — AGENTS.md

- Keep this a browser-only Pi Web plugin; Git workspace ownership stays with
  Pi Web's bundled Git provider.
- Run all repository mutations through `melon-worktree`.
- Run Codex only through `melon-codex`; never expose Docker or Codex secrets.
- Validate and shell-quote every user-controlled value.
- Keep the browser root free of credentials and private configuration.
