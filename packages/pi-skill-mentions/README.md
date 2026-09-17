# pi-skill-mentions

Reference several skills from anywhere in one message, with `$` autocomplete.

## Why this exists

Pi expands `/skill:<name>` only when it is the **first token** of a message, and
only once. The parser is literally:

```js
if (!text.startsWith("/skill:")) return text;   // position 0 only
const skillName = text.slice(7, spaceIndex);     // one name, up to the first space
const args = text.slice(spaceIndex + 1);         // everything else is args
```

That is correct for a slash command — everything after the name has to be the
command's arguments — but it means `explain X /skill:a and then /skill:b` cannot
work, and a single message can never load two skills.

This extension adds a mention syntax that has no such ambiguity, because the
mention is delimited by itself:

```
Compare $pi-subagents with $find-skills and tell me which fits.
```

## Syntax

| Written | Result |
| --- | --- |
| `$<name>` anywhere | expanded in place |
| `/skill:<name>` anywhere except the first token | expanded in place |
| `\$<name>` / `\/skill:<name>` | literal, no expansion |
| `/skill:<name>` as the first token | left alone; Pi expands it afterwards |

- Several mentions in one message are all expanded, in the order written.
- Mentioning the same skill twice expands it once; later mentions degrade to the
  bare skill name so the body is not duplicated in context.
- A `$` token only expands when it names a **loaded** skill. Anything else stays
  as literal text — including shell text like `$target`, `$HOME`, `$1`, `$(pwd)`
  and `${VAR}` — so prompts and code snippets are safe, and no warning is raised.
- The explicit `/skill:<name>` spelling *is* reported when the name is unknown,
  because that spelling is an unambiguously deliberate request.
- A known skill whose `SKILL.md` cannot be read is reported and left as written.

Expansion produces exactly what `/skill:<name>` produces:

```
<skill name="alpha" location="/abs/path/skills/alpha/SKILL.md">
References are relative to /abs/path/skills/alpha.

…SKILL.md body, frontmatter stripped…
</skill>
```

## Autocomplete

`$` is registered as a trigger character, and the editor fires trigger characters
the moment they are typed — so a single `$` opens the list, no follow-up letter
needed.

| Typed | Completes |
| --- | --- |
| `$` | every loaded skill, immediately |
| `$pl` | matching names, prefix matches first, with descriptions |
| `/skill:pl` mid-message, then Tab | matching names |
| `/skill:pl` at the start of a line | the built-in slash-command completion |

Notes:

- A `$` fragment that names no loaded skill falls through to other providers
  instead of hijacking the token, so shell words like `$HOME` stay quiet.
- Plain `@path/to/file` attachments keep the built-in behavior; this extension
  never touches `@`.
- Accepting a suggestion replaces just the mention; no trailing space is added.

`/skill-mentions` lists every loaded skill with its description, which is also
the way to see what is available outside the editor (for example over RPC).

## Install

The package is part of the pi-packages Git package; it loads with the rest.

For a single session:

```bash
pi -e ./packages/pi-skill-mentions
```

## Test

```bash
npm test --workspace=packages/pi-skill-mentions
npm run typecheck --workspace=packages/pi-skill-mentions
```
