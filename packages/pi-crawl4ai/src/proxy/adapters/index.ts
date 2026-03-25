/**
 * Built-in and custom proxy adapters.
 */

export { genericAdapter, GENERIC_PROXY_URL_ENV } from "./genericAdapter";
export { oxylabsAdapter, OXYLABS_USER_ENV, OXYLABS_PASS_ENV, OXYLABS_HOST_ENV, OXYLABS_PORT_ENV, OXYLABS_PORTS_ENV } from "./oxylabsAdapter";
export { createCustomAdapter, type CustomProxySettings } from "./customAdapter";

import type { ProxyAdapter } from "../types";
import { genericAdapter } from "./genericAdapter";
import { oxylabsAdapter } from "./oxylabsAdapter";

/**
 * Built-in adapters in priority order.
 * Custom adapters are prepended when using createProxyService.
 */
export const builtInAdapters: ProxyAdapter[] = [
  genericAdapter,
  oxylabsAdapter,
];
