import assert from "node:assert/strict";
import test from "node:test";
import { liveEnabled } from "../src/config.js";
import { getYoutubeTranscript, searchYoutube } from "../src/youtube.js";

test(
  "live YouTube search and both transcript renderings through the Pi client",
  { skip: !liveEnabled() },
  async () => {
    const search = await searchYoutube({
      query: "bundestag rede",
      max_results: 2,
    });
    assert.ok(search.results.length > 0);
    assert.ok(search.results.length <= 2);
    assert.equal(search.query, "bundestag rede");
    for (const video of search.results) {
      assert.equal(typeof video.video_id, "string");
      assert.equal(video.video_id.length, 11);
      assert.equal(video.url, `https://www.youtube.com/watch?v=${video.video_id}`);
      assert.ok(video.title.length > 0);
      assert.equal(typeof video.live, "boolean");
      assert.equal(typeof video.has_captions, "boolean");
    }

    const segments = await getYoutubeTranscript({
      video_id: "dQw4w9WgXcQ",
      max_chars: 5000,
    });
    assert.equal(segments.video_id, "dQw4w9WgXcQ");
    assert.equal(segments.language_kind, "manual");
    assert.ok(segments.segments.length > 0);
    assert.ok(segments.available_languages.length > 0);
    assert.equal(segments.text, null);

    const text = await getYoutubeTranscript({
      url: "https://youtu.be/dQw4w9WgXcQ",
      format: "text",
      max_chars: 1000,
    });
    assert.equal(text.video_id, "dQw4w9WgXcQ");
    assert.ok(text.text && text.text.length > 0);
    assert.equal(text.segments.length, 0);
    assert.equal(typeof text.truncated, "boolean");
    assert.equal(typeof text.cached, "boolean");
  },
);
