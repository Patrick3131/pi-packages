# Melon Workspaces

Browser-only Pi Web plugin for the Melon Labs remote development stack. It
adds a Workflows panel and action-palette commands for creating task
worktrees, committing and pulling either integration branch, pushing, merging
directly into the checked-out `staging` or `production` workspace, and
launching Codex through the shared workstation tmux socket. A combined action
first updates the target from its remote, then merges the task and pushes the
target. Production changes require an in-browser confirmation.

The plugin delegates mutations to the `melon-worktree` and `melon-codex`
commands supplied by `melon-remote`. Pi Web's bundled Git provider remains the
workspace authority and continues to own discovery, status, diffs, and native
worktree removal.

Every Git workspace also exposes the normal Git-operation controls and a
single-slot preview card. `Start / Switch Preview` starts every declared app by
default and replaces any active preview with the selected primary checkout or
task worktree. An app selector can explicitly start a smaller set when the
operator wants a narrower preview. The card opens
`https://preview.melonlabs.ai`, which redirects to the active app's
manifest-configured path, displays live runner logs in a terminal, or stops the
active preview. The card reads the public status endpoint to show the active
workspace path, branch, apps, state, and configured URL. Preview lifecycle,
validation, staging configuration, and credentials remain server-side in
`melon-remote`; the browser plugin receives no secrets.
