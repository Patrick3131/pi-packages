import type {
  SocialPost,
  SocialPostResponse,
  SocialProfile,
  SocialProfilePostsResponse,
  SocialProfileResponse,
  SocialResultEnvelope,
} from "./social-types.js";

/** Model-visible text stays bounded; structured output keeps every record. */
const TEXT_CAP = 12000;
const LABEL_RESERVE = 220;
const platformName = (platform: string) =>
  platform === "tiktok" ? "TikTok" : "Instagram";
const PREVIEW_POSTS = 5;
const PREVIEW_CAPTION = 300;

const clip = (value: string, cap: number) =>
  value.length > cap ? `${value.slice(0, cap)}… [text shortened]` : value;
const count = (value: number | null) =>
  value === null ? "unknown" : String(value);
const dimension = (ref: {
  width: number | null;
  height: number | null;
}): string =>
  ref.width !== null && ref.height !== null && ref.width > 0 && ref.height > 0
    ? ` (${ref.width}x${ref.height})`
    : "";

function continuationLabel(value: boolean | null): string {
  if (value === null) return "unknown";
  return value ? "more candidates available" : "no further candidates";
}

function profileLines(profile: SocialProfile): string[] {
  const lines = [
    `Profile @${profile.username} · ${count(profile.follower_count)} followers · ${count(profile.following_count)} following · ${count(profile.post_count)} posts`,
    `URL: ${profile.url}`,
    `Profile id=${profile.id} · ${profile.is_private ? "private" : "public"} · ${profile.is_verified ? "verified" : "not verified"}`,
  ];
  if (
    profile.total_like_count !== undefined &&
    profile.total_like_count !== null
  )
    lines.push(`Total likes: ${count(profile.total_like_count)}`);
  if (profile.full_name) lines.push(`Name: ${clip(profile.full_name, 100)}`);
  if (profile.biography) lines.push(`Bio: ${clip(profile.biography, 1000)}`);
  if (profile.avatar_url) lines.push(`Avatar: ${profile.avatar_url}`);
  for (const link of profile.bio_links.slice(0, 3))
    lines.push(
      `Link: ${link.type ?? "link"} ${link.url}${link.title ? ` (${clip(link.title, 200)})` : ""}`,
    );
  if (profile.bio_links.length > 3)
    lines.push(
      `Bio links shortened: showing 3/${profile.bio_links.length}; structured output keeps every returned link.`,
    );
  return lines;
}

function postLines(post: SocialPost, label: string): string[] {
  const lines = [
    `${label}: ${post.content_type} · ${post.published_at} · by @${post.author.username} (author id=${post.author.id})`,
    `  URL: ${post.url}`,
    `  Likes: ${post.like_counts_hidden ? "hidden" : count(post.like_count)} · Comments: ${count(post.comment_count)} · Views: ${count(post.view_count)} · Plays: ${count(post.play_count)}` +
      (post.share_count !== undefined
        ? ` · Shares: ${count(post.share_count)}`
        : "") +
      (post.collect_count !== undefined
        ? ` · Collects: ${count(post.collect_count)}`
        : ""),
  ];
  if (post.caption)
    lines.push(`  Caption: ${clip(post.caption, PREVIEW_CAPTION)}`);
  if (post.accessibility_caption)
    lines.push(
      `  Accessibility caption: ${clip(post.accessibility_caption, PREVIEW_CAPTION)}`,
    );
  if (post.thumbnail)
    lines.push(
      `  Thumbnail: ${post.thumbnail.url}${dimension(post.thumbnail)}`,
    );
  if (post.video)
    lines.push(`  Video: ${post.video.url}${dimension(post.video)}`);
  if (post.carousel.length) {
    lines.push(
      `  Carousel: ${post.carousel.length} item${post.carousel.length === 1 ? "" : "s"}`,
    );
    const first = post.carousel[0].thumbnail ?? post.carousel[0].video;
    if (first) lines.push(`    First item: ${first.url}${dimension(first)}`);
  }
  if (post.coauthors.length)
    lines.push(`  Coauthors: ${post.coauthors.join(", ")}`);
  if (post.product_type)
    lines.push(`  Product type: ${clip(post.product_type, 100)}`);
  if (post.is_paid_partnership !== null)
    lines.push(
      `  Paid partnership: ${post.is_paid_partnership ? "yes" : "no"}`,
    );
  if (post.is_ad !== undefined && post.is_ad !== null)
    lines.push(`  Ad: ${post.is_ad ? "yes" : "no"}`);
  if (post.is_aigc !== undefined && post.is_aigc !== null)
    lines.push(`  AI-generated: ${post.is_aigc ? "yes" : "no"}`);
  if (post.music)
    lines.push(
      `  Music: ${post.music.title ?? "unknown"} by ${post.music.author_name ?? "unknown"}`,
    );
  if (post.hashtags?.length)
    lines.push(`  Hashtags: ${post.hashtags.join(", ")}`);
  return lines;
}

function timingsLine(result: {
  id: string;
  observed_at: string;
  timings: { queue_ms: number; upstream_ms: number; total_ms: number };
}): string {
  const { queue_ms, upstream_ms, total_ms } = result.timings;
  return `Request ${result.id} · observed ${result.observed_at} · queue ${queue_ms} ms · upstream ${upstream_ms} ms · total ${total_ms} ms`;
}

/**
 * Append whole sections in priority order. A section that would exceed the cap
 * is skipped so later small sections (timings, labels) still fit.
 */
function assemble(
  summary: string,
  groups: string[][],
): { text: string; skipped: number } {
  let text = summary;
  let skipped = 0;
  for (const group of groups) {
    const block = group.filter(Boolean).join("\n");
    if (!block) continue;
    if (text.length + block.length + 1 > TEXT_CAP - LABEL_RESERVE) {
      skipped++;
      continue;
    }
    text += "\n" + block;
  }
  return { text, skipped };
}

const BOUNDED_LABEL =
  "Text view shortened: some sections omitted; structured output keeps the complete API response.";

function fitLabels(text: string, labels: string[]): string {
  let result = text;
  for (const label of labels)
    if (label && result.length + label.length + 1 <= TEXT_CAP)
      result += "\n" + label;
  return result;
}

export function formatSocialProfile(result: SocialProfileResponse): {
  text: string;
  summary: string;
  details: SocialResultEnvelope<SocialProfileResponse>;
} {
  const profile = result.profile;
  const summary =
    `${platformName(result.platform)} profile @${profile.username} · ${count(profile.follower_count)} followers · ${count(profile.post_count)} posts · ${profile.is_private ? "private" : "public"}` +
    (profile.is_verified ? " · verified" : "");
  const { text, skipped } = assemble(summary, [
    profileLines(profile),
    ["One profile query; no posts were listed or hydrated."],
    [timingsLine(result)],
  ]);
  return {
    text: fitLabels(text, [skipped ? BOUNDED_LABEL : ""]),
    summary,
    details: { status: "ok", requestId: result.id, response: result },
  };
}

export function formatSocialPost(result: SocialPostResponse): {
  text: string;
  summary: string;
  details: SocialResultEnvelope<SocialPostResponse>;
} {
  const post = result.post;
  const summary = `${platformName(result.platform)} post ${post.shortcode ?? post.id} by @${post.author.username} · ${post.content_type} · ${post.published_at}`;
  const { text, skipped } = assemble(summary, [
    postLines(post, "Post"),
    ["Media URLs are references only; nothing is downloaded."],
    [timingsLine(result)],
  ]);
  return {
    text: fitLabels(text, [skipped ? BOUNDED_LABEL : ""]),
    summary,
    details: { status: "ok", requestId: result.id, response: result },
  };
}

export function formatSocialProfilePosts(result: SocialProfilePostsResponse): {
  text: string;
  summary: string;
  details: SocialResultEnvelope<SocialProfilePostsResponse>;
} {
  const profile = result.profile;
  const summary =
    `${platformName(result.platform)} profile-posts sample @${profile.username} · ${result.returned_posts}/${result.requested_posts} posts · continuation: ${continuationLabel(result.has_more_posts)}` +
    (profile.is_private ? " · private" : "") +
    (result.partial ? " · partial" : "") +
    (result.truncation.length
      ? ` · truncated (${result.truncation.join(", ")})`
      : "");

  const status: string[] = [
    "Order is upstream encounter order; pinned posts may lead. This is not a latest-chronological feed.",
  ];
  if (result.truncation.length)
    status.push(`Truncation: ${result.truncation.join(", ")}`);
  if (result.warnings.length)
    status.push(`Warnings: ${result.warnings.join(", ")}`);
  if (result.warnings.includes("pinned_posts_may_lead"))
    status.push(
      "Pinned posts may lead; do not present this as the latest N posts.",
    );
  if (result.warnings.includes("media_urls_expire"))
    status.push(
      "Media URLs are references only and may expire; nothing is downloaded.",
    );
  if (result.partial)
    status.push(
      "Partial is not a retry signal: inspect failed_posts, sample_failure and truncation before reacquiring.",
    );
  if (result.failed_posts.length)
    status.push(
      clip(
        `Failed posts: ${result.failed_posts
          .map(
            (failed) =>
              `${failed.shortcode}=${failed.error_code}${failed.reason ? `/${failed.reason}` : ""}`,
          )
          .join("; ")}`,
        800,
      ),
    );
  if (result.sample_failure) {
    const failure = result.sample_failure;
    status.push(
      `Sample failure: ${failure.stage} · ${failure.error_code}${failure.reason ? ` · reason ${failure.reason}` : ""}${failure.retry_after_s === null ? "" : ` · retry_after_s=${failure.retry_after_s}`}`,
    );
  }

  const previews = result.posts
    .slice(0, PREVIEW_POSTS)
    .map((post, index) => postLines(post, `Post ${index + 1}`));

  const { text, skipped } = assemble(summary, [
    profileLines(profile),
    status,
    ...previews,
    [timingsLine(result)],
  ]);
  return {
    text: fitLabels(text, [
      result.posts.length > PREVIEW_POSTS
        ? `Text previews shortened: showing ${PREVIEW_POSTS}/${result.posts.length} post records; all returned posts, failed_posts and timings remain in structured output.`
        : "",
      skipped ? BOUNDED_LABEL : "",
    ]),
    summary,
    details: {
      status: result.partial ? "partial" : "ok",
      requestId: result.id,
      response: result,
    },
  };
}
