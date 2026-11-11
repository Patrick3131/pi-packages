# pi-discovery

Direct SearXNG search (`web_search_searxng`), server-owned Luna research
(`web_answer`), Meta Ad Library, Instagram/TikTok public metadata, and YouTube
search/channels/transcripts. Search, answer, Ad Library and social tools default off; the
YouTube tools default on. All tools use Pi's native defaultActive policy.
Enable the default-off tools with project `.pi/tools.json`, explicit host
selection or env defaults:

```json
{ "web_search_searxng": true, "web_answer": true }
```

```bash
DISCOVERY_WEB_SEARCH_ENABLED=1 DISCOVERY_WEB_ANSWER_ENABLED=1 pi
```

Project false overrides an env default; explicit CLI, presets, child and saved
loadouts own their selection. Later /tools changes remain authoritative.

| Configuration                   | Default               |
| ------------------------------- | --------------------- |
| DISCOVERY_BASE_URL              | http://10.8.0.1:18080 |
| DISCOVERY_WEB_ANSWER_TIMEOUT_MS | 310000                |
| SEARXNG_URL                     | http://10.8.0.1:18089 |
| SEARXNG_ENGINES                 | brave,duckduckgo      |

Private/VPN network access is required. No API bearer token or local Codex login.
The discovery server owns account credentials and always selects gpt-6-luna.
There is no model fallback or client retry. The old search enablement env aliases
are removed; update callers to DISCOVERY_WEB_SEARCH_ENABLED.

## Model tool

web_answer accepts query (trimmed 1–8000 chars), instructions (max 4000),
max_sources (integer 1–20, default 5), timeout_ms (5000–300000, default 180000).
The total server budget includes queue time; the service defaults to two running
requests and 32 waiting, with each Codex turn capped at 60 seconds. The default
HTTP deadline covers even the maximum five-minute server budget.
The HTTP deadline must be at least 5000 ms longer than the server deadline.
Cancellation/deadline cover fetch and response body. Calls use redirect:error.
The configured discovery URL is an http(s) origin, without credentials/path/query.

The result is final model text plus structured search results, gaps, searches,
optional usage, identity/provenance and timings. Search results are candidates,
not citation annotations or proof that every page supports the answer. No prose
URL extraction or fabricated spans. Empty results and gaps stay visible. Use
search for URL enumeration, answer for synthesis, crawl to verify pages. Avoid
parallel bursts that consume shared account quota.

Failures distinguish invalid request, disabled endpoint, server Codex auth, busy
capacity, account quota, upstream, timeout, transport and malformed response.
Retry-After is advisory; no retry is performed. Pi receives safe isError results;
caller cancellation remains AbortError.

## Harness-neutral export

```ts
import {
  askWeb,
  formatWebAnswer,
  WebAnswerClientError,
} from "@patrick3131/pi-packages/research";
const started = Date.now();
const answer = await askWeb(
  { query: "Find the Python documentation" },
  { signal },
);
const { text, details } = formatWebAnswer(answer, Date.now() - started);
```

askWeb accepts explicit env, fetch, signal and HTTP timeoutMs options. Wire
metadata keeps snake_case. Runtime error class and TypeScript types are exported.
The bundle has no Coding Agent/TUI runtime requirement.

```bash
npm test --workspace=packages/pi-discovery
npm run typecheck --workspace=packages/pi-discovery
DISCOVERY_LIVE=1 npm test --workspace=packages/pi-discovery
```

Default tests never call the network. Explicit live mode fails on unreachable
services. Package replaces pi-searxng directly; no backward compatibility layer.
Search implementation retains MIT attribution to pi-searxng-search.

The answer keeps its inline links. The extra list is labeled retrieved results,
may include uncited pages, and defaults to five entries (explicit max_sources up
to 20 still works). Absence from this capped list says nothing about whether an
inline link supports a claim. results_truncated describes list clipping only.
Model-facing text and TUI include observed web-action count and server total
time; actions can include search, open and find. Queries, token usage, detailed
timings and client wall time remain available in details without cost estimates.

## Meta Ad Library

`ad_library_keyword_ads` discovers advertisers by keyword; `ad_library_domain_ads`
requires exactly one of `domain` or `page_id`. Both accept country, active_only,
max_ads (10–300) and timeout_ms (5000–180000, default 120000). They default off;
enable with `DISCOVERY_AD_LIBRARY_ENABLED=1` or per-project `.pi/tools.json`.
The configured `DISCOVERY_AD_LIBRARY_TIMEOUT_MS` is a floor (130000 by default);
effective timeout includes 10000ms beyond the server budget. No client retries.
Results expose receipts, resolved-page votes, partial results and truncation.
Harness-neutral exports: `searchAdLibrary`, `adsForAdvertiser`, `formatAdLibrary`,
`AdLibraryClientError`. Errors preserve safe server codes and Retry-After;
caller abort remains AbortError. Live tests opt in with `DISCOVERY_LIVE=1`.

Ad Library model-visible output includes landing domains/URLs, page IDs, ad copy
and supplied image/video/carousel previews. Native outputSchema/structuredContent
exposes all API-returned ads and metadata to codemode. Text previews are bounded
and explicitly shortened; structured data remains available. Counts are samples,
not total active inventory. Domain not-found/ambiguous outcomes preserve server
codes and are normal lookup outcomes, never proof that a brand has no ads.

API 0.3.1 resolves dynamic template copy using one representative card. Preserve
`template_fields` and zero-based `representative_card_index` in structured
output; the text formatter labels this source and shows its product landing
URL separately. Unresolved copy is null. Legacy template strings are labelled
unavailable in text previews. DCO cards may be variants, not carousel slides.

## Instagram and TikTok profile and post metadata

Three default-off tools query the server-owned social routes. Pi never contacts
Instagram or TikTok and holds no provider, residential-proxy, cookie or signer
credentials. TikTok is a first-class platform in the schemas, formatters and
validation; its signed listing may still return a typed
`social_verification_required` partial sample while the server signer gate is
incomplete.

| Tool                   | Route                         | Selection and bounds                                                                                      |
| ---------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `social_profile`       | POST /v1/social/profile       | platform; username or profile URL; timeout_ms 5000–60000                                                  |
| `social_profile_posts` | POST /v1/social/profile-posts | platform; username or profile URL; max_posts 1–50 (default 12); timeout_ms 5000–180000                    |
| `social_post`          | POST /v1/social/post          | Instagram shortcode/URL or TikTok `video_id` + author `username` / TikTok post URL; timeout_ms 5000–60000 |

Enable with `DISCOVERY_SOCIAL_ENABLED=1` or per-project `.pi/tools.json`; the
server's own `SOCIAL_ENABLED` gate stays authoritative, and a disabled server
returns a typed `social_disabled` error. Each call sends exactly one selector
(plus optional `platform: "instagram" | "tiktok"`) to exactly one route after
local validation: canonical HTTPS hosts, no userinfo, explicit ports,
percent-encoded paths, backslashes, traversal or reserved profile segments, and
URLs up to 512 characters. TikTok URLs are `https://www.tiktok.com/@<handle>` or
`/@<handle>/video/<id>` and reject query/fragment strings; TikTok handles are
1–24 characters and a post needs its author handle.

`DISCOVERY_SOCIAL_TIMEOUT_MS` is a 130000 ms floor. Omitted tool timeouts resolve to
the route default (30000 for profile/post, 120000 for profile-posts), and the HTTP
budget is `max(floor, effective server budget + 10000)`, so a 180000 ms sample uses
at least 190000 ms. Caller abort always wins and stays `AbortError`.

`social_profile` is one query (identity and counts; TikTok adds
`total_like_count`). `social_profile_posts` lists and, for Instagram, hydrates up
to `max_posts` candidates; TikTok's signed listing is non-hydrating behind its
server gate. Results are a bounded sample in upstream encounter order: pinned
posts may lead, so never present them as the latest chronological posts. TikTok
`shortcode` is null, `like_counts_hidden` is null, and `music`, `hashtags`,
`share_count`, `collect_count`, `is_ad` and `is_aigc` are additive fields.
Continuation is tri-state (`has_more_posts`: true, false or null for unknown).

Model-visible text is bounded to 12000 characters with at most five post previews
and 300 caption characters each, and labels shortening explicitly. It preserves
private profiles, null/zero/hidden counts, actual post authors, warnings about
pinned order and expiring media URLs, and unknown continuation. Native
outputSchema/structuredContent carries the complete response, including ids,
`observed_at`, profile/post/media references, `failed_posts`, `sample_failure`
with `retry_after_s`, truncation/warnings order and timings.

HTTP 200 partial data is `status: partial` with `isError` unset; only failed HTTP or
client calls are errors. A 404 becomes `status: not_found` with the exact
`social_profile_not_found` or `social_post_not_found` code, which is not proof of a
private account. `partial` is not a retry signal: this client never retries, waits,
rotates proxies or reacquires because a sample is partial, and it ignores a
`Retry-After` header on HTTP 200 while keeping `sample_failure.retry_after_s`. An
actual HTTP 429 reports the sanitized delay as advisory `retryAfterMs`.

Harness-neutral exports: `getSocialProfile`, `getSocialProfilePosts`,
`getSocialPost`, `formatSocialProfile`, `formatSocialProfilePosts`,
`formatSocialPost` and `SocialClientError`. Each accepts injected `env`, `fetch`
and `AbortSignal` and returns typed API data without TUI dependencies.

## YouTube search, channels, transcripts and video metadata

Four tools query the server-owned YouTube routes. Pi never contacts YouTube and
holds no YouTube, residential-proxy, cookie, Data API or signer credentials. All
four are default-on; set `DISCOVERY_YOUTUBE_ENABLED=0` (or false/off/no) or a
project `.pi/tools.json` false to opt out.

| Tool                 | Route                       | Selection and bounds                                                                                                                          |
| -------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `youtube_search`     | POST /v1/youtube/search     | query 1–200 chars; max_results 1–20; language/region; timeout_ms 5000–30000                                                                   |
| `youtube_channel`    | POST /v1/youtube/channel    | exactly one channel_id, handle or strict channel URL initially; or channel_id + cursor; language/region; timeout_ms 5000–30000; no max_videos |
| `youtube_transcript` | POST /v1/youtube/transcript | exactly one video_id or YouTube URL; language; format segments/text; max_chars 1000–300000; start_ms 0–86400000; timeout_ms 5000–30000        |
| `youtube_video`      | POST /v1/youtube/video      | exactly one video_id or YouTube URL; timeout_ms 5000–30000; no batch selector                                                                 |

`youtube_video` returns one video's exact ISO 8601 `published_at`, description,
duration, view/like/comment counts, `live_status`, tags and category. The text
shows a bounded description preview; structured output keeps the full
description, and `description_truncated`/`tags_truncated` say when the server
applied its own cap. It never fetches comments or a transcript. Channel text now
includes `published_at` for the latest 15 videos and says plainly when a row only
has relative `published_text`.

The server needs its own YouTube Data API key for this route. Without it the call
fails with 503 `youtube_metadata_unavailable` and a reason such as
`data_api_key_missing` or `data_api_quota_exceeded`; that is a server
configuration/quota condition, not a video-based retry signal, and search,
channel and transcript keep working.

Search is deliberately one provider page of up to 20 videos: there is no `page`
or continuation. `captions_advertised` is the provider caption badge, not a
transcript guarantee; `has_captions` remains an optional one-release alias.
Channel pages return metadata, optional about data and at most 30 recent videos.
Use the returned `next_cursor` with the same `channel_id` for the next page.
There is intentionally no `max_videos`: a provider page is 30, and truncating it
would make the cursor skip records. A channel page never fetches transcripts;
call `youtube_transcript` once for each chosen `video_id`. `about: null` still
means the videos are valid. `cursor_overflow: true` means more videos exist but
paging is unavailable.

Transcripts resolve `video_id` or `watch?v=`, `/shorts/`, `/embed/` and
`youtu.be/` URLs locally; an omitted language means auto (manual tracks beat
ASR). Segment and text windows contain whole segments only. `start_ms` resumes
at a segment boundary; `next_start_ms`, `total_chars` and `returned_chars`
describe exactly what was returned. The tool clamps its server request to the
formatter budget (8000 text or 11500 segment characters), so `next_start_ms` is
the first content the model did not see and a follow-up call makes progress. An
empty window after the last segment is valid and complete, not malformed.

`DISCOVERY_YOUTUBE_TIMEOUT_MS` is a 40000 ms floor. Omitted tool timeouts resolve
to 30000 ms, and the HTTP budget is `max(floor, effective server budget + 10000)`.
No client retries, waits, rotates sessions or probes health. HTTP 404
`youtube_no_captions`, `youtube_unavailable`, `youtube_channel_not_found` and
`youtube_video_not_found` are `status: not_found` with the exact server code and
are not retry signals; the channel and video tools use tool-specific copy. 503
`youtube_metadata_unavailable` reports the allowlisted reason. 401
`youtube_disabled`, 429
`youtube_queue_full`, 502 `youtube_blocked`/`youtube_upstream` and 504
`youtube_timeout` are error envelopes with the safe reason and Retry-After when
present. Caller abort stays `AbortError`.

Model-visible text is bounded to 12000 characters. Channel text always includes
all returned video ids/titles and the cursor instruction, with a ≤600-character
about excerpt; the full description and records stay in structured output.
Transcript text says exactly how many characters start at which time, plus the
total and the next `start_ms`; it never re-clips a server window below 12000
characters or claims that a later page is the beginning of the transcript.
Native outputSchema/structuredContent keeps the complete response. Harness-neutral
exports: `searchYoutube`, `getYoutubeChannel`, `getYoutubeTranscript`,
`getYoutubeVideo`, `formatYoutubeSearch`, `formatYoutubeChannel`,
`formatYoutubeTranscript`, `formatYoutubeVideo`, `YoutubeClientError`, the tool
definitions and their parameter/response types.

The package is `0.9.0`; the four verbs remain separate so intent, cost and
failure surfaces stay explicit.
