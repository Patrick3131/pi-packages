#!/usr/bin/env python3
"""Explicit two-target deployment of published Pi packages and shared config."""
import argparse
import difflib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

SOURCE = "git:github.com/Patrick3131/pi-packages"
URL = "https://github.com/Patrick3131/pi-packages.git"
# Deliberately excludes MCP endpoints, model preferences, credentials and sessions.
FILES = {
    "presets.json": "presets.json",
    "APPEND_SYSTEM.md": "APPEND_SYSTEM.md",
    "mcp-policy.ts": "extensions/mcp-policy.ts",
    "worktree-setup.mjs": "extensions/subagent/worktree-setup.mjs",
}


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def source(entry):
    return entry if isinstance(entry, str) else entry["source"]


def merged_settings(current, snapshot):
    result = dict(current)
    wanted = {source(entry): entry for entry in snapshot["packages"]}
    # Preserve target ordering and extras; replace only shared declarations.
    existing = current.get("packages", [])
    result["packages"] = [wanted.get(source(entry), entry) for entry in existing]
    present = {source(entry) for entry in existing}
    result["packages"] += [entry for name, entry in wanted.items() if name not in present]
    return result


def changes(snapshot, agent):
    settings_path = agent / "settings.json"
    current = json.loads(settings_path.read_text())
    defaults = json.loads((snapshot / "settings.json").read_text())
    merged = merged_settings(current, defaults)
    planned = []
    if current != merged:
        planned.append((settings_path, json.dumps(merged, indent=2) + "\n"))
    files = dict(FILES)
    for item in sorted((snapshot / "agents").glob("*.md")):
        files["agents/" + item.name] = "agents/" + item.name
    for src, dest in files.items():
        path = agent / dest
        content = (snapshot / src).read_text()
        if not path.exists() or path.read_text() != content:
            planned.append((path, content))
    return planned


def show(planned):
    for path, content in planned:
        old = path.read_text() if path.exists() else ""
        print("".join(difflib.unified_diff(old.splitlines(True), content.splitlines(True),
                                         fromfile=str(path), tofile=str(path) + " (published)")), flush=True)


def write_changes(planned):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    for path, content in planned:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            backup = path.with_name(path.name + ".bak." + stamp)
            shutil.copy2(path, backup)
            print("Backup:", backup, flush=True)
        # Same-directory replace avoids truncating an existing config on failure.
        fd, temp = tempfile.mkstemp(dir=path.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(content)
            os.chmod(temp, path.stat().st_mode & 0o777 if path.exists() else 0o600)
            os.replace(temp, path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)


def target(args, checkout):
    agent = Path(args.agent_dir).expanduser().resolve()
    if not (agent / "settings.json").is_file():
        raise RuntimeError(f"No existing Pi settings at {agent}; bootstrap separately first")
    env = dict(os.environ, PI_CODING_AGENT_DIR=str(agent))
    env["PATH"] = args.pi_bin_dir + os.pathsep + env.get("PATH", "") if args.pi_bin_dir else env.get("PATH", "")
    if not shutil.which("pi", path=env["PATH"]):
        raise RuntimeError("pi executable not found")
    current = json.loads((agent / "settings.json").read_text())
    toolkit = getattr(args, "toolkit_only", False)
    migration = None
    if toolkit:
        import runpy
        migration = runpy.run_path(str(checkout / "configs/global/migrate-toolkit.py"))
        migrated = migration["migrate"](current)
        migration["execute"](agent)
        planned = [(agent / "settings.json", json.dumps(migrated, indent=2) + "\n")] if migrated != current else []
    else:
        planned = changes(checkout / "configs/global", agent)
        show(planned)
    if not any(source(e) == SOURCE for e in current.get("packages", [])):
        raise RuntimeError(f"Expected unpinned global package {SOURCE}; install it first")
    print(f"{agent}: {len(planned)} {'toolkit reference' if toolkit else 'shared config'} change(s); published commit {args.revision}", flush=True)
    installed = agent / "git/github.com/Patrick3131/pi-packages"
    if (installed / ".git").exists():
        run(["git", "-C", str(installed), "rev-parse", "HEAD"])
    if planned and not toolkit and (args.apply or args.require_approval) and not args.accept_config:
        raise RuntimeError("Config differs: review --check, then pass --accept-config to authorize these changes")
    if not args.apply:
        return
    # Ignore project resources even when invoked from an extension development repo.
    run(["pi", "update", SOURCE, "--no-approve"], cwd=agent, env=env)
    actual = subprocess.check_output(["git", "-C", str(installed), "rev-parse", "HEAD"], text=True).strip()
    if actual != args.revision:
        raise RuntimeError(f"Published branch moved during sync ({actual}); config not applied. Rerun.")
    if toolkit:
        migration["execute"](agent, apply=True)
    else:
        write_changes(planned)
        hook = agent / FILES["worktree-setup.mjs"]
        hook.chmod(hook.stat().st_mode | 0o100)
    print(f"Updated {agent} to {actual}. Run /reload in active sessions (or restart).", flush=True)


def dokploy_client():
    import runpy
    transport = runpy.run_path(str(Path(__file__).with_name("pi-sync-dokploy.py")))
    return transport["Dokploy"]()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="update packages and approved config")
    parser.add_argument("--check", action="store_true", help="report only (default)")
    parser.add_argument("--accept-config", action="store_true", help="authorize displayed shared config replacements")
    parser.add_argument("--local-only", action="store_true", help="explicitly skip remote")
    parser.add_argument("--toolkit-only", action="store_true", help="update shared package and migrate only toolkit references; preserve other config")
    parser.add_argument("--agent-dir", default=os.environ.get("PI_CODING_AGENT_DIR", "~/.pi/agent"))
    parser.add_argument("--pi-bin-dir", default="")
    parser.add_argument("--require-approval", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--revision", help=argparse.SUPPRESS)
    parser.add_argument("--result-token", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.apply and args.check:
        parser.error("choose --check or --apply")
    if args.accept_config and not (args.apply or args.require_approval):
        parser.error("--accept-config requires --apply")
    with tempfile.TemporaryDirectory(prefix="pi-sync-") as temp:
        checkout = Path(temp) / "published"
        run(["git", "clone", "--quiet", "--depth", "1", URL, str(checkout)])
        if args.revision:
            run(["git", "-C", str(checkout), "fetch", "--quiet", "origin", args.revision])
            run(["git", "-C", str(checkout), "checkout", "--quiet", args.revision])
        args.revision = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
        if args.worker:
            target(args, checkout)
            mode = "apply" if args.apply else "check"
            print(f"PI_SYNC_RESULT {args.result_token} {args.revision} {mode}", flush=True)
            return
        # Check both targets before any apply. No repo traversal or workspace updates.
        client = None
        if not args.local_only:
            client = dokploy_client()
            client.verify_target()
        worker_source = Path(__file__).read_text()
        apply = args.apply
        args.require_approval = apply
        args.apply = False
        target(args, checkout)
        if not args.local_only:
            client.remote(args, worker_source)
        if apply:
            # Revalidate config drift locally before mutation; remote validates again itself.
            args.apply = True
            target(args, checkout)
            if not args.local_only:
                client.remote(args, worker_source, apply=True)
        print("Sync complete." if apply else "Check complete; no installed packages/config changed.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"pi-sync failed: {error}. Targets may be partially updated; fix and rerun.", file=sys.stderr)
        sys.exit(1)
