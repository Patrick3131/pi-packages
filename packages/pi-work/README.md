# pi-work

Pi package for **docs-as-work**: structured work-item documents, operator skills, a project scaffold, and a `/work` browse-and-act wizard.

Not tied to any specific product repo. Defaults use `docs/work/`, and paths are configurable.

## What you get

| Piece | Role |
|-------|------|
| **Skills** | Create, execute, and optionally compose work-package workflows |
| **Extension** | `/work` wizard to list, inspect, and hand off work packages |
| **Templates** | Primary, to-do, and test-plan templates plus a risk-based testing policy |
| **Scaffold** | `docs/work/{work,finished}` + `AGENTS.md` / `CONTEXT.md` / `README.md` |

## Install

### Local path (development)

```bash
pi install /absolute/path/to/pi-packages/packages/pi-work
# or project-local:
pi install -l /absolute/path/to/pi-packages/packages/pi-work
```

### From this monorepo once published

```bash
pi install npm:pi-work
```

Pi loads:

- extension: `./src/index.ts`
- skills: `./skills/**/SKILL.md`

## Quick start

```bash
# In a project
/work init          # create docs/work structure
/work new           # create a structured work package from conversation
/work               # browse open packages
/work finished      # browse finished packages
/work plan-implement "add export csv" # plan, checkpoint, and implement
```

### `/work` actions

After selecting a package:

1. **Read primary** — send a read/summarize prompt for the primary doc
2. **Read full package** — primary + to-do + test
3. **Inject paths** — put package paths into chat as active context
4. **Implement** — hand off to `implement-tdd-review-runner`

### Subcommands

| Command | Description |
|---------|-------------|
| `/work` | Browse open work (grouped by type in the view) |
| `/work open [query]` | Open only, optional filter |
| `/work finished [query]` | Finished archive |
| `/work all [query]` | Both lifecycles |
| `/work init` | Scaffold structure (never overwrites existing files) |
| `/work new [topic]` | Create package via planning skill |
| `/work plan [topic]` | Alias of `new` |
| `/work plan-implement [topic]` | Plan, commit docs, implement |
| `/work help` | Help text |

## Work package convention

Implementation-ready work is **three files** with the same dated base name:

```text
docs/work/work/YYYY-MM-DD-<type>-<slug>.md
docs/work/work/YYYY-MM-DD-<type>-<slug>-to-do-list.md
docs/work/work/YYYY-MM-DD-<type>-<slug>-test.md
```

On completion, move all three to `docs/work/finished/`.

## Philosophy

`pi-work` treats documents as an executable contract, not a project diary:

- the primary document explains why the work exists, what is in scope, and how success is observed;
- the to-do companion tracks meaningful deliverables and validation, not every edit;
- the test plan records material risks, the cheapest proof for each risk, and what is intentionally not tested;
- skills provide the procedure, while templates provide a stable shape and the extension enforces readiness before handoff.

This division keeps the skills concise without making the resulting work vague. The agent still exercises judgment, but it must express that judgment through acceptance criteria, explicit assumptions, and a coverage decision.

## Templates and testing policy

The planning skill uses the bundled resources under `skills/_shared/`:

- `templates/work-item.md`
- `templates/to-do-list.md`
- `templates/test-plan.md`
- `testing-policy.md`

The testing policy is intentionally risk-based. It allows `No automated test needed`, asks the agent to inspect existing coverage first, uses one cheapest stable layer per failure mode, and defaults to zero to three new automated cases. More cases require distinct named risks. Tests for compiler guarantees, framework behavior, mocks, test helpers, source structure, exact copy, CSS classes, trivial prop forwarding, or duplicate layers are explicitly out of scope.

### Frontmatter

```md
---
status: idea|backlog|in_progress|done|obsolete
owner: engineering
last_reviewed: YYYY-MM-DD
canonical_ref: none
---
```

## Skill injection

Operator skills use `disable-model-invocation: true`. Pi does **not** expand `/skill:…` for extension-injected `sendUserMessage` calls, so `/work` embeds the full skill body in a Pi-compatible block:

```xml
<skill name="…" location="…">
References are relative to ….

…SKILL.md body…
</skill>

…user args…
```

## Implementation readiness

- All packages share one open folder and one finished folder.
- **Type is metadata** (UI grouping only) — no type subfolders.
- `/work` Implement is gated on readiness:
  - three-file package present
  - not `idea` intake
  - `triage` only when classified enough to execute
  - no blocking Open Questions
- User-facing skill outcomes: **COMPLETE** or **BLOCKED** (continuation is internal).

## Configuration

| Variable | Default | Meaning |
|----------|---------|---------|
| `PI_WORK_ROOT` | `docs/work` | Work root relative to project cwd |
| `PI_WORK_OPEN_DIR` | `work` | Open items directory under root |
| `PI_WORK_FINISHED_DIR` | `finished` | Finished items directory under root |

## Skills (operator-only)

All three skills set `disable-model-invocation: true` so they are not auto-injected into the system prompt. Direct skill commands remain available:

- `/skill:task-and-plan-routing`
- `/skill:implement-tdd-review-runner`
- `/skill:plan-and-implement-runner`
- or `/work` handoffs

`/work` handoffs embed the full skill body because extension-injected messages do not expand `/skill:` commands. Skills are **generic**; optional project chains are used when present:

- `.pi/agents/work-item-creation.chain.md`
- `.pi/agents/implement-tdd-review.chain.md`

## Development

```bash
cd packages/pi-work
npm install
npm test
npm run typecheck
```

## Design notes

- **Documents** encode the work contract; **templates** constrain shape; **skills** encode procedure; **extension** is the operator console.
- **Readiness** is shared by the UI and handoff prompts so an incomplete or intake package is visible before implementation begins.
- **Testing** is driven by material risk rather than code-change volume.
- Discovery groups companions by basename (including topic subfolders).
- Scaffold never overwrites existing project files.
- No product-specific paths or branding in runtime code or skills.
