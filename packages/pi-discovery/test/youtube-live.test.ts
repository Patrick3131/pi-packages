import assert from "node:assert/strict";
import test from "node:test";
import { liveEnabled } from "../src/config.js";
import {
  getYoutubeChannel,
  getYoutubeTranscript,
  getYoutubeVideo,
  searchYoutube,
  YoutubeClientError,
} from "../src/youtube.js";

test(
  "live YouTube search, channel pages and transcript windows through the Pi client",
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
      assert.equal(
        video.url,
        `https://www.youtube.com/watch?v=${video.video_id}`,
      );
      assert.ok(video.title.length > 0);
      assert.equal(typeof video.live, "boolean");
      assert.equal(
        typeof (video.captions_advertised ?? video.has_captions),
        "boolean",
      );
    }

    const channel = await getYoutubeChannel({
      handle: "@TheConsumerBehaviorLab",
    });
    assert.equal(channel.channel.channel_id, "UCaobKrMmIx40ZE_MGxbqDPA");
    assert.ok(channel.channel.title);
    assert.ok(channel.videos.length > 0);
    assert.ok(channel.videos.length <= 30);
    for (const video of channel.videos) {
      assert.equal(video.video_id.length, 11);
      assert.equal(
        video.url,
        `https://www.youtube.com/watch?v=${video.video_id}`,
      );
    }
    assert.ok(
      channel.videos.some((video) => typeof video.published_at === "string"),
      "the first channel page must carry exact feed dates",
    );
    const dated = channel.videos.find(
      (video) => typeof video.published_at === "string",
    );
    if (channel.next_cursor !== null) {
      const next = await getYoutubeChannel({
        channel_id: channel.channel.channel_id,
        cursor: channel.next_cursor,
      });
      assert.equal(next.channel.channel_id, channel.channel.channel_id);
      assert.ok(next.videos.length > 0);
      assert.equal(next.channel.title, null);
    }

    if (dated) {
      // The metadata route is key-gated; a keyless deployment is a valid
      // configuration and must fail with its typed 503, not a generic error.
      try {
        const metadata = await getYoutubeVideo({ video_id: dated.video_id });
        assert.equal(metadata.video_id, dated.video_id);
        assert.equal(metadata.published_at, dated.published_at);
        assert.equal(metadata.source, "youtube_data_api");
        assert.ok(metadata.description.length <= 5000);
        assert.equal(typeof metadata.live, "boolean");
        assert.equal(metadata.live, metadata.live_status === "live");
      } catch (error) {
        assert.ok(error instanceof YoutubeClientError);
        assert.equal(error.code, "metadata_unavailable");
        assert.equal(error.status, 503);
      }
    }

    const segments = await getYoutubeTranscript({
      video_id: "dQw4w9WgXcQ",
      max_chars: 1000,
    });
    assert.equal(segments.video_id, "dQw4w9WgXcQ");
    assert.equal(segments.language_kind, "manual");
    assert.ok(segments.segments.length > 0);
    assert.ok(segments.available_languages.length > 0);
    assert.equal(segments.text, null);
    assert.equal(typeof segments.returned_chars, "number");
    assert.equal(typeof segments.total_chars, "number");
    if (
      segments.next_start_ms !== null &&
      segments.next_start_ms !== undefined
    ) {
      const following = await getYoutubeTranscript({
        video_id: "dQw4w9WgXcQ",
        max_chars: 1000,
        start_ms: segments.next_start_ms,
      });
      assert.equal(following.window_start_ms, segments.next_start_ms);
      assert.ok(
        (following.returned_chars ?? 0) <= (following.total_chars ?? 0),
      );
    }

    const text = await getYoutubeTranscript({
      url: "https://youtu.be/dQw4w9WgXcQ",
      format: "text",
      max_chars: 1000,
      start_ms: 30000,
    });
    assert.equal(text.video_id, "dQw4w9WgXcQ");
    assert.equal(typeof text.text, "string");
    assert.equal(text.segments.length, 0);
    assert.equal(text.window_start_ms, 30000);
    assert.equal(typeof text.returned_chars, "number");
    assert.equal(typeof text.total_chars, "number");
  },
);
