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

### From the canonical Git package

```bash
pi install git:github.com/Patrick3131/pi-packages
pi update --extensions
# /reload or start a fresh session after updating
```

Install the repository once, not alongside a second local pi-work install. Before enabling its skills, inventory same-name skills in user/project discovery roots, including `.pi/skills` and `.agents/skills`, and coordinate removal of maintained consumer copies only after duplicate-free host discovery succeeds. An old `!packages/pi-work/skills/**` settings filter must be removed separately; package updates and `/reload` alone do not migrate persisted settings.

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
- skills provide one host-neutral method, while templates provide a stable shape and the extension enforces readiness before handoff;
- repositories own scope, commands, permissions, architecture, specialist skills, and feature-specific work locations; supplied package paths and `PI_WORK_*` overrides are preserved;
- execution is direct by default. Only operator/instruction-authorized delegation uses bounded builtin handoffs with task-selected worker context (fork to reuse useful current investigation, fresh for a self-contained brief or to avoid noisy history) and fresh read-only independent reviewers; no scripts, phase agents, chains, registry, or new runtime are required. The parent verifies concise evidence and recovers from actual state rather than restarting completed phases.

The shared skills preserve operational detail without imposing a phase fleet. Small work stays direct; substantial independent slices can be implemented concurrently when authorised, then integrated and validated as one result. Detail is proportional to uncertainty and risk, not a fixed checklist of model calls.

### Direct or parallel sliced execution

Planning records independently observable outcomes, exclusive writable paths, shared-contract ownership, real prerequisite artifacts, per-slice validation and integrated acceptance. A table alone grants no delegation authority. With authority, the parent launches ready slices concurrently using existing builtin workers and separate writable checkouts, starts dependent slices only after their required contract/patch is available, and remains the single owner of package documents and integration.

Integration protects unrelated dirty/staged changes, accounts for each exact patch and stops on semantic conflicts. Validate the combined tree; successful child exit or isolated tests are insufficient. After interruption, inspect actual files and checkpoints, preserve successful work and resume only outstanding scope. Do not restart an entire phase fleet.

Optional procedures under `skills/_shared/procedures/` provide native composition examples, validation briefs and specialised review lenses. These are instructions, not a runtime or required panels. Workers receive relevant guidance explicitly; builtin roles do not automatically inherit parent skills. Validation checks execute without automatic source/test-expectation fixes, and reviewers inspect a stable tree. Choose readiness, correctness, test-quality or conventions lenses only for relevant risks.

The source-backed [capability disposition](skills/_shared/capability-recovery.md) records what was retained, recovered and retired. Functional checks establish contracts, not comparative speed or quality superiority; its benchmark guidance specifies how to make that comparison honestly.

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

The three core workflow skills and the auxiliary cleanup skill set `disable-model-invocation: true` so they are not auto-injected into the system prompt. Direct skill commands remain available:

- `/skill:task-and-plan-routing`
- `/skill:implement-tdd-review-runner`
- `/skill:plan-and-implement-runner`
- `/skill:work-note-cleanup` (auxiliary; no `/work` cleanup wizard)
- or `/work` handoffs for the three core workflows

Cleanup is retain-first and dry-run by default: protect canonical packages, unresolved decisions, source references and unique research. Offer promotion/linking first, obtain explicit approval for exact deletion paths, then recheck hashes/references/state before acting. Invoking cleanup is not deletion approval.

`/work` handoffs embed the full skill body because extension-injected messages do not expand `/skill:` commands. Both entry points use these exact canonical files. Available subagent tools alone never authorize delegation.

### Existing non-Pi hosts (no maintained copies)

For Codex, link from its user-level `~/.codex/skills` discovery root to the **installed Git package**, not a second source checkout. Verify the installed path with `pi list` and the actual checkout before setting `installed_skills`. For the default Pi agent directory, the current checkout layout is:

```bash
installed_skills="$HOME/.pi/agent/git/github.com/Patrick3131/pi-packages/packages/pi-work/skills"
# Adjust for the verified installation / PI_CODING_AGENT_DIR.
# Check existing targets first; do not overwrite same-name skills or links.
mkdir -p "$HOME/.codex/skills"
for name in task-and-plan-routing implement-tdd-review-runner plan-and-implement-runner work-note-cleanup _shared; do
  ln -s "$installed_skills/$name" "$HOME/.codex/skills/$name"
done
```

`_shared` is a sibling resource link, not another skill. Keep all five links together so relative templates/testing-policy and composite references resolve. Each public skill ships `agents/openai.yaml` with `policy.allow_implicit_invocation: false` for Codex, alongside Pi's frontmatter flag. Invoke explicitly with `$task-and-plan-routing`, `$implement-tdd-review-runner`, `$plan-and-implement-runner`, or `$work-note-cleanup`. For other hosts, verify supported operator-only metadata and actual discovery before deleting their old copies; do not assume they honor Pi or Codex flags.

When container homes are not mutually visible, the installed checkout must be
on an existing shared mount before creating links. Retain Pi's managed install
path as a symlink to that one checkout and point the non-Pi user links at the
visible location; verify a real `pi update` still follows the alias. Move code
only, never the agent directory, credentials, trust, or sessions. Do not create
a second maintained checkout or a synchronization service.

Do not put these links in `.agents/skills` or another directory Pi also scans: the Git package already exposes them to Pi. Do not commit machine-specific absolute links or introduce copying/syncing. After updates, restart/reload the host and verify all four skill names resolve once, explicit invocation works, and sibling resources load. These checks are cutover gates on every affected local/remote installation; source tests cannot prove live discovery. If a gate fails, retain old consumers and roll back only the targeted setting/link changes from backups.

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
