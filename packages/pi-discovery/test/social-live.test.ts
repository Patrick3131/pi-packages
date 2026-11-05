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
    assert.equal(profile.profile.username.toLowerCase(), username.toLowerCase());
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
      assert.equal(post.shortcode, post.shortcode.trim());
    }

    const post = await getSocialPost({ shortcode: sample.posts[0].shortcode });
    assert.equal(post.post.shortcode, sample.posts[0].shortcode);
    assert.equal(post.post.url, `https://www.instagram.com/p/${post.post.shortcode}/`);
  },
);
