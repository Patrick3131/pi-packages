import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config";
import { registerBraveSearchTool } from "./features/search/searchTool";

export { loadConfig, findConfigFile, loadJsonConfig } from "./config";
export type { BraveSearchConfig, BraveSearchJsonConfig } from "./config";
export { registerBraveSearchTool } from "./features/search/searchTool";
export * from "./features/search/types";

interface BraveSearchState {
  enabled: boolean;
}

export default function (pi: ExtensionAPI) {
  const config = loadConfig({
    log: (level, message) => {
      console.log(`[pi-brave-search:${level}] ${message}`);
    },
  });

  console.log(`[pi-brave-search] Initialized with baseUrl: ${config.baseUrl}`);
  console.log(`[pi-brave-search] API key ${config.apiKey ? "configured" : "missing"}`);

  registerBraveSearchTool(pi, config);

  let searchEnabled = config.enabledByDefault;

  function persistState() {
    pi.appendEntry<BraveSearchState>("brave-search-config", { enabled: searchEnabled });
  }

  function applyState(options?: { preserveExplicitSelection?: boolean }) {
    const activeNames = pi.getActiveTools();
    const isActive = activeNames.includes("brave_search");

    if (searchEnabled && !isActive) {
      pi.setActiveTools([...activeNames, "brave_search"]);
      return;
    }

    if (!searchEnabled && isActive) {
      if (options?.preserveExplicitSelection) {
        return;
      }

      pi.setActiveTools(activeNames.filter((name) => name !== "brave_search"));
    }
  }

  function restoreFromBranch(ctx: { sessionManager: { getBranch: () => unknown[] } }) {
    const branchEntries = ctx.sessionManager.getBranch() as Array<{
      type: string;
      customType?: string;
      data?: { enabled?: boolean };
    }>;
    let hasPersistedState = false;

    for (const entry of branchEntries) {
      if (entry.type === "custom" && entry.customType === "brave-search-config") {
        if (entry.data?.enabled !== undefined) {
          searchEnabled = entry.data.enabled;
          hasPersistedState = true;
        }
      }
    }

    const explicitSelection = !hasPersistedState && pi.getActiveTools().includes("brave_search");
    applyState({ preserveExplicitSelection: explicitSelection });

    if (searchEnabled || explicitSelection) {
      console.log(`[pi-brave-search] Brave Search tool enabled.`);
    } else {
      console.log(`[pi-brave-search] Brave Search tool disabled. Use /brave-search-on to enable.`);
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  pi.on("session_fork", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  pi.registerCommand("brave-search-on", {
    description: "Enable the brave_search tool (adds to system prompt)",
    handler: async (_args, ctx) => {
      searchEnabled = true;
      applyState();
      persistState();
      ctx.ui.notify("Brave Search tool enabled", "info");
    },
  });

  pi.registerCommand("brave-search-off", {
    description: "Disable the brave_search tool (removes from system prompt)",
    handler: async (_args, ctx) => {
      searchEnabled = false;
      applyState();
      persistState();
      ctx.ui.notify("Brave Search tool disabled", "info");
    },
  });
}
