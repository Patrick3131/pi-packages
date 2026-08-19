# Melon Workspaces

Browser-only Pi Web plugin for the Melon Labs remote development stack. It
adds a Workflows panel and action-palette commands for creating task
worktrees, committing and pulling either integration branch, pushing, opening
and merging pull requests, and launching Codex through the shared workstation
tmux socket. The `staging` and `production` checkouts also expose explicit
branch synchronization and push controls. Direct production changes require
an in-browser confirmation; staging-to-production pushes are fast-forward-only.

The plugin delegates mutations to the `melon-worktree` and `melon-codex`
commands supplied by `melon-remote`. Pi Web's bundled Git provider remains the
workspace authority and continues to own discovery, status, diffs, and native
worktree removal.

Every Git workspace also exposes the normal Git-operation controls and a
single-slot preview card. `Start / Switch
Preview` delegates to `melon-preview start .`, which replaces any active
preview with the selected primary checkout or task worktree. The card opens
the active app through `https://preview.melonlabs.ai/__preview/open`, displays
runner logs in a terminal, or stops the active preview. Preview lifecycle,
validation, staging configuration, and credentials remain server-side in
`melon-remote`; the browser plugin receives no secrets.
