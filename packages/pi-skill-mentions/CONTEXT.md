# pi-skill-mentions — CONTEXT.md

## Purpose

Let one message reference several skills, from anywhere in the message. Package
rules live in `AGENTS.md`; this file explains the architecture.

## Why the mention syntax exists

Pi's own skill command is a strict prefix parser (`dist/core/agent-session.js`,
`_expandSkillCommand`):

```js
if (!text.startsWith("/skill:")) return text;
const spaceIndex = text.indexOf(" ");
const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
```

So `<one skill name> <everything else as args>`: one skill per message, only at
position 0. That is a sound design for a slash command and cannot be relaxed
without making the argument boundary ambiguous. `$<name>` sidesteps the
ambiguity because the mention carries its own delimiters, so the surrounding
prose needs no parsing rules.

`$` also carries no attachment meaning in Pi, unlike `@`, which the editor
already reserves for files. And it is cheap to trigger: the editor fires
registered trigger characters immediately, so a bare `$` is enough to open the
list — no follow-up letter, the way `@skill:` needed one.

## Flow

```
user sends prompt
        │
        ├─► extension commands checked (bypasses the input event)
        │
        ├─► input event                          pi-skill-mentions
        │     │  source === "extension" ? skip
        │     │  no "$" or "skill:" in the text ? skip
        │     │  skills ← pi.getCommands() where source === "skill"
        │     │    { name, sourceInfo.path, sourceInfo.baseDir }
        │     └─► expandSkillMentions: parse, read SKILL.md, strip frontmatter,
        │           replace mention with <skill …> body </skill>
        │
        ├─► Pi expands a leading /skill:<name>   (if the message had one)
        ├─► prompt templates
        └─► before_agent_start → agent
```

Ordering is why a leading `/skill:` is skipped here: Pi's expansion runs after
the `input` event, so expanding it in both places would nest blocks.

Autocomplete is a second, independent path over the same skill index:

```
editor keystroke
        │
        ├─► editor asks the stacked provider    (see below)
        │     │
        │     ├─► pi-skill-mentions: token before the cursor
        │     │     $ | $<frag> | /skill:<frag> after whitespace
        │     │       → { prefix: token, items: ranked skills }
        │     │       → no skill matches ? fall through
        │     │
        │     └─► built-in CombinedAutocompleteProvider
        │           @path attachments, /commands, paths
        │
        └─► accept → applyCompletion: replace the token, or delegate
```

Provider stacking order is `session_start` → `addAutocompleteProvider(factory)`,
where the factory receives the provider built so far and returns the wrapper Pi
uses. The editor resets the wrapper list per session, so registering on
`session_start` is idempotent across `/reload` and session switches.

## Modules

- `src/mentions.ts` — pure: mention parsing (with escape handling and positions),
  expansion, and Pi's block format. Takes `skills` plus an injected `read`, so
  every branch is unit-testable without pi or a filesystem.
- `src/autocomplete.ts` — pure: mention-token detection at the cursor, skill
  ranking, item shaping, and the token-replacing completion. No pi or TUI import;
  the item shape is structurally `AutocompleteItem`.
- `src/index.ts` — the only place that touches pi: builds the skill index from
  `pi.getCommands()`, wires the `input` handler and the autocomplete wrapper,
  registers `/skill-mentions`, reports problems via `ctx.ui.notify`.

## Decisions

- **Mentions, not a smarter prefix parser.** The message is rewritten only where
  a mention actually sits; every other byte is preserved, so the user's phrasing
  reaches the model intact.
- **No cache of the skill index.** `pi.getCommands()` already reflects loaded
  skills and survives `/reload`, project-trust changes, and package updates.
  Caching would need invalidation hooks for no measurable gain — the index is
  only built when the text contains a `$` or a `skill:`.
- **Deduplicate by name.** A skill body is large; expanding it twice in one
  message burns context for no signal, so later mentions degrade to the bare
  name.
- **An unresolved `$` is silent, an unresolved `/skill:` is not.** Prompts contain
  shell text (`$target`, `$files`), so warning about every unmatched `$` word
  would be noise; the `[a-z]`-leading, token-boundary rules already keep `$HOME`,
  `$1`, `$(…)` and `${…}` out of the parse entirely. The `/skill:<name>` spelling
  is an explicit request, so it is reported.
- **Fail open, never silently destroy.** Every unresolved mention leaves its text
  exactly as written, and a read failure is reported before the mention is
  skipped.
- **Skip extension-sourced input.** `pi-work` and similar packages embed full
  skill bodies themselves; rewriting those messages would double-expand.
- **Register `$` as a trigger character.** It is not a Pi built-in, and the editor
  fires trigger characters the instant they are typed, so bare `$` lists every
  skill. The consequence is that a mid-message `/skill:` still needs Tab, since
  `/` cannot be a trigger character.
- **Do not touch `@`.** `@` is Pi's attachment token; taking `@skill:` over would
  mean suppressing file completion for a token shape Pi owns. `$` has no such
  meaning.
- **Fall through when nothing matches.** An empty item list is a legitimate
  answer, but for `$` an unmatched fragment means "not ours", so the built-in and
  any other `$` provider still get their turn. This keeps `$HOME` quiet.
- **Own `applyCompletion` for mention tokens only.** The built-in `@` branch
  appends a trailing space (attachment semantics); a mention sits inside a
  sentence, so the token is replaced and the cursor is left right after the name.
- **`/skill-mentions` exists for discovery outside the editor.** Autocomplete is
  TUI-only; RPC and print sessions still need a way to see what is loaded.

## Boundaries

- No imports from other pi-packages packages.
- The only agent-facing surface is the `input` rewrite and the autocomplete
  wrapper; nothing is registered that could change tools or the system prompt.
- Autocomplete is interactive-TUI only. `addAutocompleteProvider` is a no-op in
  print and JSON modes; RPC has no editor. `/skill-mentions` covers those.
- No code-fence awareness: a `$<name>` inside a fenced block is still expanded.
  Escape it as `\$<name>`.
- `disable-model-invocation` skills are expanded like any other: the mention is
  an explicit user request, which is exactly what that flag reserves for the
  user.

## Verification

```bash
npm test --workspace=packages/pi-skill-mentions
npm run typecheck --workspace=packages/pi-skill-mentions
```

Manual check in a session with skills loaded:

```
Compare $pi-subagents with $find-skills and tell me which fits.
```

For the autocomplete path, the tests stub the built-in provider, so the editor
wiring was confirmed once by driving the real `Editor` from `pi-tui` with the
stacked provider and checking that a bare `$` renders the suggestion list,
that `$pl` filters it, and that Tab inserts the full name.
