# Melon Workspaces

Browser-only Pi Web plugin for the Melon Labs remote development stack. It
adds a Workflows panel and action-palette commands for creating task
worktrees, updating them from staging, pushing, opening and merging pull
requests, and launching Codex through the shared workstation tmux socket.

The plugin delegates mutations to the `melon-worktree` and `melon-codex`
commands supplied by `melon-remote`. Pi Web's bundled Git provider remains the
workspace authority and continues to own discovery, status, diffs, and native
worktree removal.
