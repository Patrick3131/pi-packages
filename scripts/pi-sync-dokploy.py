"""Dokploy transport: disabled per-run tasks, verified logs, no SSH/sudo."""
import base64
import json
import os
from pathlib import Path
import shlex
import shutil
import urllib.error
import urllib.parse
import urllib.request
import uuid

# Exactly one remote target. No repository/container-name scanning.
COMPOSE_ID = "_aUWwRNm5fjVkxzUFO4_J"
APP_NAME = "tools-remotecoding-wmvl3i"
SERVICE = "paseo"


class Dokploy:
    def __init__(self):
        url = os.environ.get("DOKPLOY_URL")
        token = os.environ.get("DOKPLOY_API_KEY") or os.environ.get("DOKPLOY_AUTH_TOKEN")
        if not (url and token):
            cli = shutil.which("dokploy")
            config = Path(cli).resolve().parents[1] / "config.json" if cli else None
            if not config or not config.is_file():
                raise RuntimeError("Authenticate dokploy first, or set DOKPLOY_URL and DOKPLOY_API_KEY")
            auth = json.loads(config.read_text())
            url, token = auth.get("url"), auth.get("token")
        if not url or not token:
            raise RuntimeError("Incomplete Dokploy authentication")
        if urllib.parse.urlsplit(url).scheme != "https":
            raise RuntimeError("Dokploy URL must use HTTPS")
        self.url, self.token = url.rstrip("/"), token

    def api(self, endpoint, data, mutation=False, timeout=30):
        envelope = json.dumps({"json": data}).encode()
        url = self.url + "/api/trpc/" + endpoint
        if not mutation:
            url += "?" + urllib.parse.urlencode({"input": envelope.decode()})
        request = urllib.request.Request(url, data=envelope if mutation else None,
                                         headers={"x-api-key": self.token, "Content-Type": "application/json"},
                                         method="POST" if mutation else "GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # Never dump request headers, auth config or arbitrary error bodies.
            raise RuntimeError(f"Dokploy {endpoint}: HTTP {error.code}") from None
        except (urllib.error.URLError, TimeoutError) as error:
            raise RuntimeError(f"Dokploy {endpoint}: connection failed/timed out; execution may still be running") from None
        if "error" in result:
            raise RuntimeError(f"Dokploy {endpoint}: API error")
        try:
            return result["result"]["data"]["json"]
        except (KeyError, TypeError):
            raise RuntimeError(f"Dokploy {endpoint}: unexpected response") from None

    def verify_target(self):
        compose = self.api("compose.one", {"composeId": COMPOSE_ID})
        if compose.get("appName") != APP_NAME:
            raise RuntimeError("Dokploy compose identity changed; verify remote target before syncing")

    def remote(self, args, worker_source, apply=False):
        token = uuid.uuid4().hex
        mode = "apply" if apply else "check"
        worker_args = ["--worker", "--agent-dir", "/data/pi-agent", "--pi-bin-dir", "/data/pi-runtime/bin",
                       "--revision", args.revision, "--result-token", token]
        if getattr(args, "toolkit_only", False):
            worker_args += ["--toolkit-only"]
        if apply:
            worker_args += ["--apply"]
        elif args.require_approval:
            worker_args += ["--require-approval"]
        if args.accept_config:
            worker_args += ["--accept-config"]
        encoded = base64.b64encode(worker_source.encode()).decode()
        python = "import base64; exec(compile(base64.b64decode(" + repr(encoded) + "), '<pi-sync-worker>', 'exec'))"
        command = shlex.join(["gosu", "paseo", "flock", "-w", "30", "/data/paseo-update.lock",
                              "python3", "-c", python] + worker_args)
        task = self.api("schedule.create", {
            "name": "pi-sync-" + mode + "-" + token[:8],
            "description": "Temporary manual Pi sync; never scheduled automatically",
            "cronExpression": "0 0 1 1 *", "enabled": False, "scheduleType": "compose",
            "composeId": COMPOSE_ID, "serviceName": SERVICE, "shellType": "bash", "command": command,
        }, mutation=True)
        task_id = task["scheduleId"]
        print(f"Dokploy {mode} task: {task_id} (disabled)", flush=True)
        if task.get("enabled") is not False:
            # Fail closed if the server ignored the disabled flag.
            self.api("schedule.delete", {"scheduleId": task_id}, mutation=True)
            raise RuntimeError("Dokploy task unexpectedly enabled; removed without running")
        try:
            # v0.30.6 returns only after execution finishes, with its actual status.
            # Do not retry mutations: a timeout may leave an active task.
            result = self.api("schedule.runManually", {"scheduleId": task_id}, mutation=True, timeout=600)
            deployment_id = result.get("deploymentId")
            if not deployment_id:
                raise RuntimeError("Dokploy returned no deployment ID; cannot verify completion")
            log = self.api("deployment.readLogs", {"deploymentId": deployment_id, "tail": 10000})
            if not isinstance(log, str):
                raise RuntimeError("Dokploy returned invalid logs")
            # Dokploy logs the entire encoded command; omit that noisy line.
            print("\n".join(line for line in log.splitlines() if not line.startswith("docker exec ")), flush=True)
            expected = f"PI_SYNC_RESULT {token} {args.revision} {mode}"
            if result.get("status") != "done" or expected not in log.splitlines():
                raise RuntimeError(f"Remote {mode} failed or completion marker missing; deployment {deployment_id}")
        except Exception:
            print(f"Retained disabled Dokploy task {task_id} for inspection. Do not rerun until any active execution has finished.", flush=True)
            raise
        self.api("schedule.delete", {"scheduleId": task_id}, mutation=True)
        print(f"Verified remote {mode}; temporary task removed.", flush=True)
