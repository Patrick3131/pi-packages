# Delegated execution

Reference for `implement-tdd-review-runner` and `plan-and-implement-runner`. The
skills own the method; this file details the delegation seams.

## Authority

Delegate only when the current request or applicable user/project instructions
authorize it. Available child tools, task size, or risk alone are not authority.
The parent keeps decisions, integration, verification, final acceptance,
publication, and ownership of the package documents. Children do not delegate.

## Children do not inherit skills

Builtin `worker` and `reviewer` do not automatically inherit the parent's skills.
Do not assume "follow implement-tdd-review-runner" loads its body. A fresh worker brief
must be cold-start complete; a forked worker can use inherited investigation and
needs the task delta rather than a duplicate background dump. Both need explicit
package paths, ownership and acceptance boundaries. Include relevant repository guidance even if the host
injects some project context. Pass the method it needs, or use an explicitly
supported skill-loading mechanism.

## Choose context per task

There is no blanket fresh/fork preference for workers or research slices.
Choose explicitly where supported; omitting the field can select a host/agent
default rather than making a deliberate decision.

- **Fork** when the parent already holds substantial relevant, current
  investigation, decisions or state that the child can reuse, avoiding repeated
  reads and reconstruction. It is useful even when inheritance is an efficiency
  benefit rather than a strict dependency.
- **Fresh** when a small self-contained brief is enough, the slice is unrelated
  to most parent history, or inherited assumptions/history would introduce noise,
  stale context or bias.
- **Independent review** always uses fresh context and read-only tools; it must
  not inherit the author's conclusions as its starting point.

Weigh saved investigation against the amount of history carried: fork is not
automatically faster or cheaper. Neither mode replaces checks of current files,
exclusive ownership, permission boundaries or acceptance evidence. Verify host
fork support and any context-pruning behaviour; if the selected mode is unavailable,
report it and choose a supported alternative explicitly, not a silent fallback.

## Concise worker brief

Include, in this order and no more:

1. Goal and the one owned artifact or path slice.
2. Repository, working directory, and ref or base revision.
3. Owned paths and prohibited actions, including "do not edit the package
   documents" when the parent owns them.
4. Relevant guidance: repository and work-folder `AGENTS.md` / `CONTEXT.md`
   paths, testing policy path, and the acceptance criteria that apply.
5. Validation: exact commands, allowed artifact effects, and protected state;
   validation-only tasks make no source or expectation fixes.
6. Expected evidence: changed paths, commands with outcomes, findings, remaining
   work, artifact pointer.
7. Stop and escalation conditions.

Ask for pointers and concise evidence, never a copied transcript. Do not put permanent model pins in shared guidance. Inherit the session model
unless the operator explicitly requests a per-run model or applicable settings
provide it; discover the exact supported provider/id before overriding. Reserve
a max or extra-high thinking level for work that genuinely needs it or an
explicit request, not as a default. Apply the context criteria above; do not
require an inherited-state dependency merely to justify a useful fork.

## One writer per working directory

Independent writers need isolated checkout state: separate working copies or Git
worktrees, never two writers in one working directory or index. One actor owns
each path slice for the whole run, and the parent is the only integrator. A slice
may start only when its path set is disjoint from every running slice and its
dependencies are already integrated. When isolation is unavailable, run serially
and say so.

## Artifact scope and protected state

State the writable artifact scope in every brief. Protected unless the brief
explicitly names them: the repository index and staged changes, unrelated
working-tree files, existing tests and expectations, lockfiles, generated
artifacts outside the slice, package documents owned elsewhere, and any path
outside the checkout. A child that needs one of these stops and reports instead
of proceeding. Verify the child's actual diff afterwards; a declared read-only
role is not enforcement.

## Validation and review lanes

See `scoped-validation.md` and `review-lenses.md`.
