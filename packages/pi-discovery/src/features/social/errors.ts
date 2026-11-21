/** Local failure codes raised before or around a social route response. */
export type SocialClientCode =
  | "invalid_request"
  | "malformed"
  | "transport"
  | "timeout"
  | "upstream";

/**
 * Sanitized failure for the social routes. Mirrors AdLibraryClientError: no raw
 * response text or transport exception ever reaches the message. `code` holds a
 * local code for client-side failures and the sanitized server code when the
 * route answered with a known house error.
 */
export class SocialClientError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public serverCode?: string,
    public requestId?: string,
    public retryAfterMs?: number,
    public reason?: string,
  ) {
    super(`Social request failed (${code}).`);
    this.name = "SocialClientError";
  }
}
