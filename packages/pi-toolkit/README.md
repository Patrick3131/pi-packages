# pi-toolkit

Everyday Pi conveniences, installed through the repository Git package:

| Feature | Surface |
|---|---|
| Tools | `/tools`, `/tools print`, `/tools save` |
| Presets | `/preset`, `--preset`, Ctrl+Shift+U |
| Skill mentions | `$skill-name` anywhere in a message, autocomplete, `/skill-mentions` |
| My Pi | `/overview` opens a read-only HTML setup overview |

## My Pi

Run **`/overview`**. No flags, no web server, no extra model request.

The HTML page shows packages, extension declarations and observed registrations,
commands/templates, loaded skills, tools, presets, MCP configuration, and providers.
Search, expandable evidence/relationships, keyboard search (`/`, Escape), and a
light/dark switch make the setup navigable.

Personal/project provenance explains which copy supplies a capability. Tools
distinguish the active set, loadout-hidden declarations, indirect callability,
saved tools.json preferences, and preset requests. Preset names recorded in a
session do not prove their model/tools were reapplied after resume or later edits.
Current model and startup default are separate.

Reports are snapshots: rerun the command to refresh. Output is
`<agent-dir>/overview/overview-<session>.html` (private file permissions where
supported); `PI_OVERVIEW_DIR` changes the output directory. A browser-launch
failure still reports the saved path. Non-TUI clients generate HTML without
opening a browser; on a remote host the file stays on that host.

The page projects metadata rather than dumping configuration. It never reads
auth.json, executes credential commands, imports extensions, connects to MCP,
changes tools/presets/settings, or validates credentials remotely. Paths, user
descriptions and preset prose may still be private; do not publish the report
without review.

### Host limits

Typechecked against Pi 0.99.1 and fresh-process smoke-tested against Pi 1.0.4.
Optional introspection methods are guarded.
Missing source, skills, auth-status, and loadout metadata appears as unknown,
not an invented empty or disabled state. Complete extension-load status and MCP
connection health are not available from the verified public command APIs:
manifest paths are declarations; registered capabilities are runtime evidence.
Use `/mcp` for connection diagnostics.

Local npm/Git installation evidence checks the standard managed caches; custom
cache layouts remain unconfirmed. No package manager resolution/install runs.
Configured provider availability is inferred from safe configured-auth metadata
and catalog counts, not a remote availability test.

## Feature independence

The package has four extension entry points:

```text
src/features/presets/index.ts
src/features/tools/index.ts
src/features/skill-mentions/index.ts
src/features/overview/index.ts
```

The repository manifest retains existing relative hook order. Filtering one
feature does not require disabling the rest. For example, in the Git package
entry, exclude mentions with
`!packages/pi-toolkit/src/features/skill-mentions/**`.

Existing behavior/configuration remains unchanged:

- `<cwd>/.pi/tools.json`: saved project defaults; session toggles stay local until saved.
- `<agent-dir>/presets.json` + `<cwd>/.pi/presets.json`: project names replace whole presets.
- `preset-state`: shared recorded preset signal between tools/presets.
- Skill syntax, input handling and autocomplete are unchanged.

Detailed feature notes are under [tools](src/features/tools/README.md),
[presets](src/features/presets/README.md), and
[skill mentions](src/features/skill-mentions/README.md).

## Migration

The canonical source remains `git:github.com/Patrick3131/pi-packages`; do not add a
second toolkit install beside that source. The old three workspace directories
are retired, not compatibility wrappers.

After publication, preview and apply the narrow local-global/remote cutover:

```bash
./scripts/pi-sync --toolkit-only --check
./scripts/pi-sync --toolkit-only --apply
```

It uses the existing verified Dokploy service/user/lock boundary, updates only
the shared Git package, verifies its published revision, and maps only toolkit
references. Unlike ordinary shared-config sync, it does not copy presets,
replace personal provider preferences, or overwrite consumer resource filters.

Settings-only mapping can be previewed directly:

```bash
python3 configs/global/migrate-toolkit.py --agent-dir ~/.pi/agent
python3 configs/global/migrate-toolkit.py --agent-dir ~/.pi/agent --apply
```

Exact old entry paths and feature-prefix filters map to the new paths.
Standalone verified first-party local declarations can consolidate into the
canonical source; custom/conflicting policies fail for explicit review.
Empty resource lists, deliberate exclusions and autoload deltas stay intact.
No workspace scan or project migration is performed. Unknown project-owned
references need separate approval.

Changed settings get private timestamped `settings.json.toolkit-backup-*` backups;
repeat migration writes nothing. To roll back, preview with
`--rollback <backup>`, then add `--apply`. Only migrated fields restore, preserving
other later personal edits; changes to migrated fields cause refusal. Restore
the shared Git package's recorded prior revision together with those references.
Targets are not transactionally updated together: stop/inspect a partial failure.

Reload/start fresh on each target and verify once-only `/tools`, `/preset`,
skill expansion/autocomplete, and `/overview` source attribution.

## Development

```bash
npm run test --workspace=packages/pi-toolkit
npm run typecheck --workspace=packages/pi-toolkit
npm run test:configs
```
