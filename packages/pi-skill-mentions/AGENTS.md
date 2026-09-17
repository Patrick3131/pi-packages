---
owner: repo-maintainers
last_verified: 2026-09-17
applies_to: packages/pi-skill-mentions/**
inherits_from: ../../AGENTS.md
canonical_for: pi-skill-mentions package conventions
---

# pi-skill-mentions — AGENTS.md

## Purpose

Let one message reference several skills, from anywhere in the message, by
rewriting `$<name>` mentions into Pi's own skill block format, and
complete those mentions in the editor.

## Scope

- `src/mentions.ts` — pure parse/expand logic, injected `read`, no pi API
- `src/autocomplete.ts` — pure token detection/ranking/insertion, no pi or TUI API
- `src/index.ts` — the only place that touches pi: skill index from
  `pi.getCommands()`, `input` handler, autocomplete wrapper, `/skill-mentions`
- `test/` — node:test unit tests

## Rules

- **Never expand a leading `/skill:` mention.** Pi expands it after the `input`
  event; doing it here too would nest skill blocks inside each other.
- **Stay strict about `$`.** A `$` token is a mention only at a token boundary and
  only with a lowercase, letter-leading name; it expands only when the name is a
  loaded skill. Never warn about an unresolved `$` token — prompts contain shell
  variables, and those are not failed lookups. Reserve warnings for the explicit
  `/skill:<name>` spelling and for read failures.
- **Match Pi's block format exactly** (`formatSkillBlock`): a divergence silently
  changes skill semantics, and the format is the contract with Pi core.
- Use Pi's own `stripFrontmatter` export rather than reimplementing frontmatter
  parsing.
- Prefer mentions over rewriting the whole message: text outside a mention must
  reach the agent byte-for-byte.
- A mention that cannot be expanded is **left as written**; never drop user text.
- Skip `event.source === "extension"`: extension-injected messages embed their
  own skill bodies already (`pi-work` does this).
- Read the skill index live from `pi.getCommands()` on each input instead of
  caching: `/reload`, project trust, and package changes must not require extra
  bookkeeping.
- Keep the `input` handler synchronous and cheap; bail out before building the
  index when the text cannot contain a mention.
- **Stack, never replace, the autocomplete provider.** Always call `current.*`
  for tokens this package does not own, so `@path` attachments, `/commands`, and
  other extensions' completions keep working.
- **Fall through when no skill matches a `$` fragment.** The token is not ours in
  that case; other `$` completion providers must still get a chance.
- Register provider wiring from `session_start`; Pi clears its wrapper list per
  session, so this stays idempotent across `/reload` and session switches.
- Never import `@earendil-works/pi-tui` as a runtime value in the pure modules;
  it is a peer dependency for types only.

## Commands

```bash
npm test --workspace=packages/pi-skill-mentions
npm run typecheck --workspace=packages/pi-skill-mentions
```

## Change Policy

- Update `README.md` and `CONTEXT.md` together when syntax, completion behavior,
  or commands change.
- Keep the package free of any dependency on other pi-packages packages.
