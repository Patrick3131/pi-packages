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

## Autocomplete

`$` opens one list: the four action names first, then whatever the stacked
provider offers — skills from `$skill-name`, then Pi's built-in completions.
After `$model:` the list shows available models, `$tools:+` shows tools to
enable, `$tools:-` shows only active tools, and `$preset:` shows preset names.

Every keystroke re-asks the list, so the argument picker appears once the
argument has at least one character: `$tools:w` narrows to `web_search`.

## Related

- `$skill-name` skill mentions are a separate, independent feature.
- `/preset`, `/tools`, and `/model` still work as commands; this feature exists
  because a command needs the editor to itself.
