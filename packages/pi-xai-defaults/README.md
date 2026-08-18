# pi-xai-defaults

Turns selected **pi-xai-oauth** extras on automatically when the model is Grok
(`xai-auth` or built-in `xai`).

If the project has `.pi/tools.json`, this package does nothing. Use that file
(and `s` in `/tools`) instead.

Otherwise edit the JSON below. Use `true` / `false` only.

## Config

Searched in order, later file overrides matching keys:

1. `~/.pi/agent/xai-defaults.json`
2. `<cwd>/.pi/xai-defaults.json`

```json
{
  "enabled": true,
  "tools": {
    "web_search": true,
    "xai_generate_text": true,
    "xai_x_search": true,
    "xai_multi_agent": true,
    "xai_deep_research": true,
    "xai_code_execution": true,
    "xai_generate_image": true,
    "xai_edit_image": true,
    "xai_image_to_video": false,
    "xai_analyze_image": true,
    "xai_critique": true
  }
}
```

- `enabled: false` turns the whole hook off.
- Omitted tools stay **on** (same as no file).
- `0` / `1` / `"true"` are rejected. Use booleans.
- `web_search`, `xai_web_search`, and `xai_grok_web_search` are the same key.

Copy `xai-defaults.example.json` from this package, or
`pi-packages/configs/global/xai-defaults.json`.

## Install

```bash
pi install /absolute/path/to/pi-packages/packages/pi-xai-defaults
```

Requires `npm:pi-xai-oauth`. Reload Pi after changing the JSON.

`/xai-tools disable <name>` still works for the current session. The next Grok
session or model switch reapplies this file.
