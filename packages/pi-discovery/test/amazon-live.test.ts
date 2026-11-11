import assert from "node:assert/strict";
import test from "node:test";
import { liveEnabled } from "../src/config.js";
import {
  AmazonClientError,
  getAmazonProduct,
  newAmazonReleases,
  searchAmazon,
} from "../src/amazon.js";

test(
  "live Amazon listing, relevance search and product contract",
  { skip: !liveEnabled() },
  async () => {
    const releases = await newAmazonReleases({
      node: "baby-products",
      page: 1,
    });
    assert.equal(releases.source, "new_releases");
    assert.ok(releases.items.length > 0);
    assert.equal(releases.page, 1);

    const search = await searchAmazon({
      keyword: "baby bottle",
      sort: "relevance",
      page: 1,
    });
    assert.equal(search.source, "search");
    assert.ok(search.items.length > 0);
    assert.equal(search.keyword, "baby bottle");

    const product = await getAmazonProduct({ asin: "B0GYRV25GG" });
    assert.equal(product.product.asin, "B0GYRV25GG");
    assert.ok(product.product.title.length > 0);

    await assert.rejects(
      getAmazonProduct({ asin: "B0ZZZZZZZZ" }),
      (error: unknown) =>
        error instanceof AmazonClientError && error.code === "not_found",
    );
  },
);
