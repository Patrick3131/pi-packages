import type { Crawl4AIConfig, ResolvedAuthProfile, ResolvedAuthSelection, ResolveAuthProfileOptions } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeHostname(value: string): string {
  return normalize(value).replace(/^www\./, "");
}

function ensureAbsoluteUrl(value: string): string {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed.replace(/^\/\//, "")}`;
}

function getHostname(value: string): string {
  return new URL(ensureAbsoluteUrl(value)).hostname;
}

function matchesDomain(hostname: string, domain: string): boolean {
  const host = normalizeHostname(hostname);
  const allowed = normalizeHostname(domain);
  return host === allowed || host.endsWith(`.${allowed}`);
}

function assertAllowedDomains(name: string, profile: ResolvedAuthProfile, urls: string[]): void {
  if (!profile.matchDomains?.length) return;
  const invalid = urls.filter((url) => !profile.matchDomains!.some((domain) => matchesDomain(getHostname(url), domain)));
  if (invalid.length > 0) {
    throw new Error(`Auth profile "${name}" is not allowed for: ${invalid.join(", ")}. Allowed domains: ${profile.matchDomains.join(", ")}`);
  }
}

function singleMatch(matches: Array<[string, ResolvedAuthProfile]>, target: string, kind: string): [string, ResolvedAuthProfile] | undefined {
  if (matches.length === 0) return undefined;
  if (matches.length > 1) {
    throw new Error(`Multiple auth profiles match ${kind} "${target}": ${matches.map(([name]) => name).join(", ")}. Specify authProfile explicitly.`);
  }
  return matches[0];
}

function resolveBySite(profiles: Record<string, ResolvedAuthProfile>, site: string): ResolvedAuthSelection | undefined {
  const match = singleMatch(Object.entries(profiles).filter(([, profile]) => profile.matchSites?.includes(normalize(site))), site, "site");
  return match ? { profileName: match[0], profile: match[1], reason: "site" } : undefined;
}

function resolveByDomain(profiles: Record<string, ResolvedAuthProfile>, urls: string[]): ResolvedAuthSelection | undefined {
  const hosts = Array.from(new Set(urls.map((url) => normalizeHostname(getHostname(url)))));
  const matches = Object.entries(profiles).filter(([, profile]) => profile.matchDomains?.length
    && hosts.every((host) => profile.matchDomains!.some((domain) => matchesDomain(host, domain))));
  const match = singleMatch(matches, hosts.join(", "), "domains");
  return match ? { profileName: match[0], profile: match[1], reason: "domain" } : undefined;
}

export function resolveAuthSelection(config: Crawl4AIConfig, options: ResolveAuthProfileOptions): ResolvedAuthSelection | undefined {
  const profiles = config.raw.authProfiles;
  if (!profiles || Object.keys(profiles).length === 0) return undefined;

  if (options.authProfile) {
    const profile = profiles[options.authProfile];
    if (!profile) {
      throw new Error(`Unknown auth profile "${options.authProfile}". Available profiles: ${Object.keys(profiles).join(", ")}`);
    }
    assertAllowedDomains(options.authProfile, profile, options.urls);
    return { profileName: options.authProfile, profile, reason: "explicit-profile" };
  }

  const siteMatch = options.site ? resolveBySite(profiles, options.site) : undefined;
  const match = siteMatch || resolveByDomain(profiles, options.urls);
  if (match) assertAllowedDomains(match.profileName, match.profile, options.urls);
  return match;
}
