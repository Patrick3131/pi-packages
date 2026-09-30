# Parent-owned integration

Integration is the parent's job, whether the slices arrived as worktrees, patch
files, or a native workflow. The parent owns the shared checkout and its index.

## Protect the working tree and index

- Record the baseline first: current revision, staged paths, unstaged paths, and
  unrelated untracked paths and content hashes, index/tree identity and diffs.
  HEAD alone does not identify unstaged changes. Capture target-path hashes too;
  compare protected bytes/index before and after integration.
- Apply only each slice's owned changes, in dependency order, from its recorded
  base. Use patch application or an explicit path checkout of the lane's
  revision only after confirming target paths are clean or exactly accounted for
  against the baseline. Path checkout can replace local work and stage changes:
  prefer a checked patch without `--index`, and verify index preservation. Never
  `git checkout .`, `git reset`, `git stash`, `git clean`, or a
  rebase to clear the operator's unrelated work.
- Never commit, push, or publish as part of integration unless the request
  authorized it. Preserve unrelated staged and unstaged changes exactly.

## Scope, base, and diff evidence

For each integrated slice report: the slice key, its base revision, the paths it
changed, and the diff actually applied. Then report the integrated scope as the
union of applied changes, plus every slice that could not land and the exact
failure. The evidence is the diff, not the slice's summary.

## Stop on semantic conflicts

Resolve only trivial textual conflicts that cannot change behavior. A conflict
that changes behavior, an ambiguous overlap, or a slice whose diff expected a
revision that no longer exists is a decision: stop, leave the tree in an
inspectable state, and report the conflicting paths, the patches, and the two
intended behaviors. Do not invent a resolution and do not silently drop a slice.
Other slices already applied stay applied; report exactly which.

## Combined validation

Validate the integrated result rather than each slice in isolation: run the
repository's affected check set for the union of changed paths once, plus any
required check whose behavior crosses slice boundaries. A green slice check
before integration is not evidence for the merged tree. Carry forward a check
that is still applicable and whose revision is unchanged; do not repeat it
without a new change, failure, or unresolved concern.
