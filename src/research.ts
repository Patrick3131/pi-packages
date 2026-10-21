/** Supported harness-neutral clients. Consumers inject config, cwd and cancellation. */
export { searchSearxng } from "../packages/pi-searxng/src/search";
export type { SearxngSearchParams, SearxngSearchDetails } from "../packages/pi-searxng/src/types";
export { executeCrawl, buildDeepCrawlStrategy, CrawlValidationError } from "../packages/pi-crawl4ai/src/features/crawl/crawlCore";
export { executeCrawlRead } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadCore";
export type { CrawlReadParams } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadCore";
export type { CrawlToolParams } from "../packages/pi-crawl4ai/src/features/crawl/types";
export type { Crawl4AIConfig } from "../packages/pi-crawl4ai/src/config/types";

export { searxngToolDefinition } from "../packages/pi-searxng/src/toolDefinition";
export { crawlToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlToolDefinition";
export { crawlReadToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadToolDefinition";

export { listCrawlSessions } from "../packages/pi-crawl4ai/src/features/crawl/cleanup";

export { CrawlEvidenceSchema, PageEvidenceSchema, EvidenceViewSchema } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type { CrawlEvidence, PageEvidence } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export { CrawlOperationError } from "../packages/pi-crawl4ai/src/features/crawl/http";

export { executeCrawlInteract } from "../packages/pi-crawl4ai/src/features/crawl/crawlCapabilities";
export type { CrawlInteractParams, CrawlAction, CardExtractionSchema } from "../packages/pi-crawl4ai/src/features/crawl/crawlCapabilities";
export { crawlInteractToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlInteractToolDefinition";

export { ReadEvidenceSchema, SourceRangeSchema } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type { ReadEvidence } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
