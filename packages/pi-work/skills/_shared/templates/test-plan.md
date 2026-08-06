---
status: backlog
owner: engineering
last_reviewed: YYYY-MM-DD
canonical_ref: none
---

# <Title> Test Plan

## Coverage Decision

<Automated coverage required | Existing coverage is sufficient | No automated test needed>

Reason: <Name the material risk, existing proof, or why no runtime risk exists.>

## Risk Coverage

| Material failure risk | Existing coverage | Cheapest stable proof | Planned change |
|---|---|---|---|
| <Distinct production failure> | <Path or none> | <unit/integration/browser/manual> | <add/update/none> |

## Automated Cases

Default to zero to three new cases. Add more only for distinct named risks.

- <Given / when / expected result, or “None”>

## Browser Or Manual Verification

| Step | Expected result |
|---|---|
| <Action> | <Observable result> |

## Commands

```sh
<Verified repository command>
```

## Explicitly Not Testing

- <Low-value, duplicate, compiler-enforced, or otherwise unjustified coverage>

## Open Questions

None
