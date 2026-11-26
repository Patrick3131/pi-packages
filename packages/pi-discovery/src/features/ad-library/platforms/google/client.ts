import { Check } from "typebox/value";
import {
  AdLibraryClientError,
  postAdLibrary,
  type AdLibraryOptions,
} from "../../transport.js";
import {
  GOOGLE_PAGE_SIZE,
  googleParameters,
  googleResponse,
  type GoogleAdsParams,
  type GoogleAdsResult,
} from "./schema.js";

export {
  AdLibraryClientError,
  type AdLibraryOptions,
} from "../../transport.js";

/**
 * Client-side mirror of the server's request model: unknown keys, exactly one
 * selector, hostname shape, `AR…` advertiser ids, `anywhere` or an ISO
 * 3166-1 alpha-2 country, and the family budget bounds.
 */
export function googleAdsRequest(
  params: GoogleAdsParams,
): GoogleAdsParams & {
  country: string;
  media_type: NonNullable<GoogleAdsParams["media_type"]>;
  max_ads: number;
  timeout_ms: number;
} {
  const p = { ...params };
  if (Object.keys(p).some((k) => !(k in googleParameters.properties)))
    throw new AdLibraryClientError("invalid_request");
  for (const key of ["domain", "advertiser_id"] as const) {
    if (p[key] !== undefined && typeof p[key] !== "string")
      throw new AdLibraryClientError("invalid_request");
    if (typeof p[key] === "string") p[key] = p[key]!.trim();
  }
  if (
    [p.domain, p.advertiser_id].filter((x) => x !== undefined).length !== 1 ||
    (p.domain !== undefined && (!p.domain || p.domain.length > 253))
  )
    throw new AdLibraryClientError("invalid_request");
  if (p.advertiser_id !== undefined && !/^AR[0-9]{6,}$/.test(p.advertiser_id))
    throw new AdLibraryClientError("invalid_request");
  if (p.domain !== undefined) {
    p.domain = p.domain.toLowerCase().replace(/^www\./, "");
    if (
      p.domain.length < 3 ||
      !p.domain.includes(".") ||
      p.domain
        .split(".")
        .some((x) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))
    )
      throw new AdLibraryClientError("invalid_request");
  }
  if (p.cursor !== undefined && !/^[\x21-\x7e]{1,65536}$/.test(p.cursor))
    throw new AdLibraryClientError("invalid_request");
  const body = {
    ...p,
    country: (() => {
      const raw = (p.country ?? "anywhere").trim();
      return raw.toLowerCase() === "anywhere"
        ? "anywhere"
        : raw.toUpperCase();
    })(),
    media_type: p.media_type ?? "all",
    max_ads: p.max_ads === undefined ? GOOGLE_PAGE_SIZE : p.max_ads,
    timeout_ms: p.timeout_ms ?? 120000,
  };
  if (
    !/^(anywhere|[A-Z]{2})$/.test(body.country) ||
    !Number.isSafeInteger(body.max_ads) ||
    body.max_ads < 1 ||
    body.max_ads > 300 ||
    !Number.isSafeInteger(body.timeout_ms) ||
    body.timeout_ms < 5000 ||
    body.timeout_ms > 180000
  )
    throw new AdLibraryClientError("invalid_request");
  return body;
}

function parseResult(data: unknown, requestedCap: number): GoogleAdsResult {
  const fail = () => {
    throw new AdLibraryClientError("malformed");
  };
  if (!Check(googleResponse, data)) return fail();
  const result = data as GoogleAdsResult;
  const effectiveCap = Math.max(GOOGLE_PAGE_SIZE, requestedCap);
  const adjustment = result.max_ads_adjustment ?? null;
  const validAdjustment =
    requestedCap < effectiveCap
      ? adjustment?.requested === requestedCap &&
        adjustment.effective === GOOGLE_PAGE_SIZE
      : adjustment === null;
  if (
    !validAdjustment ||
    result.ads.length > effectiveCap ||
    new Set(result.ads.map((a) => a.archive_id)).size !== result.ads.length ||
    result.truncated !== result.truncation.length > 0 ||
    result.partial !== (result.failed_pages?.length ?? 0) > 0
  )
    return fail();
  return result;
}

export async function searchGoogleAds(
  params: GoogleAdsParams,
  options: AdLibraryOptions = {},
): Promise<GoogleAdsResult> {
  if (options.signal?.aborted)
    throw new DOMException("Ad library cancelled.", "AbortError");
  if (!Check(googleParameters, params))
    throw new AdLibraryClientError("invalid_request");
  const body = googleAdsRequest(params);
  return parseResult(
    await postAdLibrary("/v1/ad-library/google/search", body, options),
    body.max_ads,
  );
}

const clean = (value: unknown, cap = 400) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  return text.length > cap ? text.slice(0, cap) + "… [text shortened]" : text;
};
const link = (value: unknown) => (typeof value === "string" ? value : "");

function transparencyUrl(result: GoogleAdsResult): string {
  const key = result.mode === "domain" ? "domain" : "advertiser";
  return `https://adstransparency.google.com/?${key}=${encodeURIComponent(result.query)}&region=${encodeURIComponent(result.country)}`;
}

/** Model-visible evidence is bounded; programmatic structured output keeps all data. */
export function formatGoogleAds(
  result: GoogleAdsResult,
  showCursor = true,
  params?: GoogleAdsParams,
) {
  const lines = [
    `Google ads · ${result.ads.length} ads returned · ${result.mode}: ${result.query} · region ${result.country} · media ${result.media_type}`,
  ];
  if (params && (params.domain || params.advertiser_id))
    lines.push(`Requested selector: ${params.domain ?? params.advertiser_id}.`);
  if (result.total_ad_count != null)
    lines.push(
      `Google declares ${result.total_ad_count} total ads; advisory only — completion is token-driven.`,
    );
  if (result.max_ads_adjustment)
    lines.push(
      `Requested ${result.max_ads_adjustment.requested} ads; effective limit raised to ${result.max_ads_adjustment.effective} (one Google page).`,
    );
  if (result.copy_unparsed)
    lines.push(
      `${result.copy_unparsed} ad(s) carry a preview overlay that did not decode (copy_unparsed): overlay drift is possible.`,
    );
  for (const failure of result.failed_pages ?? [])
    lines.push(
      `Page ${failure.page}: ${failure.stage ?? "results"} (${failure.error_code}${failure.reason ? ", " + failure.reason : ""}${failure.http_status ? ", HTTP " + failure.http_status : ""}).`,
    );
  if (result.retry_after_s != null)
    lines.push(`Rate limited; retry after ${result.retry_after_s} s.`);
  lines.push(
    `Complete: ${result.complete}. Partial: ${result.partial}. Copy unparsed: ${result.copy_unparsed}.`,
  );
  if (result.truncated)
    lines.push(`Truncated: ${result.truncation.join(", ")}.`);
  if (showCursor && !result.complete && result.next_cursor)
    lines.push(
      `Next: pass cursor="${result.next_cursor}" with the same selector to continue; stop when complete is true.`,
    );
  else if (showCursor && !result.complete && !result.next_cursor)
    lines.push(
      "Incomplete sample. No continuation token is available; restart later or widen media_type.",
    );
  if (!result.ads.length)
    lines.push(
      "No ads found. Google reports zero ads for unknown advertisers — verify the domain or advertiser_id.",
    );
  let text = lines.join("\n");
  let shown = 0;
  for (const ad of result.ads.slice(0, 5)) {
    const copy = ad.ad_copy;
    const block = [
      `Ad ${ad.archive_id} | ${ad.advertiser_name ?? "Unknown advertiser"}${ad.advertiser_id ? " | " + ad.advertiser_id : ""}`,
      `Ad Library: ${transparencyUrl(result)}`,
    ];
    if (ad.domain) block.push(`Ad domain: ${ad.domain}`);
    const shown_span = [
      ad.format && `format ${ad.format}`,
      ad.first_shown && `first shown ${ad.first_shown}`,
      ad.last_shown && `last shown ${ad.last_shown}`,
      ad.days_shown != null && `${ad.days_shown} days`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (shown_span) block.push(shown_span);
    if (copy?.headline) block.push(`Headline: ${clean(copy.headline)}`);
    if (copy?.description) block.push(`Copy: ${clean(copy.description, 1000)}`);
    if (copy?.display_url)
      block.push(
        `Visible URL: ${copy.display_url} (display only; Google publishes no click-through destination)`,
      );
    if (copy?.extras?.length)
      block.push(`Sitelinks: ${copy.extras.map((x) => clean(x, 100)).join(" | ")}`);
    if (copy?.truncated) block.push("Decoded copy was capped (truncated).");
    const variants = ad.variants ?? [];
    if (variants.length) {
      const images = variants.filter((v) => v.image_url);
      const previews = variants.filter((v) => v.preview_url);
      block.push(
        `Media: ${variants.length} variant(s), ${images.length} image(s), ${previews.length} preview(s)`,
      );
      for (const entry of images.slice(0, 2))
        if (link(entry.image_url)) block.push(`Image: ${entry.image_url}`);
      for (const entry of previews.slice(0, 1))
        if (link(entry.preview_url)) block.push(`Preview: ${entry.preview_url}`);
    }
    if (!copy && !variants.length)
      block.push(
        "No creative reference or decoded copy was returned for this ad.",
      );
    if (ad.creative_truncated)
      block.push("API creative metadata was capped (creative_truncated=true).");
    const addition = "\n\n" + block.join("\n");
    if (text.length + addition.length > 12000) break;
    text += addition;
    shown++;
  }
  if (shown < result.ads.length)
    text += `\n\nText view shortened: ${shown}/${result.ads.length} ad records shown. All returned ads remain in structured output.`;
  return { text, details: result };
}
