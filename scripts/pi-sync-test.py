import importlib.util
import json
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("pi_sync", Path(__file__).with_name("pi-sync.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class SyncTest(unittest.TestCase):
    def test_settings_preserve_preferences_and_extra_packages(self):
        current = {"defaultModel": "personal", "subagents": {"model": "custom"},
                   "packages": ["npm:extra", {"source": sync.SOURCE, "skills": []}]}
        snapshot = {"defaultModel": "other", "packages": [sync.SOURCE, "npm:shared"]}
        merged = sync.merged_settings(current, snapshot)
        self.assertEqual(merged["defaultModel"], "personal")
        self.assertEqual(merged["subagents"], current["subagents"])
        self.assertEqual(merged["packages"], ["npm:extra", sync.SOURCE, "npm:shared"])
        self.assertEqual(sync.merged_settings(merged, snapshot), merged)
        self.assertEqual(current["packages"][1]["skills"], [])

    def test_check_apply_backup_and_idempotence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot, agent = root / "configs/global", root / "agent"
            snapshot.mkdir(parents=True)
            agent.mkdir()
            settings = {"defaultProvider": "personal", "packages": [sync.SOURCE]}
            (agent / "settings.json").write_text(json.dumps(settings))
            (snapshot / "settings.json").write_text(json.dumps(settings))
            for name in sync.FILES:
                (snapshot / name).write_text("published\n")
            (snapshot / "agents").mkdir()
            (snapshot / "agents/researcher.md").write_text("agent")
            (agent / "presets.json").write_text("old\n")
            (agent / "auth.json").write_text("secret")
            args = SimpleNamespace(agent_dir=str(agent), pi_bin_dir="", revision="abc",
                                   apply=False, accept_config=False, require_approval=False)
            with patch.object(sync.shutil, "which", return_value="/bin/pi"), patch.object(sync, "run") as run, patch.object(sync.subprocess, "check_output", return_value="abc\n"):
                sync.target(args, root)
                run.assert_not_called()
                self.assertEqual((agent / "presets.json").read_text(), "old\n")
                args.require_approval = True
                with self.assertRaisesRegex(RuntimeError, "Config differs"):
                    sync.target(args, root)
                run.assert_not_called()
                args.accept_config = True
                args.apply = True
                sync.target(args, root)
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0], ["pi", "update", sync.SOURCE, "--no-approve"])
                self.assertEqual(run.call_args.kwargs["cwd"], agent.resolve())
            self.assertEqual((agent / "auth.json").read_text(), "secret")
            self.assertEqual(list(agent.glob("presets.json.bak.*"))[0].read_text(), "old\n")
            self.assertEqual(sync.changes(snapshot, agent), [])
            self.assertTrue((agent / "extensions/subagent/worktree-setup.mjs").stat().st_mode & 0o100)

    def test_both_preflight_before_apply_and_remote_transport(self):
        events = []
        def target(args, checkout):
            events.append(("local", args.apply, args.require_approval))
        from unittest.mock import Mock
        client = Mock()
        def remote(args, worker_source, apply=False):
            events.append(("remote", apply, args.require_approval))
            self.assertIn("def main", worker_source)
        client.remote.side_effect = remote
        with patch.object(sys, "argv", ["pi-sync", "--apply", "--accept-config"]), patch.object(sync, "dokploy_client", return_value=client), patch.object(sync, "target", side_effect=target), patch.object(sync, "run"), patch.object(sync.subprocess, "check_output", return_value="revision\n"):
            sync.main()
        self.assertEqual(events, [("local", False, True), ("remote", False, True),
                                  ("local", True, True), ("remote", True, True)])
        client.verify_target.assert_called_once()

    def test_remote_preflight_failure_prevents_local_apply(self):
        events = []
        def target(args, checkout):
            events.append(args.apply)
        from unittest.mock import Mock
        client = Mock()
        client.remote.side_effect = RuntimeError("remote unavailable")
        with patch.object(sys, "argv", ["pi-sync", "--apply"]), patch.object(sync, "dokploy_client", return_value=client), patch.object(sync, "target", side_effect=target), patch.object(sync, "run"), patch.object(sync.subprocess, "check_output", return_value="revision\n"):
            with self.assertRaisesRegex(RuntimeError, "remote unavailable"):
                sync.main()
        self.assertEqual(events, [False])


    def test_revision_mismatch_does_not_write_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent = Path(tmp)
            (agent / "settings.json").write_text(json.dumps({"packages": [sync.SOURCE]}))
            args = SimpleNamespace(agent_dir=tmp, pi_bin_dir="", revision="expected",
                                   apply=True, accept_config=True, require_approval=False)
            with patch.object(sync.shutil, "which", return_value="/bin/pi"), patch.object(sync, "changes", return_value=[]), patch.object(sync, "run"), patch.object(sync.subprocess, "check_output", return_value="different\n"), patch.object(sync, "write_changes") as write:
                with self.assertRaisesRegex(RuntimeError, "branch moved"):
                    sync.target(args, agent)
                write.assert_not_called()


class DokployTest(unittest.TestCase):
    def setUp(self):
        import runpy
        self.module = runpy.run_path(str(Path(__file__).with_name("pi-sync-dokploy.py")))
        self.client = self.module["Dokploy"].__new__(self.module["Dokploy"])
        self.client.url, self.client.token = "https://dokploy.example", "test-secret"
        self.args = SimpleNamespace(revision="abc", require_approval=False, accept_config=False)

    def test_get_and_post_use_superjson_envelope(self):
        import io
        import urllib.parse
        requests = []
        def open_request(request, **kwargs):
            requests.append(request)
            return io.BytesIO(b'{"result":{"data":{"json":[]}}}')
        with patch("urllib.request.urlopen", side_effect=open_request):
            self.client.api("docker.getContainers", {})
            self.client.api("schedule.create", {"enabled": False}, mutation=True)
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(requests[0].full_url).query)
        self.assertEqual(json.loads(query["input"][0]), {"json": {}})
        self.assertEqual(json.loads(requests[1].data), {"json": {"enabled": False}})
        self.assertNotIn("test-secret", requests[0].full_url)

    def fake_api(self, status="done", marker=True, enabled=False):
        from unittest.mock import Mock
        import shlex
        def api(endpoint, data, **kwargs):
            if endpoint == "schedule.create":
                self.assertIs(data["enabled"], False)
                self.assertEqual(data["serviceName"], "paseo")
                self.assertEqual(data["composeId"], self.module["COMPOSE_ID"])
                parts = shlex.split(data["command"])
                self.assertEqual(parts[:7], ["gosu", "paseo", "flock", "-w", "30", "/data/paseo-update.lock", "python3"])
                token = parts[parts.index("--result-token") + 1]
                self.expected = f"PI_SYNC_RESULT {token} abc check"
                self.assertNotIn("test-secret", data["command"])
                return {"scheduleId": "task", "enabled": enabled}
            if endpoint == "schedule.runManually":
                return {"status": status, "deploymentId": "deployment"}
            if endpoint == "deployment.readLogs":
                return self.expected if marker else "docker exec fake " + self.expected
            if endpoint == "schedule.delete":
                return True
            raise AssertionError(endpoint)
        return Mock(side_effect=api)

    def test_verified_task_is_deleted(self):
        self.client.api = self.fake_api()
        self.client.remote(self.args, "print('worker')")
        self.assertEqual(self.client.api.call_args.args[0], "schedule.delete")

    def test_done_without_exact_marker_and_failed_tasks_are_retained(self):
        for status, marker in [("done", False), ("error", True)]:
            self.client.api = self.fake_api(status=status, marker=marker)
            with self.assertRaisesRegex(RuntimeError, "failed or completion marker missing"):
                self.client.remote(self.args, "print('worker')")
            self.assertNotIn("schedule.delete", [call.args[0] for call in self.client.api.call_args_list])

    def test_unexpectedly_enabled_task_is_removed_without_execution(self):
        self.client.api = self.fake_api(enabled=True)
        with self.assertRaisesRegex(RuntimeError, "unexpectedly enabled"):
            self.client.remote(self.args, "print('worker')")
        self.assertNotIn("schedule.runManually", [call.args[0] for call in self.client.api.call_args_list])

    def test_changed_compose_identity_fails_closed(self):
        from unittest.mock import Mock
        self.client.api = Mock(return_value={"appName": "wrong"})
        with self.assertRaisesRegex(RuntimeError, "identity changed"):
            self.client.verify_target()



if __name__ == "__main__":
    unittest.main()
