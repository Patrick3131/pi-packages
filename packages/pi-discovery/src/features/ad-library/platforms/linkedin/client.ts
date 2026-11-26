import { Check } from "typebox/value";
import {
  AdLibraryClientError,
  postAdLibrary,
  formatAttempts,
  type AdLibraryOptions,
} from "../../transport.js";
import {
  validCompanyReference,
  detailParameters,
  detailResponse,
  type LinkedInAdDetailParams,
  type LinkedInAdDetail,
  linkedinParameters,
  linkedinResponse,
  type LinkedInAdsParams,
  type LinkedInAdsResult,
} from "./schema.js";

export async function getLinkedInAdDetail(
  params: LinkedInAdDetailParams,
  options: AdLibraryOptions = {},
): Promise<LinkedInAdDetail> {
  options.signal?.throwIfAborted();
  if (!Check(detailParameters, params))
    throw new AdLibraryClientError("invalid_request");
  const result = await postAdLibrary(
    "/v1/ad-library/linkedin/detail",
    params,
    options,
  );
  if (!Check(detailResponse, result) || result.ad.ad_id !== params.ad_id)
    throw new AdLibraryClientError("malformed");
  return result;
}

export async function searchLinkedInAds(
  params: LinkedInAdsParams,
  options: AdLibraryOptions = {},
): Promise<LinkedInAdsResult> {
  if (options.signal?.aborted)
    throw new DOMException("Ad library cancelled.", "AbortError");
  if (
    !Check(linkedinParameters, params) ||
    (params.linkedin_url !== undefined &&
      !validCompanyReference(params.linkedin_url.trim()))
  )
    throw new AdLibraryClientError("invalid_request");
  const selectors = [
    params.keyword,
    params.linkedin_url,
    params.page_id,
  ].filter((value) => value !== undefined);
  if (
    selectors.length > 1 ||
    (!selectors.length && !(params.payer || params.account_owner))
  )
    throw new AdLibraryClientError("invalid_request");
  const cap = params.max_ads ?? 24;
  const body = { ...params, max_ads: cap };
  const result = await postAdLibrary(
    "/v1/ad-library/linkedin/search",
    body,
    options,
  );
  if (!Check(linkedinResponse, result))
    throw new AdLibraryClientError("malformed");
  if (
    result.ads.length > Math.max(24, cap) ||
    (cap < 24
      ? result.max_ads_adjustment?.requested !== cap
      : result.max_ads_adjustment !== null)
  )
    throw new AdLibraryClientError("malformed");
  return result;
}

function keywordExamples(ads: LinkedInAdsResult["ads"]) {
  const seen = new Set<string>();
  const examples = [];
  const remaining = [];
  for (const ad of ads) {
    const { page_url, page_id, name } = ad.advertiser;
    const key = page_url || page_id || name?.trim().toLowerCase();
    if (!key || seen.has(key)) {
      remaining.push(ad);
      continue;
    }
    seen.add(key);
    examples.push(ad);
    if (examples.length === 5) break;
  }
  return examples.concat(remaining).slice(0, 5);
}

function keywordExcerpt(copy: string, keyword: string) {
  const lower = copy.toLowerCase();
  const query = keyword.trim().toLowerCase();
  let match = lower.indexOf(query);
  if (match < 0) {
    const positions = query
      .split(/\s+/)
      .map((term) => lower.indexOf(term))
      .filter((pos) => pos >= 0);
    if (positions.length) match = Math.min(...positions);
  }
  const start = Math.max(0, match - 60);
  return (
    (start ? "…" : "") +
    copy.slice(start, start + 250) +
    (copy.length > start + 250 ? "…" : "")
  );
}

export function formatLinkedInAds(
  result: LinkedInAdsResult,
  showCursor = true,
  params?: LinkedInAdsParams,
) {
  const lines = [
    `LinkedIn Ad Library · ${result.ads.length} ads · ${result.country}`,
  ];
  if (result.resolved_page_id)
    lines.push(`Advertiser page ID: ${result.resolved_page_id}.`);
  if (params) {
    const scope = [
      params.keyword && `keyword: ${params.keyword}`,
      params.account_owner && `advertiser name: ${params.account_owner}`,
      params.payer && `payer: ${params.payer}`,
      params.start_date
        ? `${params.start_date} through ${params.end_date}`
        : params.date_option,
    ].filter(Boolean);
    if (scope.length) lines.push(scope.join(" · "));
  }
  for (const failure of result.failed_pages)
    lines.push(
      `Page ${failure.page}: ${failure.stage ?? "results"} (${failure.error_code}${failure.reason ? ", " + failure.reason : ""}).${formatAttempts(failure.attempts, failure.upstream_status_counts)} Request ${result.id}.`,
    );
  if (result.transparency) {
    const { fetched, empty, failed, requested } = result.transparency;
    lines.push(
      `Detail pages: ${fetched} with fields, ${empty ?? 0} empty, ${failed} failed (budget ${requested}).`,
    );
  }
  if (result.max_ads_adjustment)
    lines.push(
      `Requested ${result.max_ads_adjustment.requested} ads; effective limit raised to 24 (one LinkedIn page).`,
    );
  lines.push(
    `Complete: ${result.complete}. Partial: ${result.partial}. Dropped: ${result.dropped}.`,
  );
  if (result.truncated)
    lines.push(`Truncated: ${result.truncation.join(", ")}.`);
  if (showCursor && result.next_cursor)
    lines.push(`Next cursor: ${result.next_cursor}`);
  const keyword = params?.keyword;
  const examples = keyword
    ? keywordExamples(result.ads)
    : result.ads.slice(0, 5);
  if (keyword && examples.length)
    lines.push("Keyword examples (different advertisers first):");
  for (const ad of examples) {
    lines.push(
      [
        ad.advertiser.name,
        ad.headline,
        keyword && ad.commentary
          ? keywordExcerpt(ad.commentary, keyword)
          : ad.commentary,
        keyword && ad.commentary_truncated ? "[commentary shortened]" : null,
        ad.transparency?.payer,
        ad.transparency?.total_impressions,
        ad.detail_url,
      ]
        .filter(Boolean)
        .map((value) => value!.slice(0, 400))
        .join(" · ") || ad.ad_id,
    );
    const targeting = ad.transparency?.targeting;
    for (const disclosure of targeting?.disclosures?.slice(0, 3) ?? [])
      lines.push(`${disclosure.label}: ${disclosure.text}`);
    if (
      targeting?.disclosures_truncated ||
      (targeting?.disclosures?.length ?? 0) > 3
    )
      lines.push("Targeting preview shortened.");
  }
  if (result.ads.length > 5)
    lines.push(`Showing 5 of ${result.ads.length} ads in text.`);
  return { text: lines.join("\n"), details: result };
}
