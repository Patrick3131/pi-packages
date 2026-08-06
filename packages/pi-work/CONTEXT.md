---
owner: repo-maintainers
last_verified: 2026-04-15
applies_to: packages/pi-work/**
inherits_from: ../../CONTEXT.md
canonical_for: pi-work architecture
---

# pi-work — Context

## Architecture

```
pi-work
├── extension (/work)
│   ├── resolveWorkConfig
│   ├── discoverWorkPackages  (group primary + companions)
│   ├── UI select + actions
│   └── sendUserMessage handoffs → skills
├── skills/
│   ├── task-and-plan-routing
│   ├── implement-tdd-review-runner
│   ├── plan-and-implement-runner
│   └── _shared/ (templates + testing policy)
└── scaffold/docs/work
    ├── AGENTS.md / CONTEXT.md / README.md
    ├── work/
    └── finished/
```

## Philosophy

`pi-work` uses a small control plane around ordinary Markdown:

- **Documents are contracts.** The primary work item defines problem, outcome, scope, acceptance criteria, and verified implementation context.
- **Companions are purposeful.** The to-do list tracks meaningful deliverables; the test plan records material risks, proof layers, commands, and explicit exclusions.
- **Templates constrain shape.** The agent may choose content, but it should not invent a new document taxonomy for each task.
- **Skills encode procedure.** Skill bodies stay short and point to templates or policies for detail.
- **Runtime code enforces boundaries.** Discovery groups packages, readiness gates implementation, and handoff prompts embed the exact operator skill body.
- **Testing follows risk.** A code change does not automatically justify a new test; existing proof or a reasoned `No automated test needed` decision is valid.

The package is deliberately project-agnostic. The defaults make the convention usable immediately, while local `AGENTS.md`, `CONTEXT.md`, environment variables, and verified repository paths provide project-specific meaning.

## Work package unit

The unit of work is a **package**, not a single markdown file:

- primary
- `-to-do-list` companion
- `-test` companion

Implementation-bound packages use the templates under `skills/_shared/templates/`. Intake packages (`idea` or early `triage`) may be lighter, but must be labeled as intake and must not be handed to implementation.

`/work` lists packages; completeness is shown in labels (`●` complete, `○` incomplete).

## Config resolution

1. explicit options (tests / future settings)
2. `PI_WORK_*` env
3. defaults (`docs/work`, `work`, `finished`)

## Non-goals (v0.1)

- Rich custom markdown pager TUI (uses notify + agent read)
- Auto-moving packages to finished from the wizard
- Bundled project agent chain files
- Product-specific routing or CMS integrations

## Skill injection (P0)

`sendUserMessage` from extensions skips `/skill:` expansion. `/work` therefore embeds:

```text
<skill name location>body</skill>
user args
```

via `formatSkillBlock` / `buildSkillHandoffMessage`.

## Readiness

`src/readiness.ts` is the shared gate for UI and prompts:

- flat open/finished folders
- type is metadata (UI groups via `formatSelectItems`)
- `idea` = intake; classified `triage` may be ready
- blocking Open Questions ⇒ not ready

The readiness gate is intentionally stricter than discovery: a package can be listed while still missing companions, decisions, or executable acceptance criteria.

## Completion semantics

Skills report only COMPLETE or BLOCKED to the user. Continuation is an internal loop state.

On COMPLETE, all three documents are marked `done`, validation evidence is recorded, and the package is moved together to the finished directory. BLOCKED packages remain in the open directory with exact remaining work or clarification needed.
