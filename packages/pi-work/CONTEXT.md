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
│   ├── work-note-cleanup (auxiliary operator-only)
│   └── _shared/ (templates + testing policy + optional procedures + capability disposition)
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
- **One method, local policy.** The three operator-only skill bodies are canonical. They execute directly by default and point to sibling templates/testing policy. Repositories supply scope, commands, architecture, permissions, and feature-owned work locations; no adapter or duplicated workflow is needed.
- **Detail is preserved, ceremony is optional.** Planning retains decision/evidence memory and meaningful slices; implementation distinguishes lightweight direct work from parallel independent workers plus parent-owned integration. Optional review lenses/validation briefs recover specialised policies without duplicated agents. Safe cleanup is a separate approval-gated operator skill.
- **Delegation is optional and authorized.** Existing builtin roles may own bounded slices when authorized by the request or applicable instructions. Worker/research context is chosen per task, without a blanket fresh/fork preference: fork can reuse useful current investigation and decisions; fresh suits a bounded brief or avoids noisy/stale history. Independent reviewers remain fresh and read-only. The parent verifies evidence and retains acceptance/publication authority; actual-state recovery preserves completed work rather than replaying phases.
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

## Cross-host distribution

Pi discovers `skills/` through the package manifest; `/work` loads and embeds those same files. Keep `disable-model-invocation: true`. Codex uses `agents/openai.yaml` with `policy.allow_implicit_invocation: false` and user-level links to the installed package's three core skill directories, auxiliary `work-note-cleanup` and `_shared`, preserving sibling resolution. Links are machine setup, not tracked copies or a syncing service. Other hosts must verify their operator-only behavior before cutover; see README.

Inventory duplicate discovery roots before enabling the Git package skills. Updating package code alone does not remove an existing settings exclusion; restore normalization removes only the exact obsolete filter while retaining other settings. Local/remote discovery and consumer deletion are separate activation gates, not source-test claims.

## Completion semantics

Skills report only COMPLETE or BLOCKED to the user. Continuation is an internal loop state.

Core workflow injection still uses the three existing skill names; the package manifest independently exposes the auxiliary cleanup directory. Producer edits do not silently replace installed package resources; update/reload the installed canonical package only under the operator's publication/install policy.

On COMPLETE, all three documents are marked `done`, validation evidence is recorded, and the package is moved together to the finished directory. BLOCKED packages remain in the open directory with exact remaining work or clarification needed.
