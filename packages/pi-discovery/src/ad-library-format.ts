import type { AdLibraryAd, AdLibraryResult } from "./ad-library.js";

const clean = (value: unknown, cap = 1000) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  if (/\{\{[^{}]+\}\}/.test(text)) return "[unavailable: dynamic template]";
  return text.length > cap ? text.slice(0, cap) + "… [text shortened]" : text;
};
const link = (value: unknown) => (typeof value === "string" ? value : "");
function domains(ad: AdLibraryAd): string[] {
  const values = [
    ad.landing_url,
    ...(ad.cards ?? []).map((c) => c.landing_url),
  ];
  return [
    ...new Set(
      values.flatMap((value) => {
        try {
          return [new URL(String(value)).hostname.replace(/^www\./, "")];
        } catch {
          return [];
        }
      }),
    ),
  ];
}
const image = (value: {
  original_image_url?: string | null;
  resized_image_url?: string | null;
  watermarked_resized_image_url?: string | null;
}) =>
  link(
    value.original_image_url ||
      value.resized_image_url ||
      value.watermarked_resized_image_url,
  );
const video = (value: {
  video_hd_url?: string | null;
  video_sd_url?: string | null;
  watermarked_video_hd_url?: string | null;
  watermarked_video_sd_url?: string | null;
}) =>
  link(
    value.video_hd_url ||
      value.video_sd_url ||
      value.watermarked_video_hd_url ||
      value.watermarked_video_sd_url,
  );

/** Model-visible evidence is bounded; programmatic structured output keeps all data. */
export function formatAdLibrary(result: AdLibraryResult) {
  const groups = new Map<
    string,
    { name: string; pageId: string | null; domains: Set<string>; ads: number }
  >();
  for (const ad of result.ads) {
    const key = ad.page_id ?? ad.page_name ?? "unknown";
    const group = groups.get(key) ?? {
      name: ad.page_name ?? "Unknown",
      pageId: ad.page_id,
      domains: new Set<string>(),
      ads: 0,
    };
    for (const domain of domains(ad)) group.domains.add(domain);
    group.ads++;
    groups.set(key, group);
  }
  const summary =
    `Meta ads · ${result.ads.length} ads returned · ${groups.size} advertisers · ${result.mode}: ${result.query}` +
    ` · ${result.country} · ${result.active_only ? "active only (paused ads excluded)" : "active and inactive"}` +
    (result.truncated
      ? ` · truncated (${result.truncation.join(", ")}${result.cap_reason ? `, ${result.cap_reason === "ad_limit" ? "stopped at requested max_ads" : "stopped at server page budget"}` : ""})`
      : "") +
    (result.partial ? " · partial" : "") +
    (result.ads.some((ad) => ad.creative_truncated)
      ? " · creative metadata capped"
      : "");
  const lines = [
    summary,
    "Counts are returned samples, not total active-ad inventory.",
  ];
  if (result.dropped)
    lines.push(
      `Dropped: ${result.dropped} ads from a split page (page cannot be rewound); resume continues after it.`,
    );
  if (!result.complete && result.next_cursor)
    lines.push(`Next: pass cursor="${result.next_cursor}" to continue; stop when complete is true.`);
  else if (!result.complete && !result.next_cursor)
    lines.push("Next: pass cursor=null to restart from the beginning; this result is not complete.");
  if (result.resolved_page)
    lines.push(
      `Resolved: ${result.resolved_page.page_name ?? ""} (${result.resolved_page.page_id}), ${result.resolved_page.votes}/${result.resolved_page.total} sampled votes${result.resolved_page.evidence ? ` via ${result.resolved_page.evidence}` : ""}`,
    );
  if (!result.ads.length)
    lines.push(
      "No ads found for the requested country/status filters in these results.",
    );
  let text = lines.join("\n");
  let advertisersShown = 0;
  const rollup = result.advertisers?.length
    ? result.advertisers
    : [...groups.values()].map((group) => ({
        page_id: group.pageId ?? "unknown",
        page_name: group.name,
        ads: group.ads,
        active: 0,
        landing_domains: [...group.domains],
      }));
  for (const group of rollup) {
    const line = `\n${clean(group.page_name, 200)} | page_id=${group.page_id ?? "unknown"} | domains=${(group.landing_domains ?? []).join(", ") || "not supplied"} | ads=${group.ads}${result.active_only ? "" : ` | active=${group.active}`}`;
    if (text.length + line.length > 12000) break;
    text += line;
    advertisersShown++;
  }
  if (advertisersShown < rollup.length)
    text +=
      "\nAdvertiser text list shortened; all returned records remain in structured output.";
  let shown = 0;
  for (const ad of result.ads) {
    const block = [
      `Ad ${ad.archive_id} | ${ad.page_name ?? "Unknown"} | page_id=${ad.page_id ?? "unknown"}`,
      `Ad Library: https://www.facebook.com/ads/library/?id=${ad.archive_id}`,
    ];
    if (ad.landing_url) block.push(`Landing: ${ad.landing_url}`);
    if (ad.headline) block.push(`Headline: ${clean(ad.headline)}`);
    if (ad.body) block.push(`Copy: ${clean(ad.body)}`);
    if (ad.cta) block.push(`CTA: ${clean(ad.cta, 300)}`);
    if (ad.template_fields?.length) {
      const index = ad.representative_card_index;
      block.push(
        index != null
          ? `Dynamic copy: ${ad.template_fields.join(", ")} use representative creative card ${index + 1} where available; unresolved values are null. Other cards may differ.`
          : `Dynamic copy unavailable: ${ad.template_fields.join(", ")}.`,
      );
      const selected = index != null ? ad.cards?.[index] : undefined;
      if (selected?.landing_url)
        block.push(`Representative card landing: ${selected.landing_url}`);
    }
    const images = ad.images ?? [],
      videos = ad.videos ?? [],
      cards = ad.cards ?? [];
    if (images.length || videos.length || cards.length)
      block.push(
        `Media: ${images.length} images, ${videos.length} videos, ${cards.length} creative cards`,
      );
    for (const entry of images.slice(0, 2))
      if (image(entry)) block.push(`Image: ${image(entry)}`);
    for (const entry of videos.slice(0, 2)) {
      if (video(entry)) block.push(`Video: ${video(entry)}`);
      if (entry.video_preview_image_url)
        block.push(`Video preview: ${entry.video_preview_image_url}`);
    }
    for (const [index, card] of cards.slice(0, 3).entries()) {
      block.push(`Creative card ${index + 1}: ${clean(card.headline, 300)}`);
      if (card.landing_url) block.push(`  Landing: ${card.landing_url}`);
      if (card.body) block.push(`  Copy: ${clean(card.body, 400)}`);
      if (card.cta) block.push(`  CTA: ${clean(card.cta, 200)}`);
      if (image(card)) block.push(`  Image: ${image(card)}`);
      if (video(card)) block.push(`  Video: ${video(card)}`);
    }
    if (images.length > 2 || videos.length > 2 || cards.length > 3)
      block.push(
        "Text creative previews shortened; structured output keeps all API-returned metadata.",
      );
    if (ad.creative_truncated)
      block.push("API creative metadata was capped (creative_truncated=true).");
    const addition = "\n\n" + block.join("\n");
    if (text.length + addition.length > 32000) break;
    text += addition;
    shown++;
  }
  if (shown < result.ads.length)
    text += `\n\nText view shortened: ${shown}/${result.ads.length} ad records shown. All returned ads and media are available in structured output.`;
  return { text, summary, details: { ...result, requestId: result.id } };
}
