import type {
  SocialPost,
  SocialPostResponse,
  SocialProfile,
  SocialProfilePostsResponse,
  SocialProfileResponse,
} from "../src/social-types.js";

/** Fixtures mirror the documented wire contract, including fields Pi never derives itself. */
export const profile: SocialProfile = {
  id: "1234567890",
  username: "lovelaurieb",
  url: "https://www.instagram.com/lovelaurieb/",
  full_name: "Laurie B",
  biography: "Line one\nLine two",
  avatar_url: "https://scontent.example/avatar.jpg?signature=abc",
  follower_count: 12345,
  following_count: 0,
  post_count: null,
  is_private: false,
  is_verified: true,
  bio_links: [
    {
      url: "https://shop.example/product?id=1&sig=abc",
      title: "Shop",
      type: "External",
    },
  ],
};

export const post: SocialPost = {
  id: "987654321",
  shortcode: "DfSl0YxhJiA",
  url: "https://www.instagram.com/p/DfSl0YxhJiA/",
  author: { id: "555", username: "actual_author" },
  coauthors: ["collab_one"],
  caption: "A caption",
  accessibility_caption: null,
  published_at: "2026-11-01T10:00:00Z",
  content_type: "carousel",
  product_type: "clips",
  thumbnail: {
    url: "https://cdn.example/thumb.jpg?token=x",
    width: 1080,
    height: 1350,
  },
  video: { url: "https://cdn.example/video.mp4?token=y", width: null, height: null },
  carousel: [
    {
      id: "carousel-child-1",
      content_type: "image",
      thumbnail: { url: "https://cdn.example/c1.jpg", width: 1080, height: 1350 },
      video: null,
    },
  ],
  like_count: 0,
  comment_count: 4,
  view_count: null,
  play_count: null,
  like_counts_hidden: true,
  is_paid_partnership: false,
};

export const profileResponse: SocialProfileResponse = {
  id: "a1b2",
  platform: "instagram",
  observed_at: "2026-11-05T11:00:00Z",
  profile,
  timings: { queue_ms: 0, upstream_ms: 500, total_ms: 501 },
  api_version: "2026-11-05",
};

export const postResponse: SocialPostResponse = {
  id: "p9q8",
  platform: "instagram",
  observed_at: "2026-11-05T11:00:00Z",
  post,
  timings: { queue_ms: 1, upstream_ms: 900, total_ms: 902 },
};

export const sampleResponse: SocialProfilePostsResponse = {
  id: "c3d4",
  platform: "instagram",
  observed_at: "2026-11-05T11:00:00Z",
  profile,
  posts: [post],
  requested_posts: 12,
  returned_posts: 1,
  has_more_posts: null,
  partial: true,
  failed_posts: [
    { shortcode: "Deleted01", error_code: "social_post_not_found", reason: null },
  ],
  sample_failure: {
    stage: "listing",
    error_code: "social_rate_limited",
    reason: null,
    retry_after_s: 0,
  },
  truncation: ["page_failure"],
  warnings: ["pinned_posts_may_lead", "media_urls_expire"],
  timings: { queue_ms: 2, upstream_ms: 6100, total_ms: 6105 },
};

export function completedSample(count: number): SocialProfilePostsResponse {
  return {
    ...sampleResponse,
    posts: Array.from({ length: count }, (_, index) => ({
      ...post,
      id: String(9000 + index),
      shortcode: `Code${String(index).padStart(5, "0")}`,
      caption: `Post ${index + 1} ` + "x".repeat(1200),
    })),
    requested_posts: count,
    returned_posts: count,
    has_more_posts: true,
    partial: false,
    failed_posts: [],
    sample_failure: null,
    truncation: [],
    warnings: ["pinned_posts_may_lead"],
  };
}

export interface RecordedCall {
  url: string;
  body: Record<string, unknown>;
}

/** Deterministic fetch stub that records the exact route and body Pi sent. */
export function recordingFetch(
  payload: unknown,
  options: {
    status?: number;
    headers?: Record<string, string>;
    text?: string;
  } = {},
): { calls: RecordedCall[]; fetch: typeof fetch } {
  const calls: RecordedCall[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(
      options.text ?? JSON.stringify(payload),
      { status: options.status ?? 200, headers: options.headers },
    );
  };
  return { calls, fetch: fetchImpl as unknown as typeof fetch };
}
