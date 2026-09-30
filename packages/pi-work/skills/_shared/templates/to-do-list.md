---
status: backlog
owner: engineering
last_reviewed: YYYY-MM-DD
canonical_ref: none
---

# <Title> To-Do

## Slices

Delete this section when the work is one serial unit. Use it when parts of the
package deliver independently observable outcomes and own independent paths.

| Slice | Observable outcome | Owns (exclusive paths) | Depends on | Unblocked by | Local check |
| ----- | ------------------ | ---------------------- | ---------- | ------------ | ----------- |
| <slice> | <what passing this slice proves on its own> | `<path>` | <slice, or `-`> | <artifact or interface the dependency must deliver, or `-`> | `<command>` |

- Shared interface: <contract frozen before parallel work and the one slice that owns it, or `none`>.
- Integrated acceptance: <check that proves the combined result after integration>.

One slice owns each path; no path appears twice. A dependency is a real compile
or behavior edge, not planning order. Independent slices may run in separate
worktrees; tightly coupled chains normally stay with one writer. Start a separate
dependent slice only after its named prerequisite is integrated and verified.

## Tasks

- [ ] <Slice> — <meaningful implementation task>

## Validation

- [ ] <Validation task tied to an acceptance criterion>

## Docs

- [ ] Update durable documentation if behavior or architecture changed

## Completion

- [ ] Every acceptance criterion is verified
- [ ] Each slice passed its local check and integrated acceptance ran on the combined result
- [ ] Test plan records coverage decisions and evidence
