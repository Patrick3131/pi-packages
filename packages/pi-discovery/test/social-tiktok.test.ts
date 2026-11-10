import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatSocialPost,
  formatSocialProfile,
  formatSocialProfilePosts,
} from "../src/social-format.js";
import {
  getSocialPost,
  getSocialProfile,
  getSocialProfilePosts,
  SocialClientError,
} from "../src/social.js";
import {
  socialPostRequest,
  socialProfilePostsRequest,
  socialProfileRequest,
} from "../src/social-validation.js";
import {
  executeSocialPost,
  executeSocialProfile,
} from "../src/social-tools.js";
import { recordingFetch } from "./social-fixtures.js";

const invalidRequest = (error: unknown) =>
  error instanceof SocialClientError && error.code === "invalid_request";

const tiktokProfile = {
  id: "6781332503249748993",
  username: "dearmebeauty",
  url: "https://www.tiktok.com/@dearmebeauty",
  full_name: "Dear Me Beauty",
  biography: "Beauty brand",
  avatar_url: "https://cdn.example/avatar.jpg",
  follower_count: 1639374,
  following_count: 1,
  post_count: 153,
  is_private: false,
  is_verified: true,
  bio_links: [],
  total_like_count: 36250660,
};

const tiktokPost = {
  id: "7698226801872571655",
  shortcode: null,
  url: "https://www.tiktok.com/@dearmebeauty/video/7698226801872571655",
  author: { id: "6781332503249748993", username: "dearmebeauty" },
  coauthors: [],
  caption: "caption",
  accessibility_caption: null,
  published_at: "2026-10-23T02:00:00Z",
  content_type: "video",
  product_type: null,
  thumbnail: { url: "https://cdn.example/cover.jpg", width: 576, height: 1024 },
  video: { url: "https://cdn.example/play.mp4", width: 576, height: 1024 },
  carousel: [],
  like_count: 30,
  comment_count: 0,
  view_count: null,
  play_count: 12200,
  share_count: 1,
  collect_count: 0,
  like_counts_hidden: null,
  is_paid_partnership: null,
  is_ad: true,
  is_aigc: null,
  music: {
    id: "7553613785781537537",
    title: "sound",
    author_name: "artist",
    original: true,
  },
  hashtags: ["beauty"],
};

const profileResponse = {
  id: "req",
  platform: "tiktok",
  observed_at: "2026-11-10T12:00:00Z",
  profile: tiktokProfile,
  warnings: ["metrics_unparsed"],
  timings: { queue_ms: 0, upstream_ms: 10, total_ms: 11 },
};

const postResponse = {
  id: "req",
  platform: "tiktok",
  observed_at: "2026-11-10T12:00:00Z",
  post: tiktokPost,
  warnings: [],
  timings: { queue_ms: 0, upstream_ms: 10, total_ms: 11 },
};

test("TikTok request builders support handles, URLs, video ids and pagination", () => {
  assert.deepEqual(
    socialProfileRequest({ platform: "tiktok", username: "dearmebeauty" }),
    {
      endpoint: "/v1/social/profile",
      body: { platform: "tiktok", username: "dearmebeauty", timeout_ms: 30000 },
      serverTimeoutMs: 30000,
    },
  );
  assert.equal(
    socialProfileRequest({
      platform: "tiktok",
      url: "https://www.tiktok.com/@dearmebeauty",
    }).body.url,
    "https://www.tiktok.com/@dearmebeauty",
  );
  assert.deepEqual(
    socialPostRequest({
      platform: "tiktok",
      video_id: "7698226801872571655",
      username: "dearmebeauty",
    }).body,
    {
      platform: "tiktok",
      video_id: "7698226801872571655",
      username: "dearmebeauty",
      timeout_ms: 30000,
    },
  );
  assert.equal(
    socialPostRequest({
      platform: "tiktok",
      url: "https://www.tiktok.com/@dearmebeauty/video/7698226801872571655",
    }).body.url,
    "https://www.tiktok.com/@dearmebeauty/video/7698226801872571655",
  );
  assert.equal(
    socialProfilePostsRequest({
      platform: "tiktok",
      username: "dearmebeauty",
      max_posts: 24,
    }).body.max_posts,
    24,
  );

  for (const params of [
    { platform: "tiktok" },
    { platform: "tiktok", username: "a".repeat(25) },
    { platform: "tiktok", username: "foryou" },
    { platform: "tiktok", url: "https://www.tiktok.com/@dearmebeauty?lang=en" },
    { platform: "tiktok", url: "https://www.tiktok.com/@dearmebeauty/video/1" },
    { platform: "tiktok", video_id: "7698226801872571655" },
    { platform: "tiktok", video_id: "abc", username: "dearmebeauty" },
    { platform: "tiktok", shortcode: "DfSl0YxhJiA" },
    {
      platform: "tiktok",
      video_id: "7698226801872571655",
      username: "dearmebeauty",
      shortcode: "DfSl0YxhJiA",
    },
    {
      platform: "tiktok",
      url: "https://www.tiktok.com/@dearmebeauty/video/7698226801872571655",
      username: "dearmebeauty",
    },
  ])
    assert.throws(
      () => {
        if ("video_id" in params || "shortcode" in params)
          socialPostRequest(params as never);
        else socialProfileRequest(params as never);
      },
      invalidRequest,
      JSON.stringify(params),
    );
});

test("TikTok responses parse and format with nullable shortcode and new fields", async () => {
  const profile = await getSocialProfile(
    { platform: "tiktok", username: "dearmebeauty" },
    { env: {}, fetch: recordingFetch(profileResponse).fetch },
  );
  assert.equal(profile.platform, "tiktok");
  assert.equal(profile.profile.total_like_count, 36250660);
  const profileText = formatSocialProfile(profile).text;
  assert.match(profileText, /TikTok profile @dearmebeauty/);
  assert.match(profileText, /Total likes: 36250660/);

  const post = await getSocialPost(
    {
      platform: "tiktok",
      video_id: "7698226801872571655",
      username: "dearmebeauty",
    },
    { env: {}, fetch: recordingFetch(postResponse).fetch },
  );
  assert.equal(post.post.shortcode, null);
  assert.equal(post.post.share_count, 1);
  assert.equal(post.post.music?.author_name, "artist");
  const postText = formatSocialPost(post).text;
  assert.match(postText, /TikTok post 7698226801872571655/);
  assert.match(postText, /Shares: 1/);
  assert.match(postText, /Hashtags: beauty/);

  const sample = await getSocialProfilePosts(
    { platform: "tiktok", username: "dearmebeauty", max_posts: 1 },
    {
      env: {},
      fetch: recordingFetch({
        ...profileResponse,
        posts: [tiktokPost],
        requested_posts: 1,
        returned_posts: 1,
        has_more_posts: true,
        partial: false,
        failed_posts: [],
        sample_failure: null,
        truncation: [],
        warnings: [],
      }).fetch,
    },
  );
  assert.match(
    formatSocialProfilePosts(sample).text,
    /TikTok profile-posts sample/,
  );
});

test("native social tools execute TikTok profile and exact post selectors", async (t) => {
  const bodies: Array<Record<string, unknown>> = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      const payload = String(url).endsWith("/v1/social/profile")
        ? profileResponse
        : postResponse;
      return new Response(JSON.stringify(payload));
    },
  );

  const profile = await executeSocialProfile({
    platform: "tiktok",
    username: "dearmebeauty",
  });
  assert.equal(profile.isError, false);
  assert.equal(
    (profile.details as { response: typeof profileResponse }).response.platform,
    "tiktok",
  );
  assert.match(
    profile.content.filter((part) => part.type === "text").map((part) => part.text).join(""),
    /TikTok profile @dearmebeauty/,
  );

  const post = await executeSocialPost({
    platform: "tiktok",
    video_id: "7698226801872571655",
    username: "dearmebeauty",
  });
  assert.equal(post.isError, false);
  const response = (post.details as { response: typeof postResponse }).response;
  assert.equal(response.post.shortcode, null);
  assert.equal(response.post.id, "7698226801872571655");
  assert.match(
    post.content.filter((part) => part.type === "text").map((part) => part.text).join(""),
    /TikTok post 7698226801872571655/,
  );

  assert.deepEqual(bodies, [
    { platform: "tiktok", username: "dearmebeauty", timeout_ms: 30000 },
    {
      platform: "tiktok",
      video_id: "7698226801872571655",
      username: "dearmebeauty",
      timeout_ms: 30000,
    },
  ]);
});
