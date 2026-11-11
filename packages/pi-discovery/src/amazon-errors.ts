import type { AmazonClientCode, AmazonDataUsage } from "./amazon-types.js";

/**
 * Sanitized client failures. `code` is the stable client category used by tool
 * envelopes, while `serverCode` keeps the exact API code when the server sent
 * one. Per-call `usage` is carried when the service reports it on a failure.
 */
export class AmazonClientError extends Error {
  constructor(
    public code: AmazonClientCode,
    public status?: number,
    public serverCode?: string,
    public requestId?: string,
    public retryAfterMs?: number,
    public reason?: string,
    public usage?: AmazonDataUsage,
  ) {
    super(`Amazon request failed (${code}).`);
    this.name = "AmazonClientError";
  }
}
