# Pi Toolkit architecture

One workspace, four extension factories:
`src/features/{presets,tools,skill-mentions,overview}/index.ts`.
The root Git package references each in existing relative hook order; the toolkit
manifest exposes the same set for standalone development. Nothing auto-registers
a sibling entry point, so feature filters remain meaningful.

Tools/presets share the existing preset-state signal and retain their config
formats. Overview reuses pure parsers/state helpers internally, never their
mutating command handlers. Mentions retains its live skill index/input/provider
stack behavior. Work, recap, delegation, crawl and search remain other packages.

Overview: command -> safe live metadata + scoped file projections -> versioned
snapshot -> self-contained escaped HTML -> atomic private file -> optional
platform browser open. No timers/server/model requests. Disk definitions and live
observations are separate. Package/resource paths link to source evidence and
observed capability relationships; unknown introspection is never converted to
absence. Standard managed cache paths are local evidence, not package resolution.

Optional runtime adapters typecheck against 0.99.1, with newer host introspection
guarded. Provider status uses configured-auth metadata only, never credentials.
MCP declarations/registrations expose policy/tool metadata, not endpoint secrets
or invented connection state. Runtime-specific limitations are documented in
README and visible warnings.

Migration lives in configs/global/migrate-toolkit.py: pure mapping, preview,
backup-first atomic apply, no-op repeat, guarded targeted rollback. The
pi-sync --toolkit-only path updates the published shared package and invokes that
narrow mapping without the normal shared-config replacement. Fresh restore maps
before legacy normalization. User/global and configured remote are the only live
consumer scope; project-owned references require separate approval.
