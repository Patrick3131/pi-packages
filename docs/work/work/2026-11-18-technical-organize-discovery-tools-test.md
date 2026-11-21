---
status: backlog
owner: engineering
last_reviewed: 2026-11-18
canonical_ref: 2026-11-18-technical-organize-discovery-tools.md
---

# Discovery tool organization verification

## Coverage Decision

Existing behavioral coverage is sufficient. Use a one-time packed-consumer check for the module boundary. The refactor changes file locations and imports, so no new permanent cases are planned.

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest proof |
| --- | --- | --- |
| Pi drops, renames, reorders, or accidentally enables a tool | `packages/pi-discovery/test/index.test.ts` and the capability-specific tool tests | Run the existing suite and compare the registered IDs, ordering, and default activation with the baseline where coverage is incomplete. |
| Moved imports change request validation, formatting, or error mapping | Discovery client and tool tests with controlled provider responses | Update imports and run the existing cases against the moved code. |
| A public import disappears or starts loading Pi dependencies | Workspace typecheck and research bundle build | Compare the before and after runtime export names and declared public exports. Install the tarball in a disposable Node project with no Pi host, import representative Discovery and Crawl4AI functions, and typecheck a consumer import. |

## Automated Cases

No new cases planned. Keep existing behavioral assertions. Use the pack smoke once for this refactor.

## Commands

```sh
npm run typecheck --workspace=packages/pi-discovery
npm test --workspace=packages/pi-discovery
npm run test:configs
npm run build:research
npm pack --dry-run
```

Build the bundle before comparing exports and packing. Run the installed-consumer check against a real tarball created with `npm pack`. Include a named import used by Melon Labs, such as `askWeb` or `webAnswerToolDefinition`, and a Crawl4AI export such as `executeCrawl`.

## Acceptance Evidence

Pending implementation. Record the suite results, export comparison, and packed-consumer results here.

## Explicitly Not Testing

- File counts or folder naming through automated assertions.
- Live providers, which add cost and variability without proving this path refactor.
- Eve execution or unrelated toolkit behavior.

## Open Questions

None
