# Work-package testing policy

Use tests to protect material production behavior, not to prove that files changed.

## Decide before writing tests

Choose one coverage decision in the test plan:

- **Automated coverage required** — a new or changed test protects a named failure mode.
- **Existing coverage is sufficient** — current tests already prove the relevant behavior.
- **No automated test needed** — the change has no material runtime risk, or the risk is best proved manually.

Inspect the existing test suite before proposing new cases. Prefer extending an existing test at the cheapest stable layer over creating a parallel test or test file.

## Test only distinct risks

For each proposed automated case, name the production failure it prevents and use one proof layer:

- unit tests for pure logic and branch behavior;
- integration tests for real module or service boundaries;
- browser/manual checks only for behavior that lower layers cannot prove.

Do not duplicate the same failure mode across layers. Do not test compiler guarantees, framework behavior, mocks, test helpers, source structure, exact copy, CSS classes, trivial prop forwarding, or the fact that a test file exists. Do not add tests merely because production code changed.

Use a default budget of **zero to three new automated cases**. Exceed it only when every additional case protects a distinct named risk. For regression work, verify a new test fails for the intended reason before applying the fix when practical.
