import assert from "node:assert/strict";
import test from "node:test";
import { liveEnabled } from "../src/config.js";
import {
  getSocialPost,
  getSocialProfile,
  getSocialProfilePosts,
} from "../src/social.js";

const username = process.env.DISCOVERY_SOCIAL_LIVE_USERNAME ?? "lovelaurieb";

test(
  "live social profile, sample and exact post through the Pi client",
  { skip: !liveEnabled() },
  async () => {
    const profile = await getSocialProfile({ username });
    assert.equal(profile.platform, "instagram");
    assert.equal(
      profile.profile.username.toLowerCase(),
      username.toLowerCase(),
    );
    assert.equal(profile.profile.is_private, false);
    assert.equal(typeof profile.profile.is_verified, "boolean");

    const sample = await getSocialProfilePosts({ username, max_posts: 2 });
    assert.equal(sample.requested_posts, 2);
    assert.equal(sample.returned_posts, sample.posts.length);
    assert.equal(typeof sample.partial, "boolean");
    assert.ok(sample.posts.length > 0, "expected at least one hydrated post");
    for (const post of sample.posts) {
      assert.ok(post.author.username.length > 0);
      assert.ok(post.published_at.endsWith("Z"));
      assert.equal(typeof post.shortcode, "string");
      assert.equal(post.shortcode, post.shortcode!.trim());
    }

    const post = await getSocialPost({ shortcode: sample.posts[0].shortcode! });
    assert.equal(post.post.shortcode, sample.posts[0].shortcode);
    assert.equal(
      post.post.url,
      `https://www.instagram.com/p/${post.post.shortcode}/`,
    );
  },
);

const tiktokUsername =
  process.env.DISCOVERY_SOCIAL_LIVE_TIKTOK_USERNAME ?? "dearmebeauty";
const tiktokVideoId =
  process.env.DISCOVERY_SOCIAL_LIVE_TIKTOK_VIDEO_ID ?? "7698226801872571655";

test(
  "live TikTok profile and exact post through the Pi client",
  { skip: !liveEnabled() },
  async () => {
    const profile = await getSocialProfile({
      platform: "tiktok",
      username: tiktokUsername,
    });
    assert.equal(profile.platform, "tiktok");
    assert.equal(
      profile.profile.username.toLowerCase(),
      tiktokUsername.toLowerCase(),
    );
    assert.equal(typeof profile.profile.is_private, "boolean");
    assert.equal(
      profile.profile.total_like_count === undefined ||
        profile.profile.total_like_count === null ||
        typeof profile.profile.total_like_count === "number",
      true,
    );

    const post = await getSocialPost({
      platform: "tiktok",
      video_id: tiktokVideoId,
      username: tiktokUsername,
    });
    assert.equal(post.platform, "tiktok");
    assert.equal(post.post.id, tiktokVideoId);
    assert.equal(post.post.shortcode, null);
    assert.equal(
      post.post.url,
      `https://www.tiktok.com/@${tiktokUsername}/video/${tiktokVideoId}`,
    );

    const sample = await getSocialProfilePosts({
      platform: "tiktok",
      username: tiktokUsername,
      max_posts: 2,
    });
    assert.equal(sample.platform, "tiktok");
    assert.equal(sample.requested_posts, 2);
    assert.equal(sample.returned_posts, sample.posts.length);
    assert.equal(typeof sample.partial, "boolean");
    for (const item of sample.posts) {
      assert.equal(item.shortcode, null);
      assert.equal(item.author.username, tiktokUsername);
    }
    if (!sample.posts.length) {
      assert.equal(sample.partial, true);
      assert.ok(
        [
          "social_verification_required",
          "social_rate_limited",
          "social_blocked",
          "social_timeout",
        ].includes(sample.sample_failure?.error_code ?? ""),
        `typed sample failure, got ${sample.sample_failure?.error_code}`,
      );
    }
  },
);
