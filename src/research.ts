/** Supported harness-neutral clients. Consumers inject config, cwd and cancellation. */
export { searchSearxng } from "../packages/pi-discovery/src/features/web-search/client";
export type {
  SearxngSearchParams,
  SearxngSearchDetails,
} from "../packages/pi-discovery/src/features/web-search/types";
export {
  executeCrawl,
  buildDeepCrawlStrategy,
  CrawlValidationError,
} from "../packages/pi-crawl4ai/src/features/crawl/crawlCore";
export { executeCrawlRead } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadCore";
export type { CrawlReadParams } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadCore";
export type { CrawlToolParams } from "../packages/pi-crawl4ai/src/features/crawl/types";
export type { Crawl4AIConfig } from "../packages/pi-crawl4ai/src/config/types";

export { searxngToolDefinition } from "../packages/pi-discovery/src/features/web-search/definitions";
export { crawlToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlToolDefinition";
export { crawlReadToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlReadToolDefinition";

export { listCrawlSessions } from "../packages/pi-crawl4ai/src/features/crawl/cleanup";

export {
  CrawlEvidenceSchema,
  PageEvidenceSchema,
  EvidenceViewSchema,
} from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type {
  CrawlEvidence,
  PageEvidence,
} from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export { CrawlOperationError } from "../packages/pi-crawl4ai/src/features/crawl/http";

export { executeCrawlInteract } from "../packages/pi-crawl4ai/src/features/crawl/crawlCapabilities";
export type {
  CrawlInteractParams,
  CrawlAction,
  CardExtractionSchema,
} from "../packages/pi-crawl4ai/src/features/crawl/crawlCapabilities";
export { crawlInteractToolDefinition } from "../packages/pi-crawl4ai/src/features/crawl/crawlInteractToolDefinition";

export {
  ReadEvidenceSchema,
  SourceRangeSchema,
} from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type { ReadEvidence } from "../packages/pi-crawl4ai/src/features/crawl/evidence";

export type {
  CrawlExecutionOptions,
  CrawlExecutionResult,
  CrawlAcquisitionProgress,
} from "../packages/pi-crawl4ai/src/features/crawl/crawlCore";
export { ManifestMetadataSchema } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type { ManifestMetadata } from "../packages/pi-crawl4ai/src/features/crawl/evidence";
export type {
  CrawlFailureData,
  CrawlPhase,
  CrawlErrorCategory,
} from "../packages/pi-crawl4ai/src/features/crawl/http";

export {
  askWeb,
  formatWebAnswer,
  WebAnswerClientError,
} from "../packages/pi-discovery/src/features/web-answer/client.js";
export type {
  WebAnswerParams,
  WebAnswerOptions,
  WebAnswerResult,
  WebAnswerDetails,
  WebAnswerErrorCode,
} from "../packages/pi-discovery/src/features/web-answer/client.js";
export { webAnswerToolDefinition } from "../packages/pi-discovery/src/features/web-answer/definitions.js";

export {
  searchAdLibrary,
  adsForAdvertiser,
  formatAdLibrary,
  AdLibraryClientError,
} from "../packages/pi-discovery/src/features/ad-library/client.js";
export type {
  AdLibraryParams,
  AdLibraryOptions,
  AdLibraryResult,
} from "../packages/pi-discovery/src/features/ad-library/client.js";

export type {
  AdLibraryAd,
  AdImage,
  AdVideo,
  AdCard,
} from "../packages/pi-discovery/src/features/ad-library/client.js";

export {
  getSocialProfile,
  getSocialProfilePosts,
  getSocialPost,
} from "../packages/pi-discovery/src/features/social/client.js";
export {
  formatSocialProfile,
  formatSocialProfilePosts,
  formatSocialPost,
} from "../packages/pi-discovery/src/features/social/format.js";
export { SocialClientError } from "../packages/pi-discovery/src/features/social/errors.js";
export type {
  SocialClientOptions,
  SocialProfileParams,
  SocialProfilePostsParams,
  SocialPostParams,
} from "../packages/pi-discovery/src/features/social/types.js";
export {
  socialProfileDefinition,
  socialProfilePostsDefinition,
  socialPostDefinition,
} from "../packages/pi-discovery/src/features/social/definitions.js";
export {
  adLibraryKeywordDefinition,
  adLibraryDomainDefinition,
} from "../packages/pi-discovery/src/features/ad-library/definitions.js";

export {
  searchYoutube,
  getYoutubeTranscript,
  YoutubeClientError,
} from "../packages/pi-discovery/src/features/youtube/client.js";
export {
  formatYoutubeSearch,
  formatYoutubeTranscript,
} from "../packages/pi-discovery/src/features/youtube/format.js";
export type {
  YoutubeClientOptions,
  YoutubeSearchParams,
  YoutubeTranscriptParams,
} from "../packages/pi-discovery/src/features/youtube/types.js";
export {
  youtubeSearchDefinition,
  youtubeTranscriptDefinition,
} from "../packages/pi-discovery/src/features/youtube/definitions.js";

export {
  newAmazonReleases,
  searchAmazon,
  getAmazonProduct,
  AmazonClientError,
} from "../packages/pi-discovery/src/features/amazon/client.js";
export {
  formatAmazonListing,
  formatAmazonProduct,
} from "../packages/pi-discovery/src/features/amazon/format.js";
export type {
  AmazonListingResponse,
  AmazonProductResponse,
  AmazonNewReleasesParams,
  AmazonSearchParams,
  AmazonProductParams,
  AmazonSort,
} from "../packages/pi-discovery/src/features/amazon/types.js";
export {
  amazonNewReleasesDefinition,
  amazonSearchDefinition,
  amazonProductDefinition,
} from "../packages/pi-discovery/src/features/amazon/definitions.js";
export { searchLinkedInAds, formatLinkedInAds } from "../packages/pi-discovery/src/features/ad-library/linkedin.js";
export { linkedinAdsDefinition, type LinkedInAdsParams, type LinkedInAdsResult } from "../packages/pi-discovery/src/features/ad-library/linkedin-schema.js";
