# Inline actions

Change the model, thinking level, tool set, or preset **from anywhere in the
prompt you are already writing** — no rewind, no cleared draft.

```
fix the failing test $model:anthropic/claude-opus-4-5 and keep the API stable
```

The `$…` directive is applied before the turn starts and removed from your
message, so the model never sees it and your sentence reaches it intact.

## Syntax

| Directive | Effect |
|---|---|
| `$model:<provider/model>` or `$model:<model-id>` | Switch the model for this session |
| `$model:` | Open a model picker |
| `$thinking:<level>` | Set the thinking level (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`) |
| `$thinking:` | Open a level picker |
| `$tools:+name,-name` | Add and remove tools, comma separated |
| `$tools:` | Open a tool toggle picker |
| `$preset:<name>` | Apply a preset |
| `$preset:` | Open a preset picker |

Rules:

- **The colon is required.** A bare `$model` stays an ordinary mention token, so
  prose and shell text (`$files`, `$HOME`) is never rewritten.
- A directive alone in the prompt applies and sends nothing.
- Several directives in one message all apply, in order.
- Escape with a backslash (`\$model:opus`) to leave the text literal.
- Anything that does not resolve (unknown model, tool, preset) is reported and
  removed rather than sent to the model.
- Picker forms need an idle, dialog-capable session. In a steered message,
  print mode, or JSON mode they report the required argument instead.
- Every picker takes a filter: type to narrow by fuzzy match (model id, tool name,
  preset name), ↑↓ to move, Enter to pick, Esc to cancel. The active entry carries
  a ✓. Non-TUI clients fall back to Pi's plain selector.

## Autocomplete

`$` opens one list: the four action names first, then whatever the stacked
provider offers — skills from `$skill-name`, then Pi's built-in completions.
After `$model:` the list shows available models, `$tools:+` shows tools to
enable, `$tools:-` shows only active tools, and `$preset:` shows preset names.

Choosing a bare action (`$model:`) applies it immediately: the editor closes its
list when an item is chosen, so the value comes from that action's picker, opened
over the draft. The `$` token is removed and your sentence stays as it was —
typing `$model:` by hand and pressing Enter does the same.

A typed argument keeps the inline list: every keystroke re-asks it, so
`$tools:w` narrows to `web_search`. The colon is a trigger character, so the
argument list opens as soon as `$tools:` is typed.

## Related

- `$skill-name` skill mentions are a separate, independent feature.
- `/preset`, `/tools`, and `/model` still work as commands; this feature exists
  because a command needs the editor to itself.
