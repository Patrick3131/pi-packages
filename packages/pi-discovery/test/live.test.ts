import assert from "node:assert/strict";
import test from "node:test";
import { liveEnabled } from "../src/config.js";
import { askWeb } from "../src/answer.js";
import { searchSearxng } from "../src/search.js";

test(
  "live discovery answer and direct SearXNG",
  { skip: !liveEnabled() },
  async () => {
    const answer = await askWeb({
      query: "Find the official Python documentation website",
      max_sources: 3,
    });
    assert.equal(answer.model, "gpt-6-luna");
    assert.equal(answer.source_type, "search_results");
    assert.ok(answer.answer);
    assert.ok(answer.sources.length);
    const search = await searchSearxng({
      query: "Python documentation",
      maxResults: 3,
    });
    assert.ok(search.details.results.length);
  },
);
