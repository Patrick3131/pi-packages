# pi-keepalive

A provider-independent Pi extension that retries a failed agent run later by
sending a normal user message (default: `continue`). It does not change
provider routing, credentials, or Pi's built-in retry behavior.

## Default behavior

The extension is safe to load globally: it is **armed only after an assistant
run ends with an error**. Ten minutes later, if Pi is idle, it sends `continue`.
A successful retry stops error recovery. A persistent provider 429 therefore
gets another chance without being retried in a tight loop, but this cannot make
an upstream provider available and may still consume requests.

## Installation

Install the monorepo package:

```bash
pi install git:github.com/Patrick3131/pi-packages
```

The root package manifest loads this extension. To load only this extension,
use a package filter in `settings.json`:

```json
{
  "packages": [
    {
      "source": "git:github.com/Patrick3131/pi-packages",
      "extensions": ["packages/pi-keepalive/src/index.ts"]
    }
  ]
}
```

After updating an installed checkout, run `/reload`.

## Configuration

Environment variables are read when Pi starts:

| Variable | Default | Meaning |
|---|---:|---|
| `PI_KEEPALIVE_INTERVAL_MS` | `600000` | Delay between messages (minimum 1000 ms) |
| `PI_KEEPALIVE_MESSAGE` | `continue` | User message to send |
| `PI_KEEPALIVE_MODE` | `on-error` | `on-error`, `always`, or `off` |
| `PI_KEEPALIVE_MAX_ATTEMPTS` | `0` | Automatic messages per session; `0` means unlimited |

For the original use case, no configuration is required. To send a message
every ten minutes even without an error:

```bash
PI_KEEPALIVE_MODE=always pi
```

## Commands

- `/keepalive status` — show current mode and retry state
- `/keepalive now` — send the configured message immediately if idle
- `/keepalive on` — enable continuous periodic messages for this session
- `/keepalive on-error` — arm retries after provider errors
- `/keepalive off` — disable timers for this session

The mode commands are session-only and do not modify environment variables.

## Development

```bash
npm test --workspace=packages/pi-keepalive
npm run typecheck --workspace=packages/pi-keepalive
```
