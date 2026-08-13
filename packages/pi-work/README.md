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

Pi loads this package via `package.json`:

- extension: `./src/index.ts`
- skills: `./skills`

## Quick start

```bash
# In a project
/work init          # create docs/work structure
/work new           # create a structured work package from conversation
/work               # browse open packages
/work finished      # browse finished packages
/work plan-implement "add export csv" # plan, checkpoint, and implement
```

Browsing open work offers to scaffold if the configured work root is missing.

### `/work` actions

After selecting a package:

1. **Read primary** — send a read/summarize prompt for the primary doc
2. **Read full package** — primary + to-do + test
3. **Inject paths** — put package paths into chat as active context
4. **Implement** — hand off to `implement-tdd-review-runner`

Implement is gated on readiness, but a not-ready or incomplete package can still be handed off after a confirm. Moving a completed package to `finished/` is done by the implementation skill, not by the wizard.

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
| `/work plan-implement [topic]` | Plan, optionally commit docs, then implement |
| `/work help` | Help text |

`/work` browsing needs an interactive UI. Without one, it lists packages instead of opening the select wizard.

## Work package convention

Implementation-ready work is **three files** with the same dated base name:

```text
docs/work/work/YYYY-MM-DD-<type>-<slug>.md
docs/work/work/YYYY-MM-DD-<type>-<slug>-to-do-list.md
docs/work/work/YYYY-MM-DD-<type>-<slug>-test.md
```

On `COMPLETE`, the implementation skill marks all three `done` and moves them together to the finished directory (`docs/work/finished/` by default). The `/work` wizard does not move files.

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
- Not-ready or incomplete packages still show Implement, labeled with the gate, and require a confirm before handoff.
- User-facing skill outcomes: **COMPLETE** or **BLOCKED** (continuation is internal).

## Configuration

No config file is required. Paths resolve in this order:

1. explicit options (tests / future settings)
2. `PI_WORK_*` environment variables
3. built-in defaults

| Variable | Default | Meaning |
|----------|---------|---------|
| `PI_WORK_ROOT` | `docs/work` | Work root, relative to project cwd unless absolute |
| `PI_WORK_OPEN_DIR` | `work` | Open items directory under the root |
| `PI_WORK_FINISHED_DIR` | `finished` | Finished items directory under the root |

Default layout when unset:

```text
docs/work/work/        # open packages
docs/work/finished/    # completed packages
docs/work/AGENTS.md
docs/work/CONTEXT.md
docs/work/README.md
```

Override only the pieces you need. For example, leaving the last two unset still uses `work` and `finished` under the root:

```bash
export PI_WORK_ROOT=docs/work
```

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
