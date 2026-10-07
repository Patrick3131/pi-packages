export type Scope = "user" | "project" | "temporary";
export interface Source { path?: string; source?: string; scope?: string; baseDir?: string }
export interface Capability { name: string; description?: string; exposure?: string; source?: string; sourceInfo?: Source; namespace?: { name?: string } }
export interface ProviderObservation { id: string; configured?: boolean; authSource?: string; available?: number; count?: number }
export interface RuntimeSnapshot {
 tools?: Capability[]; activeTools?: string[]; commands?: Capability[]; skills?: {name: string; description?: string; filePath?: string; source?: string}[];
 model?: {provider: string; id: string}; thinking?: string; presets?: readonly unknown[];
 providers?: ProviderObservation[]; mcpRegistrations?: {name: string; config?: unknown; extensionPath?: string}[];
 hiddenTools?: string[]; settings?: unknown;
}
export interface Item {
 id: string; name: string; scope?: string; source: string; description?: string; status: string[];
 facts: Record<string, string | string[]>; links: string[];
}
export interface Overview {
 version: 1; generatedAt: string;
 header: {cwd: string; agentDir: string; trusted: boolean; model: string; defaultModel: string; thinking: string; preset: string; theme: string};
 packages: Item[]; extensions: Item[]; commands: Item[]; skills: Item[]; tools: Item[]; presets: Item[]; mcp: Item[]; providers: Item[];
 relationships: {from: string; to: string; label: string}[]; warnings: string[];
}
export interface CollectOptions { agentDir: string; cwd: string; trusted: boolean; runtime: RuntimeSnapshot; generatedAt?: string }
