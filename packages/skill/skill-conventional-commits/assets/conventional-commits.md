# Conventional Commits

Write git commit messages and pull-request titles that follow the
[Conventional Commits](https://www.conventionalcommits.org/) specification. Use
this skill whenever a commit message or PR title is being composed or reviewed.

## Format

```
<type>(<scope>): <subject>
```

The subject is a single line in the imperative mood, lowercase, with no
trailing period, at most 72 characters.

## Types

Use the smallest type that describes the change:

| Type | Meaning |
|---|---|
| `feat` | a new user- or model-facing capability |
| `fix` | a defect correction |
| `refactor` | behavior-preserving restructuring |
| `perf` | a performance improvement |
| `test` | test-only change |
| `docs` | documentation-only change |
| `build` | build, tooling, or dependency change |
| `chore` | housekeeping with no production-code change |
| `ci` | continuous-integration configuration |

## Rules

- Prefer the imperative mood: "add", not "added" or "adds".
- Keep the subject under 72 characters; put rationale in the body, not the subject.
- Add a scope only when it names a package, subsystem, or area the change touches.
- For a breaking change, append `!` after the type/scope (`feat(api)!:`) and add a
  `BREAKING CHANGE:` footer describing the migration.

## Commit body

When the change needs explanation, add a blank line after the subject and write
one or more body paragraphs. State the "why" and any non-obvious consequence;
do not restate what the diff already shows.
