---
owner: repo-maintainers
last_verified: 2026-11-05
applies_to: packages/pi-toolkit/src/features/inline-actions/**
inherits_from: ../../../AGENTS.md
canonical_for: pi-toolkit inline actions conventions
---

# pi-inline-actions — AGENTS.md

## Purpose

Change model, thinking level, tools, or preset from inside a prompt that is
still being written, by applying a `$` directive in the `input` handler and
removing it from the message before the run starts.

## Scope

- `src/actions.ts` — pure grammar and item shaping: token detection, directive
  parsing/removal, tool-change parsing, suggestion lists. No pi API, no I/O.
- `src/index.ts` — the only place that touches pi: applying directives through
  `pi.setModel` / `setThinkingLevel` / `setActiveTools`, pickers via
  `ctx.ui.select`, and the stacked autocomplete wrapper.
- `../presets/registry.ts` — the bridge used for `$preset:`; do not import the
  presets implementation.

## Rules

- **The `$` spelling is the only inline form.** Built-in interactive commands
  (`/model`, `/settings`) cannot be dispatched from an extension, and their
  slash form is a strict prefix parser. Do not try to intercept `/model`.
- **Require the colon for directives.** A bare `$name` belongs to skill
  mentions and to shell text. `$model` must never be rewritten.
- **Apply before the run, strip before the model.** The directive is state
  change, not context: it must not reach the provider, and every other byte of
  the prompt must survive byte-for-byte.
- **Never leave a resolved directive in the prompt.** Unresolvable directives
  are reported and also removed; sending `$model:nope` to the model is worse
  than telling the user it was ignored.
- **Fail open.** Skip `event.source === "extension"`, return `continue` unless a
  complete directive is present, and never mutate state for a token that does
  not parse.
- **Pickers need an idle, dialog-capable session.** Gate them on
  `ctx.hasUI && event.streamingBehavior === undefined`; a steered message must
  never block on a dialog.
- **No argument form on a non-action name.** `$skill:x` is not ours; delegate it
  rather than answering with an empty list.
- **Merge, never replace, the `$` list.** Return the stacked provider's items
  after the action names, and delegate tokens this feature does not own so
  `@path` attachments, `/commands`, and skill mentions keep working.
- **Keep completion values fully qualified** (`$model:provider/id`), because the
  editor replaces the whole token with the item value and only the item knows
  the action.
- **A bare action name is a picker, not a completion.** `bareActionName()` marks the
  entries that have no argument yet (`$model:`); completing one would leave a token
  the editor never re-opens, so the picker answers it and the token is removed.
- **Gate the chained picker on `hasUI` and `isIdle()`.** A picker over a running turn
  is worse than the token staying in the draft, which is the fallback.
- **Do not import another feature's implementation.** The package advertises
  independently filterable entry points; `presets/registry.ts` is the sanctioned
  exception because it is a runtime handshake, not an implementation import.
- Feature-specific limits (argument list size, description truncation) live in
  `actions.ts` so the pure tests cover them.

## Commands

```bash
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

## Change Policy

- Update `README.md` and `CONTEXT.md` together when syntax, completion behavior,
  or the applied actions change.
- A new action needs: an entry in `ACTIONS`, an argument list in
  `actionArgSuggestionItems`, an apply branch in `index.ts`, and a test for both.
