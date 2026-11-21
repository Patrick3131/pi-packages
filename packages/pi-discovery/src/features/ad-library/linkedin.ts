import { Check } from "typebox/value";
import {
  AdLibraryClientError,
  postAdLibrary,
  type AdLibraryOptions,
} from "./transport.js";
import {
  linkedinParameters,
  linkedinResponse,
  type LinkedInAdsParams,
  type LinkedInAdsResult,
} from "./linkedin-schema.js";

export async function searchLinkedInAds(
  params: LinkedInAdsParams,
  options: AdLibraryOptions = {},
): Promise<LinkedInAdsResult> {
  if (options.signal?.aborted)
    throw new DOMException("Ad library cancelled.", "AbortError");
  if (!Check(linkedinParameters, params))
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

export function formatLinkedInAds(
  result: LinkedInAdsResult,
  showCursor = true,
) {
  const lines = [
    `LinkedIn Ad Library · ${result.ads.length} ads · ${result.country}`,
  ];
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
  for (const ad of result.ads.slice(0, 5)) {
    lines.push(
      [
        ad.advertiser.name,
        ad.headline,
        ad.commentary,
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
