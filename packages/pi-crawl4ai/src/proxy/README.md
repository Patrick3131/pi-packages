# Proxy Adapters

This module provides a pluggable proxy adapter system for pi-crawl4ai.

## Built-in Adapters

| Adapter | Priority | Env Vars | Description |
|---------|----------|----------|-------------|
| `generic` | 1 (highest) | `CRAWL4AI_PROXY_URL` | Any proxy with URL format |
| `oxylabs` | 2 | `OXYLABS_USER`, `OXYLABS_PASS` | Oxylabs ISP residential |
| `custom` | 0 (via JSON) | - | Configured via JSON file |

## Configuration Priority

1. **JSON config file** (`.pi/crawl4ai.json` or `~/.pi/agent/extensions/crawl4ai.json`)
2. **Environment variables**
3. **Defaults**

## JSON Config Examples

### Generic Proxy

```json
{
  "url": "http://localhost:11235",
  "proxy": {
    "url": "http://user:pass@proxy.example.com:8080"
  }
}
```

### Oxylabs ISP

```json
{
  "url": "http://localhost:11235",
  "proxy": {
    "provider": "oxylabs",
    "username": "your_username",
    "password": "your_password",
    "host": "pr.oxylabs.io",
    "port": 7777
  }
}
```

### Custom Provider

```json
{
  "url": "http://localhost:11235",
  "proxy": {
    "host": "proxy.custom.com",
    "port": 3128,
    "username": "user",
    "password": "pass"
  }
}
```

## Adding a Custom Adapter

Create a file implementing the `ProxyAdapter` interface:

```typescript
// my-custom-adapter.ts
import type { ProxyAdapter, ProxyConfig } from "pi-crawl4ai";

export const myCustomAdapter: ProxyAdapter = {
  name: "my-custom",

  isConfigured(): boolean {
    // Check if this adapter should be active
    return !!process.env.MY_PROXY_TOKEN;
  },

  getConfig(): ProxyConfig {
    // Return the proxy configuration
    return {
      server: "http://my-proxy.com:8080",
      username: "user",
      password: process.env.MY_PROXY_TOKEN || "",
      adapterName: this.name,
    };
  },
};
```

Then register it when using the extension programmatically:

```typescript
import { createProxyService, myCustomAdapter } from "pi-crawl4ai";

const proxyService = createProxyService({
  customAdapters: [myCustomAdapter],
});
```

## Adapter Interface

```typescript
interface ProxyAdapter {
  /** Unique name for this adapter */
  readonly name: string;

  /** Check if this adapter is configured and should be used */
  isConfigured(): boolean;

  /** Get the proxy configuration (only called if isConfigured returns true) */
  getConfig(): ProxyConfig;
}

interface ProxyConfig {
  server: string;      // e.g., "http://proxy.com:8080"
  username?: string;   // Optional auth
  password?: string;   // Optional auth
  adapterName: string; // For logging
}
```
