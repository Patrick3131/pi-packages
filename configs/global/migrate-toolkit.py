#!/usr/bin/env python3
"""Preview/apply a narrow global Pi toolkit cutover. Never scans projects."""
import argparse
import copy
from datetime import datetime, timezone
import fnmatch
import json
import os
from pathlib import Path
import re
import tempfile

SOURCE = "git:github.com/Patrick3131/pi-packages"
FEATURES = {"pi-tools": "tools", "pi-presets": "presets", "pi-skill-mentions": "skill-mentions"}

def mapped(value):
    raw = value
    value = value.replace("\\", "/")
    original = value
    for old, feature in FEATURES.items():
        prefix = "packages/" + old
        if prefix in value:
            tail = value.split(prefix, 1)[1]
            if any(c in tail for c in "*?[{") and tail not in ("/**", "/*", "/src/**", "/src/*", "/src/*.ts"):
                raise ValueError("complex renamed-entry selector requires explicit review")
            value = value.replace(prefix + "/src/tools.ts", "packages/pi-toolkit/src/features/" + feature + "/index.ts")
            value = value.replace(prefix + "/src/preset.ts", "packages/pi-toolkit/src/features/" + feature + "/index.ts")
            value = value.replace(prefix + "/src/index.ts", "packages/pi-toolkit/src/features/" + feature + "/index.ts")
            value = value.replace(prefix + "/src/", "packages/pi-toolkit/src/features/" + feature + "/")
            value = value.replace(prefix + "/", "packages/pi-toolkit/src/features/" + feature + "/")
            if value.rstrip("/") == prefix:
                value = "packages/pi-toolkit/src/features/" + feature
    # Patterns spanning old names but not the new layout need human intent.
    pattern = original.lstrip("!+-")
    if value == original and any(c in pattern for c in "*?[{"):
        if any(old in pattern or ("pi-{" in pattern and old[3:] in pattern) for old in FEATURES):
            raise ValueError("ambiguous renamed-feature selector; review mapping explicitly")
        for old in FEATURES:
            for path in ("packages/" + old + "/src/index.ts", "packages/" + old + "/src/tools.ts", "packages/" + old + "/src/preset.ts"):
                if "pi-" in pattern and fnmatch.fnmatchcase(path, pattern):
                    raise ValueError("ambiguous cross-feature selector; review mapping explicitly")
    return raw if value == original else value

def is_canonical(source):
    return source in (SOURCE, "https://github.com/Patrick3131/pi-packages", "https://github.com/Patrick3131/pi-packages.git")

def selectors(value):
    if not isinstance(value, list) or any(not isinstance(x, str) for x in value):
        raise ValueError("resource filters must be lists of strings")
    return [mapped(x) for x in value]

def legacy(source):
    for old, feature in FEATURES.items():
        if source.replace("\\\\", "/").rstrip("/").endswith("/pi-packages/packages/" + old):
            return feature
    return None

def migrate(settings):
    if not isinstance(settings, dict):
        raise ValueError("settings must be an object")
    result = copy.deepcopy(settings)
    packages = result.get("packages", [])
    if not isinstance(packages, list):
        raise ValueError("packages must be a list")
    standalone = []
    kept = []
    canon = []
    for entry in packages:
        if not isinstance(entry, (str, dict)):
            raise ValueError("invalid package declaration")
        source = entry if isinstance(entry, str) else entry.get("source")
        if not isinstance(source, str):
            raise ValueError("invalid package source")
        feature = legacy(source)
        if feature:
            if isinstance(entry, dict) and any(key not in ("source", "extensions") for key in entry):
                raise ValueError("standalone package has extra resource policy; migrate explicitly")
            if isinstance(entry, dict) and "extensions" in entry:
                if entry["extensions"] not in ([],):
                    raise ValueError("standalone custom filters require explicit canonical mapping")
                standalone.append((feature, False))
            else:
                standalone.append((feature, True))
            continue
        if isinstance(entry, dict) and is_canonical(source):
            for field in ("extensions", "skills", "prompts", "themes"):
                if field in entry:
                    entry[field] = selectors(entry[field])
        kept.append(entry)
        if is_canonical(source):
            canon.append(len(kept) - 1)
    if len(canon) > 1:
        raise ValueError("multiple canonical package declarations; reconcile explicitly")
    if standalone:
        if canon:
            entry = kept[canon[0]]
            # Independent overrides cannot safely be reconciled with canonical selectors automatically.
            if isinstance(entry, dict) and ("extensions" in entry or entry.get("autoload") is False):
                raise ValueError("standalone declaration plus canonical feature policy is ambiguous")
            if any(not enabled for _, enabled in standalone):
                raise ValueError("standalone disabled features require explicit canonical policy")
        else:
            features = list(dict.fromkeys(feature for feature, enabled in standalone if enabled))
            kept.append({"source": SOURCE, "extensions": ["packages/pi-toolkit/src/features/" + f + "/**" for f in features], "skills": [], "prompts": [], "themes": []})
    if "packages" in result or standalone:
        result["packages"] = kept
    if "extensions" in result:
        result["extensions"] = selectors(result["extensions"])
    return result

def atomic(path, content, mode):
    fd, temp = tempfile.mkstemp(prefix=".toolkit-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(content)
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def execute(agent, apply=False, rollback=None):
    path = Path(agent).expanduser().resolve() / "settings.json"
    if not path.exists():
        print("No existing global settings; no migration required")
        return
    if path.is_symlink():
        raise ValueError("symlinked settings require manual review")
    before = path.read_text()
    current = json.loads(before)
    if rollback:
        backup = Path(rollback).resolve()
        if backup.parent != path.parent or not backup.name.startswith("settings.json.toolkit-backup-"):
            raise ValueError("rollback must reference a toolkit backup in this agent directory")
        original = json.loads(backup.read_text())
        applied = migrate(original)
        result = copy.deepcopy(current)
        for key in set(original) | set(applied):
            if original.get(key) != applied.get(key):
                if current.get(key) != applied.get(key):
                    raise ValueError("targeted field changed after migration; manual rollback required")
                if key in original:
                    result[key] = original[key]
                else:
                    result.pop(key, None)
    else:
        result = migrate(current)
    keys = [k for k in sorted(set(current) | set(result)) if current.get(k) != result.get(k)]
    print("Toolkit migration:", "no changes" if not keys else ", ".join(keys) + " (targeted reference changes)")
    if keys:
        from urllib.parse import urlsplit, urlunsplit
        def safe(value):
            if "://" in value:
                match = re.match(r"^(git|npm):(?=[a-z][a-z\d+.-]*://)", value, re.I)
                prefix = match.group(0) if match else ""
                if not re.match(r"^[a-z][a-z\d+.-]*://", value[len(prefix):], re.I):
                    return "[URL reference]"
                try:
                    parts = urlsplit(value[len(prefix):])
                    return prefix + urlunsplit((parts.scheme, parts.hostname or "", parts.path, "", ""))
                except ValueError:
                    return "[URL reference]"
            return value
        def references(settings):
            refs = {}
            for index, entry in enumerate(settings.get("packages", [])):
                base = "packages[" + str(index) + "]"
                if isinstance(entry, str):
                    refs[base + ".source"] = entry
                else:
                    refs[base + ".source"] = entry.get("source", "")
                    for field in ("extensions", "skills", "prompts", "themes"):
                        if field in entry:
                            refs[base + "." + field] = entry[field]
            if "extensions" in settings:
                refs["extensions"] = settings["extensions"]
            return refs
        old_refs, new_refs = references(current), references(result)
        for key in sorted(set(old_refs) | set(new_refs)):
            before_ref, after_ref = old_refs.get(key), new_refs.get(key)
            if before_ref != after_ref:
                clean = lambda v: [safe(x) for x in v] if isinstance(v, list) else safe(v) if isinstance(v, str) else v
                print(key + ": " + json.dumps(clean(before_ref)) + " -> " + json.dumps(clean(after_ref)))
    if not keys or not apply:
        return
    if path.read_text() != before:
        raise ValueError("settings changed during preview; rerun")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = path.with_name("settings.json.toolkit-backup-" + stamp)
    fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(before)
    # Preserve original mode, capped to private owner read/write.
    atomic(path, json.dumps(result, indent=2) + "\n", 0o600)
    print("Backup:", backup)
    print("Applied narrow toolkit migration. Reload/start a fresh Pi session after updating the shared package.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-dir", default=os.environ.get("PI_CODING_AGENT_DIR", "~/.pi/agent"))
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--rollback")
    args = parser.parse_args()
    try:
        execute(args.agent_dir, args.apply, args.rollback)
    except (ValueError, OSError, TypeError):
        parser.exit(1, "Toolkit migration refused: malformed, ambiguous, changed, or inaccessible settings; no unsafe replacement.\n")

if __name__ == "__main__":
    main()
