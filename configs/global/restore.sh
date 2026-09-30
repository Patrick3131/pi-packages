#!/usr/bin/env bash
# Restore a sanitized global Pi coding-agent setup onto this machine.
# Never copies auth.json, sessions, trust.json, or npm/git caches.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
FORCE=0
AGENTS_ONLY=0

for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
		--agents-only) AGENTS_ONLY=1 ;;
		--migrate-work-skills) ;;
		*) echo "Usage: $0 [--force] | --agents-only [--force] | --migrate-work-skills" >&2; exit 1 ;;
	esac
	if [[ "$arg" == "--migrate-work-skills" && "$#" -ne 1 ]]; then
		echo "Use --migrate-work-skills alone; it cannot be combined with --force." >&2
		exit 1
	fi
done

need() {
	command -v "$1" >/dev/null 2>&1 || {
		echo "Missing required command: $1" >&2
		exit 1
	}
}

backup_if_exists() {
	local path="$1"
	if [[ -e "$path" ]]; then
		local stamp
		stamp="$(date +%Y%m%d-%H%M%S)"
		cp "$path" "$path.bak.$stamp"
		echo "Backed up $path -> $path.bak.$stamp"
	fi
}

copy_file() {
	local src="$1"
	local dest="$2"
	mkdir -p "$(dirname "$dest")"
	if [[ -e "$dest" ]] && cmp -s "$src" "$dest"; then
		echo "Unchanged $dest"
		return
	fi
	if [[ -e "$dest" && "$FORCE" -ne 1 ]]; then
		echo "Skip existing $dest (different from snapshot; pass --force to replace)"
		diff -u "$dest" "$src" || true
		return
	fi
	if [[ -e "$dest" ]]; then
		backup_if_exists "$dest"
	fi
	cp "$src" "$dest"
	echo "Wrote $dest"
}

restore_agents() {
	local src
	for src in "$ROOT"/agents/*.md; do
		[[ -f "$src" ]] || continue
		copy_file "$src" "$AGENT_DIR/agents/$(basename "$src")"
	done
}

# Install only reviewed custom agent definitions; never replace settings,
# credentials, subagent preferences, or packages just to install an agent.
if [[ "$AGENTS_ONLY" -eq 1 ]]; then
	restore_agents
	exit 0
fi

need python3

# Targeted persisted-settings cutover: no snapshot copies, package operations,
# version checks, or changes to subagent config and installed checkout state.
if [[ "${1:-}" == "--migrate-work-skills" ]]; then
	python3 - "$AGENT_DIR/settings.json" <<'PYWORKSKILLS'
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

settings_path = Path(sys.argv[1])
if not settings_path.exists():
    print(f"No existing settings to migrate at {settings_path}")
    raise SystemExit(0)
settings = json.loads(settings_path.read_text())
packages = settings.get("packages")
changed = False
if isinstance(packages, list):
    for entry in packages:
        if not isinstance(entry, dict) or entry.get("source") != "git:github.com/Patrick3131/pi-packages":
            continue
        skills = entry.get("skills")
        if not isinstance(skills, list) or "!packages/pi-work/skills/**" not in skills:
            continue
        remaining = [item for item in skills if item != "!packages/pi-work/skills/**"]
        if remaining:
            entry["skills"] = remaining
        else:
            del entry["skills"]
        changed = True
if changed:
    backup = settings_path.with_name(settings_path.name + ".bak." + datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    shutil.copy2(settings_path, backup)
    print(f"Backed up {settings_path} -> {backup}")
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"Removed obsolete shared-work skill filter from {settings_path}")
else:
    print(f"No obsolete shared-work skill filter in {settings_path}")
PYWORKSKILLS
	exit 0
fi

need pi

# The retired adapter is replaced by native MCP, first available in 0.99.0.
python3 - "$(pi --version)" <<'PYVERSION'
import sys
version = tuple(int(part) for part in sys.argv[1].split('.')[:3])
if version < (0, 99, 0):
    raise SystemExit("Native MCP requires Pi >=0.99.0. Run pi update first.")
PYVERSION

mkdir -p "$AGENT_DIR/extensions"

# pi-subagents expands a ~/ hook path against $HOME, but a container can keep
# the agent dir outside $HOME (PI_CODING_AGENT_DIR). Expose the agent dir at
# the conventional location in that case so the restored subagent config works
# on every machine.
if [[ "$AGENT_DIR" != "$HOME/.pi/agent" && ! -e "$HOME/.pi/agent" ]]; then
	mkdir -p "$HOME/.pi"
	ln -s "$AGENT_DIR" "$HOME/.pi/agent"
	echo "Linked $HOME/.pi/agent -> $AGENT_DIR"
fi

copy_file "$ROOT/settings.json" "$AGENT_DIR/settings.json"
copy_file "$ROOT/presets.json" "$AGENT_DIR/presets.json"
copy_file "$ROOT/APPEND_SYSTEM.md" "$AGENT_DIR/APPEND_SYSTEM.md"
copy_file "$ROOT/mcp-policy.ts" "$AGENT_DIR/extensions/mcp-policy.ts"
copy_file "$ROOT/mcp.json" "$AGENT_DIR/mcp.json"
copy_file "$ROOT/subagent.json" "$AGENT_DIR/extensions/subagent/config.json"
copy_file "$ROOT/worktree-setup.mjs" "$AGENT_DIR/extensions/subagent/worktree-setup.mjs"
# The worktree setup hook is executed directly, so the exec bit has to survive the copy.
chmod +x "$AGENT_DIR/extensions/subagent/worktree-setup.mjs"
restore_agents

# xAI/Grok support is retired. Remove the leftover config if an older restore
# installed it; pi-xai-defaults no longer reads it.
if [[ -f "$AGENT_DIR/xai-defaults.json" ]]; then
	backup_if_exists "$AGENT_DIR/xai-defaults.json"
	rm -f "$AGENT_DIR/xai-defaults.json"
	echo "Removed $AGENT_DIR/xai-defaults.json (xAI support retired)"
fi

if [[ -f "$AGENT_DIR/extensions/tools.ts" ]]; then
	backup_if_exists "$AGENT_DIR/extensions/tools.ts"
	rm -f "$AGENT_DIR/extensions/tools.ts"
	echo "Removed loose $AGENT_DIR/extensions/tools.ts so /tools comes from pi-tools"
fi

python3 - "$AGENT_DIR/settings.json" <<'PY'
import json
import sys
from pathlib import Path

settings_path = Path(sys.argv[1])
settings = json.loads(settings_path.read_text())
packages = settings.get("packages")
if not isinstance(packages, list):
    packages = []

def source_of(entry):
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return str(entry.get("source") or "")
    return ""

wanted = [
    "npm:pi-subagents",
    "npm:@narumitw/pi-goal",
    "npm:pi-open-tui",
    "git:github.com/Patrick3131/pi-packages",
]

# Retired first-party packages. Keeping any of these would reinstall dead or
# superseded extensions on the next `pi update --extensions`.
retired = {
    "npm:pi-xai-oauth",
    "npm:pi-mcp-adapter",
    "git:github.com/StanleyOneG/pi-compact",
    "npm:@jmfederico/pi-web",
}

# Older restores installed Melon packages from machine-specific local paths.
# The repository is now one Pi-managed git package, so `pi update
# --extensions` updates every Melon extension atomically.
legacy_package_names = {
    "pi-presets",
    "pi-searxng",
    "pi-tools",
    "pi-work",
    "pi-xai-defaults",
    "pi-keepalive",
    "pi-mcp-gate",
}

def is_retired(entry):
    return source_of(entry) in retired


def is_legacy_local_package(entry):
    source = source_of(entry).replace("\\", "/").rstrip("/")
    return any(source.endswith(f"/pi-packages/packages/{name}") for name in legacy_package_names)

dropped = [entry for entry in packages if is_retired(entry) or is_legacy_local_package(entry)]
filtered_packages = [entry for entry in packages if not is_retired(entry) and not is_legacy_local_package(entry)]
changed = filtered_packages != packages
packages = filtered_packages
existing = {source_of(entry) for entry in packages}
for item in wanted:
    if item not in existing:
        packages.append({"source": item, "extensions": ["!packages/pi-keepalive/**"]} if item.endswith("/pi-packages") else item)
        changed = True
for index, entry in enumerate(packages):
    if source_of(entry) != "git:github.com/Patrick3131/pi-packages":
        continue
    if isinstance(entry, str):
        entry = {"source": entry}
        packages[index] = entry
        changed = True
    # Remove only the retired duplicate-skill filter. An empty list explicitly
    # disables all skills, so omit the key when removal consumes the old list;
    # preserve an intentional pre-existing [] and every other resource filter.
    skills = entry.get("skills")
    if isinstance(skills, list) and "!packages/pi-work/skills/**" in skills:
        remaining = [item for item in skills if item != "!packages/pi-work/skills/**"]
        if remaining:
            entry["skills"] = remaining
        else:
            del entry["skills"]
        changed = True
    exclusions = entry.get("extensions")
    if exclusions is None:
        entry["extensions"] = ["!packages/pi-keepalive/**"]
        changed = True
    elif exclusions and "!packages/pi-keepalive/**" not in exclusions:
        exclusions.append("!packages/pi-keepalive/**")
        changed = True
if changed:
    settings["packages"] = packages
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    for entry in dropped:
        print(f"Removed retired package entry {source_of(entry)} from {settings_path}")
    print(f"Updated package list in {settings_path}")
else:
    print(f"Package list already matches the restore targets in {settings_path}")
PY

echo "Installing Pi packages (safe if already present)..."
pi install npm:pi-subagents
pi install npm:@narumitw/pi-goal
pi install git:github.com/Patrick3131/pi-packages
pi install npm:pi-open-tui

# Retire superseded installations, not only their settings declarations.
for source in npm:pi-xai-oauth npm:pi-mcp-adapter git:github.com/StanleyOneG/pi-compact npm:@jmfederico/pi-web; do
	pi remove "$source" || true
done
rm -f "$AGENT_DIR/mcp-adapter.json" "$AGENT_DIR/mcp-cache.json" "$AGENT_DIR/mcp-project-approvals.json" "$AGENT_DIR/extensions/minimal-mode.ts"

echo
echo "Restore finished."
echo "Not copied (on purpose): auth.json, sessions/, trust.json, npm/, git/"
echo "Removed retired xAI, MCP adapter, compaction workaround, Pi Web, and minimal-mode overrides."
echo "Reload Pi or restart, then run /preset and /tools."
