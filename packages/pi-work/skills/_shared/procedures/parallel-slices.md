# Authorised parallel sliced mode

The default is one writer working through the package in order. Parallel slices
are an optimization for genuinely independent work, and they require explicit
authorization plus real isolation.

## Preconditions

- The package's `## Slices` table, or an equivalent plan, names one owner per
  path slice. A slice depends on another only when it needs that slice's code to
  compile or behave correctly, not because it was planned second.
- The parent has inspected the package's readiness verdict (`ready`,
  `not_ready`, or `intake`) against the actual documents, not just the caller's
  claim. `not_ready` or `intake` does not proceed; fix or promote it first.
- Each slice has a separate working copy or Git worktree on a recorded base
  revision, and its dependencies are already integrated.

## Stable shared ownership

- Path sets of concurrently running slices are disjoint. A path two slices need
  is assigned to exactly one, or the slices are serialized.
- The package documents and any shared canonical file have one owner for the
  whole run: the parent or one named slice, never two lanes.
- A slice that finds it needs a path outside its set stops and reports; it does
  not widen its own scope.

## Ready dependencies run concurrently

Launch only the slices whose dependencies are already integrated. Recompute the
ready set after each integration: a slice becomes ready when its dependencies
land, not when a batch or timer completes. Independent ready slices may run at
the same time; a dependency chain is one writer's work in sequence. When
isolation or installed dependencies are missing, keep the serial order and say
so instead of dropping isolation silently.

## Integration

Slices leave their changes for the parent and never merge another slice's work.
The parent applies and validates them per `integration.md`. A slice ending is not
task completion, and a slice reporting success is not evidence that its output is
correct.
