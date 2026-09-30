# Optional native workflow recipes

These are optional compositions of existing primitives, not a new engine or a
required phase fleet. The portable method is exclusive ownership, real dependency
barriers, honest evidence and parent acceptance. Small/coupled work stays direct.

## Choose the smallest useful shape

- **Direct:** inspect readiness → implement with risk-justified checks → review
  the actual change → complete the three-file package. No extra agents needed.
- **Parallel sliced:** launch independent ready writers concurrently → parent
  inspects/integrates exact owned outputs → unlock dependent slices → validate
  combined result → optional fresh read-only review → scoped fixes/revalidation.
- **Validation/review only:** a bounded worker executes exact allowed checks with
  no source fixes; then a fresh reviewer assesses adequacy on the stable tree.
  Only genuinely read-only checks on an immutable snapshot can run concurrently
  with review. Bash/test commands are not intrinsically read-only.

Red evidence belongs inside the implementation slice when justified; it does not
require a separate test-writer role. Parent owns documents/integration unless a
single document owner is explicitly assigned. Never make a mandatory finalizer.
A child exit is not readiness or completion, and failure may leave useful writes.

## Pi / pi-subagents example (conditional)

First inspect installed tool/agent capabilities and current workflow guide.
Delegation must already be authorised. Source checkout must be clean for managed
worktrees; otherwise stop, use a separately approved clean snapshot, or remain
serial. Never silently stash, commit or drop isolation to satisfy allocation.
Dependency setup and checks must be available in each worker checkout.

In current Pi/pi-subagents, write one `js workflow` fenced block in the reply,
then make one async `subagent({ workflow: true, args: { slices: ... }, async: true })`
call in that reply. A script file may instead use `workflow: "./path/to/script.js"`;
no maintained repository script is required. Older `workflowScript` and
`workflowScriptPath` inputs were removed in 0.74.0; do not reuse them on current
hosts. Verify the installed host's accepted form before dispatch.

Supply bounded plain-data `args.slices`, each with a stable key, verb/behaviour
label, verified source cwd, cold-start-complete task and artifact output path.
Do not include secrets in persisted workflow args. `runs.all` returns an ordered
array. The following is the reply's workflow block, after the parent verifies
disjoint ownership/readiness:

```js workflow
// Workflow body: parent-verified independent slices.
const results = await runs.all(args.slices.map((slice) => ({
  key: slice.key,
  label: slice.label,
  agent: "worker",
  cwd: slice.cwd,
  context: "fresh",
  worktree: true,
  task: slice.task,
  output: slice.output
})));
return results.map((result) => ({
  runId: result.runId,
  ok: result.ok,
  outputReference: result.outputReference,
  artifactPaths: result.artifactPaths,
  outputPathMapping: result.outputPathMapping
}));
```

Call with `async: true`; use the exact currently supported fields. Workers inherit
the session model unless the operator/settings explicitly request an override.
Discover exact model IDs before overrides; do not pin permanent models here.
`runs.run(key, params)` handles one keyed dependency step. Await every stored run
promise; do not access `.output` before completion. Observe actual returned status,
errors and artifacts: do not assume `runs.all` turns failures into successful
values or that every host exposes the same result fields.

This batch recipe is simplest when all slices are independent. For a real DAG,
launch ready slices with `runs.run`, observe their promises and integrate each
completed prerequisite before dispatching newly ready dependants; do not impose a
whole-wave barrier merely for ceremony. An ordinary script sandbox cannot execute
parent filesystem integration: return/emit artifact references and use parent
coordination/supervisor barriers, or an explicitly granted native integration
facility. Do not invent `runs.host` access or let children merge each other.

After parent integration, execute scoped validation and only then launch selected
read-only review using the stable integrated artifacts. Keep one writer per cwd
throughout. Native async completion/supervisor messages wake the parent: no sleep
or status-polling loops. Persist exact run/artifact references for recovery; inspect
actual partial state and resume eligible known runs instead of replaying success.

Use supported deadline/checkpoint controls with a finishing margin where useful;
checkpoints are best-effort reports, not guarantees that mutation stopped safely.
Never use hard tool caps as a writer-safety mechanism. On infrastructure failure,
capture partial state and use same-protocol recovery, not an unapproved CLI or
foreground fallback. Publication remains separately authorised.

## Other hosts

Use the same ownership, dependency, integration and evidence contracts with the
host's supported worker/reviewer equivalents. A host without scripts can perform
these steps directly; do not claim unsupported Pi APIs or successful delegation.
No checked-in workflow script, global registry, fixed panel or extra runtime is
required.
