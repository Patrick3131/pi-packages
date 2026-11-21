/**
 * Sanitized client failures. `serverCode` is the exact API code when present;
 * `code` is the stable client category used by tool envelopes.
 */
export class YoutubeClientError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public serverCode?: string,
    public requestId?: string,
    public retryAfterMs?: number,
    public reason?: string,
  ) {
    super(`YouTube request failed (${code}).`);
    this.name = "YoutubeClientError";
  }
}
