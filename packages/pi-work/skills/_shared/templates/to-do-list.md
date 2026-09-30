---
status: backlog
owner: engineering
last_reviewed: YYYY-MM-DD
canonical_ref: none
---

# <Title> To-Do

## Slices

Delete this section when the work is one serial unit. Use it when parts of the
package touch independent paths, so they can be implemented in parallel or
handed to different workers.

| Slice | Owns (paths) | Depends on |
| ----- | ------------ | ---------- |
| <slice> | <paths this slice owns> | <slice it needs to compile or behave correctly, or `-`> |

One slice owns each path; no path appears twice. List a dependency only when the
slice genuinely needs the other slice's code, not because it was planned second.

## Tasks

- [ ] <Meaningful implementation task>

## Validation

- [ ] <Validation task tied to an acceptance criterion>

## Docs

- [ ] Update durable documentation if behavior or architecture changed

## Completion

- [ ] Every acceptance criterion is verified
- [ ] Test plan records coverage decisions and evidence
