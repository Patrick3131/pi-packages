import { homedir } from "node:os";
import { resolve } from "node:path";

export function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
export function object(value: unknown): Record<string, unknown> {
 return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
}
export function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }
export function localPath(source: string, base: string): string { return resolve(base, source.startsWith("~/") ? homedir()+source.slice(1) : source); }
/** Display sources without URL credentials, query or fragment. Never return raw URL on parse failure. */
export function safeSource(source: string): string {
 const prefix = /^(git|npm):(?=[a-z][a-z\d+.-]*:\/\/)/i.exec(source)?.[0] ?? (source.startsWith("git:") ? "git:" : "");
 const bare = prefix ? source.slice(prefix.length) : source;
 if (bare.includes("://")) {
  if(!/^[a-z][a-z\d+.-]*:\/\//i.test(bare))return "[unsupported URL source]";
  try { const url = new URL(bare); url.username=""; url.password=""; url.search=""; url.hash=""; return prefix+url.toString(); }
  catch { return "[invalid URL source]"; }
 }
 if (bare.startsWith("git@")) return prefix + bare.replace(/^git@/, "").replace(":", "/").split(/[?#]/)[0];
 return source.split(/[?#]/)[0]!;
}
export function packageIdentity(source: string, base: string): string {
 if(source.startsWith("npm:")) return source.includes("://") ? "unknown:"+safeSource(source) : "npm:"+source.slice(4).replace(/(?<!^)@[^/]*$/, "");
 if(source.startsWith("git:") || /^https?:/.test(source) || source.startsWith("git@")) {
  let value = safeSource(source).replace(/^git:/,"").replace(/^https?:\/\//,"").replace(/^ssh:\/\//,"");
  value=value.replace(/@[^/]*$/,"").replace(/\.git\/?$/,"").replace(/\/$/,"");
  return "git:"+value;
 }
 if(source.includes("://"))return "unknown:"+safeSource(source);
 return "local:"+localPath(source,base);
}
export function anchor(kind: string, index: number): string { return kind+"-"+index; }
