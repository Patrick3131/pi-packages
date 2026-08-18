#!/usr/bin/env bash
# Restore a sanitized global Pi coding-agent setup onto this machine.
# Never copies auth.json, sessions, trust.json, or npm/git caches.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PACKAGES_ROOT="$(cd "$ROOT/../.." && pwd)"
PRESETS_PACKAGE="$PACKAGES_ROOT/packages/pi-presets"
TOOLS_PACKAGE="$PACKAGES_ROOT/packages/pi-tools"
SEARXNG_PACKAGE="$PACKAGES_ROOT/packages/pi-searxng"
XAI_DEFAULTS_PACKAGE="$PACKAGES_ROOT/packages/pi-xai-defaults"
FORCE=0

if [[ "${1:-}" == "--force" ]]; then
	FORCE=1
fi

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
	if [[ -e "$dest" && "$FORCE" -ne 1 ]]; then
		if cmp -s "$src" "$dest"; then
			echo "Unchanged $dest"
			return
		fi
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

need pi
need python3

mkdir -p "$AGENT_DIR/extensions"

copy_file "$ROOT/settings.json" "$AGENT_DIR/settings.json"
copy_file "$ROOT/presets.json" "$AGENT_DIR/presets.json"
copy_file "$ROOT/xai-defaults.json" "$AGENT_DIR/xai-defaults.json"

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
    "npm:pi-xai-oauth",
    "npm:@narumitw/pi-goal",
]
existing = {source_of(entry) for entry in packages}
changed = False
for item in wanted:
    if item not in existing:
        packages.append(item)
        changed = True
if changed:
    settings["packages"] = packages
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"Added missing npm package entries to {settings_path}")
else:
    print(f"Package list already contains npm restore targets in {settings_path}")
PY

echo "Installing npm packages (safe if already present)..."
pi install npm:pi-subagents
pi install npm:pi-xai-oauth
pi install npm:@narumitw/pi-goal
pi install "$PRESETS_PACKAGE"
pi install "$TOOLS_PACKAGE"
pi install "$SEARXNG_PACKAGE"
pi install "$XAI_DEFAULTS_PACKAGE"

echo
echo "Restore finished."
echo "Not copied (on purpose): auth.json, sessions/, trust.json, npm/, git/"
echo "Reload Pi or restart, then run /preset and /tools."
