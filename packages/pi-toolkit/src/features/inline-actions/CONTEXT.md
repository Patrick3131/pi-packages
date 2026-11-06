# pi-inline-actions — CONTEXT.md

## Purpose

Let a `$` directive change session state from inside a prompt that is still being
written. Package rules live in `AGENTS.md`; this file explains the architecture.

## Why not a slash command

Pi's built-in commands are interactive-mode only and cannot be dispatched from an
extension, and the editor only opens the `/` menu at the start of the first line
(`isSlashMenuAllowed()` is `cursorLine === 0`). Their handler also owns the whole
prompt, so running `/model` from a half-written message would mean clearing it.

Three Pi facts shape the design instead:

1. **`input` fires before the run and can transform the text.** It runs before
   skill and template expansion, so an applied state change is in effect for the
   very next model request and the directive can be stripped from the message.
2. **`$` is a registered trigger character.** The editor asks for suggestions the
   instant it is typed at a token boundary, anywhere in the line. That is how one
   popup can serve both skill mentions and these actions.
3. **The model registry, tool set, thinking level and presets all have direct
   APIs** (`pi.setModel`, `pi.setActiveTools`, `pi.setThinkingLevel`, the preset
   runtime bridge). No command dispatch is needed.

## Flow

```
user presses enter on a message containing $model:<id>
        │
        ├─► extension commands        (only when the text starts with "/name")
        ├─► input event                              pi-inline-actions
        │     │  source === "extension" ? skip
        │     │  no "$" in the text ? skip
        │     │  parseDirectives → complete "$action:arg" tokens only
        │     │  apply each: setModel / setThinkingLevel / setActiveTools /
        │     │              preset runtime, or a picker when the arg is empty
        │     └─► remove the tokens, keep every other byte
        │
        ├─► input event (next extension)              skill mentions
        │     └─► "$skill-name" expands to a skill block
        │
        ├─► leading /skill:<name>, prompt templates
        └─► before_agent_start → agent (already using the new model/tools)
```

Autocomplete is an independent path over the same token grammar:

```
editor keystroke
        │
        ├─► stacked provider                         pi-inline-actions
        │     │  token before the cursor
        │     │    "$<fragment>"      → action names, then the stacked items
        │     │    "$<action>:<arg>"  → that action's arguments
        │     │    otherwise          → delegate untouched
        │     ├─► accept an action name → remove the token, open its picker
        │     └─► accept anything else → replace the token in place
        │
        └─► skill mentions wrapper → Pi's built-in provider
```

Provider stacking order follows extension load order, so `inline-actions` is
listed after `skill-mentions` in `pi.extensions` — the repository root manifest
for the Git resource, and this package's own manifest for a standalone install.
It wraps the skill provider and re-emits its items, which is what produces one
combined list. If the skill feature is filtered out, the wrapper sits directly on
Pi's built-in provider and the menu still works.

## Modules

- `src/actions.ts` — pure: cursor-token detection, directive parsing with offsets
  and prose-punctuation trimming, byte-preserving removal, tool-change parsing,
  action and argument item shaping. Item shape is structurally
  `AutocompleteItem`, so no TUI import is needed.
- `src/index.ts` — the only place that touches pi: the `input` handler, the
  pickers, the apply branches, and the autocomplete wrapper.
- `../presets/registry.ts` — `$preset:` needs the presets feature's stateful
  `applyPreset`, which lives in a closure. The registry is a runtime handshake:
  presets publishes `{ names, apply }` on load and clears it on shutdown, so this
  feature never imports the implementation and simply reports "not loaded" when
  the preset feature is filtered out.

- **A chosen action name opens a picker instead of completing text.** The editor
  closes its list on selection and only re-asks on the next keystroke, so
  `$model:` would otherwise leave a token nobody extends. The picker answers the
  argument step, applies it immediately, and the token leaves the draft.
- **Typing still works.** `$model:` typed by hand keeps the inline list (the
  colon is a trigger character, and every keystroke re-asks), so a written
  directive and a picked one reach the same state.

## Decisions

- **Colon-required grammar.** `$model:opus` is a directive; `$model` is not. This
  keeps shell variables and prose (`$files`, `$target`, `$HOME`) untouched, keeps
  the action from shadowing a skill of the same name, and makes "no argument →
  picker" unambiguous. The name group is optional in the token regex only so a
  bare `$` can open the combined menu.
- **Strip even when the action fails.** An unresolvable directive is reported and
  removed. Leaving `$model:nope` in the text would silently spend a turn on a
  malformed prompt; removing it keeps the promise that directives are never
  model input.
- **Directive-only prompt returns `handled`.** Changing the model and sending
  nothing is a legitimate use, and it must not start a turn with an empty prompt.
- **`handled` rather than `transform ""`.** Pi would otherwise treat the emptied
  message as a prompt.
- **Pickers are gated on idle + `hasUI`.** A steered message arrives while the
  agent is streaming; a modal dialog there is a worse failure than a warning.
- **`$tools:` uses `Set` semantics around the current set, not a replacement
  list.** Pi's `setActiveTools` replaces the whole loadout, so the current order
  is preserved and new tools are appended.
- **One directive per token, many per message.** Comma lists exist only inside a
  single `$tools:` directive; otherwise applying in message order is predictable.
- **Prose punctuation is not swallowed.** The directive regex requires the last
  argument character to be from a non-punctuation class, so `$model:opus.` leaves
  the sentence's period in place.
- **No display entry.** Nothing is appended to the transcript; the applied change
  is reported with `ctx.ui.notify` and is visible in the model picker, tool list,
  and footer.

## Boundaries

- No slash command is registered: `configs/global/toolkit-smoke.py` asserts the
  exact toolkit command set, and the `input` event covers the use case.
- Autocomplete is interactive-TUI only. The directive itself still applies in
  print, JSON and RPC sessions; only the argument lists and pickers degrade.
- No code-fence awareness, matching skill mentions: a `$model:x` inside a fenced
  block is still applied. Escape it as `\$model:x`.
- `$preset:` applies model, tools, thinking level and the preset's instructions
  through the existing preset runtime; it does not re-implement preset config
  loading.

## Verification

```bash
npm test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
```

Manual check in a session:

```
1. type "$"                     → menu: $model: $thinking: $tools: $preset: then skills
2. type "mo" + Tab              → "$model:"
3. type "opus" + Tab            → "$model:anthropic/claude-opus-4-5"
4. add a sentence and press enter → the model switches and only the sentence is sent
5. "$tools:" + enter            → tool toggle picker, no prompt sent
```

The tests stub the stacked provider and the pi API, so the editor wiring was
confirmed once by driving the real `Editor` from `pi-tui` and checking that a
bare `$` renders the merged list and that Tab inserts `$model:`.
