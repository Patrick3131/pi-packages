---
status: done
owner: engineering
last_reviewed: 2026-09-30
canonical_ref: none
---

# Web researcher crawl-specialist handoffs

## Type

technical

## Problem

The reusable web-researcher already has crawl/crawl_read, but does not describe the available package specialists or how to request a bounded parent handoff without nested delegation.

## Outcome

The researcher can distinguish routine direct crawling from optional parent-managed specialist work, accurately names the installed crawl4ai roles, and retains its existing tools and authority boundaries.

## Scope

### Included

- A concise Available specialists section in configs/global/agents/web-researcher.md.
- Document why awareness is not delegation authority; retain direct execution for routine reads.
- Narrowly refresh the identical local and remote global agent definitions after source validation, preserving settings and project-specific overrides.
- User-requested builtin worker and fresh reviewer using opencode-go/deepseek-v4.1-flash with max thinking.

### Excluded

- Restoring the historic work-phase agent fleet, cleanup skills, or optional workflow collection from the earlier analysis.
- Adding subagent/supervisor tools, automatic delegation, browser capability, registries, providers or dependencies.
- Changing crawl implementations, personal settings, model defaults, project-specific researcher variants, or unrelated dirty work.
- Commit/push without renewed explicit publication instruction. The previous backup publication was completed separately.

## Implementation Notes

This implements the immediately preceding recommendation, not the whole historical agent assessment. Source contracts are packages/pi-crawl4ai/agents/{scrape,crawl,extract}.md: scrape reads known URLs; crawl discovers within explicit domain/depth/page bounds; extract interprets saved content with source evidence and missing/inference labels, not deterministic/schema-validated extraction. No specialist guarantees JavaScript rendering. Availability/providers must be verified by the parent. A handoff proposes specialist, question/output, known URLs or exact saved paths, bounds, evidence already collected and gap, avoiding duplicate downloads. No child calls subagents.

## Files

- configs/global/agents/web-researcher.md — add portable specialist-awareness guidance.
- configs/global/README.md — document the parent-handoff distinction.
- configs/global/restore.sh and restore.test.mjs — existing narrow installer/protection proof; do not change.
- packages/pi-crawl4ai/agents/{scrape,crawl,extract}.md — read-only role contract evidence.
- This three-file package — parent-owned planning, validation and completion evidence.

## Acceptance Criteria

- [x] AC1: Names and descriptions match actual crawl4ai.scrape/crawl/extract contracts; no invented capability or rendering guarantee.
- [x] AC2: Routine research uses direct tools; specialists are optional bounded parent handoffs with reuse of existing evidence, not nested execution.
- [x] AC3: Agent frontmatter/tools stay byte-identical; no subagent tools, model pins, permission widening or automatic workflow.
- [x] AC4: Existing restore tests pass; installed local/remote global files match the reviewed source and native discovery resolves the user agent.
- [x] AC5: Worker and fresh reviewer run with the requested DeepSeek V4.1 Flash and max thinking; parent verifies diff/evidence and finishes all three files together.

## Validation

See companion test plan. No new prose snapshot tests; manual contract comparison and existing config regression coverage are sufficient.

## Completion Evidence

AC1–AC5 verified: accurate names/contracts, optional bounded parent handoffs, direct routine reads, unchanged frontmatter/tools, 17 config tests passing and identical reviewed local/remote installed bytes. Native discovery passed. Worker and fresh reviewer actual sessions used `opencode-go/deepseek-v4.1-flash` with `max` thinking. Review notes were resolved; final source SHA256 `46df3754be3bee66a501119cd59df4e45b2e77601e530ccdd6bf649b437e3045`. See test companion for commands, backups and exact runtime evidence. No commit/push inferred; all three documents finish together.

## Open Questions

None
