import type { RpcInput } from "@getpaseo/plugin";
import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useRpc, useWorkspace } from "@getpaseo/plugin/client";
import { ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  previewRunRpc,
  workspaceStatusRpc,
  worktreeRunRpc,
  type PreviewAction,
  type WorktreeAction,
} from "../shared/contracts";

type WorktreeInput = RpcInput<typeof worktreeRunRpc>;

interface ActionResult {
  readonly label: string;
  readonly code: number;
  readonly output: string;
}

/** Actions whose UI key requires a second press because they touch a shared branch. */
const CONFIRM_ACTIONS = new Set(["merge:production", "merge-push:production", "push-branch:production"]);

const WORKTREE_LABELS: Partial<Record<WorktreeAction, string>> = {
  create: "Create task worktree",
  commit: "Commit",
  discard: "Discard",
  sync: "Sync",
  push: "Push",
  "push-current": "Push current branch",
  "sync-branch": "Sync branch",
  "push-branch": "Push branch",
  merge: "Merge",
  "merge-push": "Merge-push",
  publish: "Publish",
  remove: "Remove task worktree",
  list: "List worktrees",
};

const PREVIEW_LABELS: Record<PreviewAction, string> = {
  start: "Start preview",
  "start-all": "Start all apps",
  status: "Preview status",
  logs: "Preview logs",
  stop: "Stop preview",
};

export function MelonPanel({ theme, layout, workspaceId }: PluginWorkspacePanelProps) {
  const workspace = useWorkspace(workspaceId, (snapshot) => ({
    directory: snapshot.directory,
    name: snapshot.name,
    kind: snapshot.kind,
  }));
  const directory = workspace?.directory ?? null;

  const runWorktreeRpc = useRpc(worktreeRunRpc);
  const runPreviewRpc = useRpc(previewRunRpc);
  const runStatusRpc = useRpc(workspaceStatusRpc);
  const toast = useToast();

  const [owner, setOwner] = useState<"pi" | "codex">("pi");
  const [task, setTask] = useState("");
  const [base, setBase] = useState("staging");
  const [message, setMessage] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [last, setLast] = useState<ActionResult | null>(null);

  const status = useQuery({
    queryKey: ["melon-status", directory],
    enabled: directory !== null,
    queryFn: () => runStatusRpc({ directory: directory ?? "" }),
  });

  const worktree = useMutation({
    mutationFn: (input: WorktreeInput) => runWorktreeRpc(input),
    onSuccess: (result, input) => {
      setLast({ label: WORKTREE_LABELS[input.action] ?? input.action, code: result.code, output: result.output });
      setArmed(null);
      if (result.code === 0) {
        setMessage("");
        if (input.action === "create") {
          setTask("");
          toast.show("Worktree ready", { variant: "success" });
        }
      } else {
        toast.error(`${WORKTREE_LABELS[input.action] ?? input.action} failed (exit ${result.code})`);
      }
      void status.refetch();
    },
    onError: (error, input) =>
      setLast({
        label: WORKTREE_LABELS[input.action] ?? input.action,
        code: 1,
        output: error instanceof Error ? error.message : String(error),
      }),
  });

  const preview = useMutation({
    mutationFn: (action: PreviewAction) => runPreviewRpc({ directory: directory ?? "", action }),
    onSuccess: (result, action) => {
      setLast({ label: PREVIEW_LABELS[action], code: result.code, output: result.output });
      if (result.code !== 0) {
        toast.error(`${PREVIEW_LABELS[action]} failed (exit ${result.code})`);
      }
      void status.refetch();
    },
    onError: (error, action) =>
      setLast({
        label: PREVIEW_LABELS[action],
        code: 1,
        output: error instanceof Error ? error.message : String(error),
      }),
  });

  const pending = worktree.isPending || preview.isPending;

  const styles = useMemo(() => {
    const gap = layout.compact ? 10 : 14;
    return {
      screen: { flex: 1, padding: layout.compact ? 12 : 18, backgroundColor: theme.colors.surface0, gap },
      title: { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" as const },
      detail: { color: theme.colors.foregroundMuted, fontSize: 12 },
      sectionTitle: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        letterSpacing: 0.6,
        textTransform: "uppercase" as const,
      },
      group: { gap: 8 },
      row: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, alignItems: "center" as const },
      button: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface2,
      },
      buttonArmed: { backgroundColor: theme.colors.statusWarning, borderColor: theme.colors.statusWarning },
      buttonPressed: { backgroundColor: theme.colors.surface1 },
      buttonText: { color: theme.colors.foreground, fontSize: 13 },
      buttonTextMuted: { color: theme.colors.foregroundMuted, fontSize: 13 },
      chip: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      chipActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
      chipText: { color: theme.colors.foreground, fontSize: 12 },
      chipTextActive: { color: theme.colors.accentForeground, fontSize: 12 },
      input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        fontSize: 13,
      },
      outputWrap: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, backgroundColor: theme.colors.surface1 },
      outputHeader: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        alignItems: "center" as const,
        flexDirection: "row" as const,
        justifyContent: "space-between" as const,
      },
      outputBody: { padding: 10 },
      mono: { color: theme.colors.foreground, fontSize: 11, fontFamily: "monospace" as const },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
    };
  }, [theme, layout.compact]);

  if (workspace === null || directory === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Melon Workspaces</Text>
        <Text style={styles.detail}>This workspace is not available on the connected host.</Text>
      </View>
    );
  }

  function runWorktreeAction(id: string, input: Omit<WorktreeInput, "directory">) {
    if (CONFIRM_ACTIONS.has(id) && armed !== id) {
      setArmed(id);
      setLast({
        label: WORKTREE_LABELS[input.action] ?? input.action,
        code: 0,
        output: "This changes a shared branch. Press the same button again to confirm.",
      });
      return;
    }
    setArmed(null);
    worktree.mutate({ ...input, directory: directory ?? "" });
  }

  function runPreviewAction(action: PreviewAction) {
    setArmed(null);
    preview.mutate(action);
  }

  const branch = status.data?.branch ?? null;
  const previewSummary = (() => {
    if (status.isLoading) return "loading…";
    const raw = status.data?.preview ?? null;
    if (raw === null) return status.data?.previewError ?? "Preview unavailable.";
    try {
      const parsed = JSON.parse(raw) as { status?: string; branch?: string; url?: string; error?: string };
      const parts = [parsed.status ?? raw];
      if (parsed.branch) parts.push(parsed.branch);
      if (parsed.url) parts.push(parsed.url);
      if (parsed.error) parts.push(parsed.error);
      return parts.join(" · ");
    } catch {
      return raw;
    }
  })();

  const button = (id: string, label: string, onPress: () => void, disabled = false) => (
    <Pressable
      key={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || pending}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        armed === id ? styles.buttonArmed : null,
        pressed ? styles.buttonPressed : null,
        disabled || pending ? { opacity: 0.5 } : null,
      ]}
    >
      <Text style={styles.buttonText}>{armed === id ? `${label} — confirm?` : label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.group}>
        <Text style={styles.title}>{workspace.name}</Text>
        <Text style={styles.detail}>{`Branch ${branch ?? "—"} · ${workspace.kind}`}</Text>
        <Text style={styles.detail}>
          {status.data?.owner
            ? `Owner ${status.data.owner} · task ${status.data.task ?? "—"}`
            : "No Melon task branch checked out"}
        </Text>
        <Text style={styles.detail}>Preview: {previewSummary}</Text>
      </View>

      <View style={styles.group}>
        <Text style={styles.sectionTitle}>Task</Text>
        <View style={styles.row}>
          {(["pi", "codex"] as const).map((candidate) => (
            <Pressable
              key={candidate}
              accessibilityRole="button"
              accessibilityLabel={`Owner ${candidate}`}
              onPress={() => setOwner(candidate)}
              style={[styles.chip, owner === candidate ? styles.chipActive : null]}
            >
              <Text style={owner === candidate ? styles.chipTextActive : styles.chipText}>{candidate}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="task name (fix-crawl)"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={task}
          onChangeText={setTask}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="base branch (staging)"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={base}
          onChangeText={setBase}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          {button("create", "Create task worktree", () =>
            runWorktreeAction("create", { action: "create", owner, task, base }), task.trim().length === 0)}
          {button("remove", "Remove task worktree", () =>
            runWorktreeAction("remove", { action: "remove", owner, task }), task.trim().length === 0)}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.sectionTitle}>Git</Text>
        <TextInput
          style={styles.input}
          placeholder="commit message"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={message}
          onChangeText={setMessage}
        />
        <View style={styles.row}>
          {button("commit", "Commit", () =>
            runWorktreeAction("commit", { action: "commit", message }), message.trim().length === 0)}
          {button("discard", "Discard", () => runWorktreeAction("discard", { action: "discard" }))}
          {button("sync", "Sync", () => runWorktreeAction("sync", { action: "sync", base }))}
          {button("push", "Push", () => runWorktreeAction("push", { action: "push" }))}
          {button("publish", "Publish", () =>
            runWorktreeAction("publish", { action: "publish", owner, task }), task.trim().length === 0)}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.sectionTitle}>Integrate</Text>
        <View style={styles.row}>
          {button("merge:staging", "Merge → staging", () =>
            runWorktreeAction("merge:staging", { action: "merge", target: "staging" }))}
          {button("merge-push:staging", "Merge-push → staging", () =>
            runWorktreeAction("merge-push:staging", { action: "merge-push", target: "staging" }))}
          {button("merge:production", "Merge → production", () =>
            runWorktreeAction("merge:production", { action: "merge", target: "production" }))}
          {button("merge-push:production", "Merge-push → production", () =>
            runWorktreeAction("merge-push:production", { action: "merge-push", target: "production" }))}
          {button("push-branch:production", "Push staging → production", () =>
            runWorktreeAction("push-branch:production", {
              action: "push-branch",
              branch: "staging",
              target: "production",
            }))}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.row}>
          {button("preview:start", "Start preview", () => runPreviewAction("start"))}
          {button("preview:start-all", "Start all apps", () => runPreviewAction("start-all"))}
          {button("preview:status", "Preview status", () => runPreviewAction("status"))}
          {button("preview:logs", "Preview logs", () => runPreviewAction("logs"))}
          {button("preview:stop", "Stop preview", () => runPreviewAction("stop"))}
          {button("refresh", "Refresh status", () => void status.refetch())}
        </View>
      </View>

      <View style={styles.outputWrap}>
        <View style={styles.outputHeader}>
          <Text style={styles.detail}>
            {last === null ? "No action run yet" : `${last.label} — exit ${last.code}`}
          </Text>
          {pending || status.isFetching ? <ActivityIndicator size="small" color={theme.colors.accent} /> : null}
        </View>
        <ScrollView style={styles.outputBody} contentContainerStyle={styles.outputBody}>
          <Text selectable style={last !== null && last.code !== 0 ? styles.error : styles.mono}>
            {last?.output ?? ""}
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}
