# Agent Note: Skill and MCP demo plugins dogfood the plugin manager

Status: implemented

English | [中文](2026-08-24-skill-mcp-demo-plugins.zh.md)

## Problem

The plugin manager — `dsh-host-plugin-inventory` plus the model-facing `plugin_inventory` tool and the `dsh plugin`/`dsh mirror` CLI — had only ever been exercised against client-side bundles (ui-mods). Nothing had verified how an AI actually installs and toggles a *host* plugin, where the install path (`dsh plugin add link:<path>`) and the Loader-entry shape (a skill provider or an MCP bridge) differ from a client bundle.

## Decision

Two demo plugins, each installable through `dsh plugin --profile <name> add link:<path>`:

- `@deepseek-ai/dsh-skill-conventional-commits` (`packages/skill/skill-conventional-commits`) — a bundled `SkillProvider` on `ctx.skills`, carrying a `dsh.bundle.patch` so the manager can add it as a profile layer.
- `@deepseek-ai/dsh-mcp-everything` (`packages/mcp/mcp-everything`) — a config-only bundle whose `cordis.patch.yml` inserts an `mcp-client` row pointed at the reference everything MCP server over stdio.

## Alternatives considered

**Use a filesystem `SKILL.md` for the skill instead of a bundled provider.** Rejected for this exercise: a filesystem skill is invisible to the plugin manager (it is not a Loader entry), which is precisely one of the findings to surface — the two skill paths have different management surfaces.

**Reuse `skill-badge` unchanged.** Rejected: `skill-badge` has no `dsh.bundle.patch`, so it cannot be installed through `dsh plugin`; the demo needed a bundled provider that is actually installable.

## Consequences

Dogfooding surfaced these practical issues; the first three were fixed in the same change:

1. `dsh plugin add link:<relative-path>` without a `./` prefix was not anchored to the invoking cwd — `anchorPathSpec` only rewrote `.`/`..` paths. Fixed: `file:`/`link:` specs now anchor against the invoking directory regardless of the `.` prefix.
2. `spawnSync('pnpm', args, { shell: true })` in `dsh-plugin` joined args without escaping, so a checkout path containing a space (this repo's `D:\DeepSeek Harness`) split the link spec and the install failed with `ERR_PNPM_SPEC_NOT_SUPPORTED_BY_ANY_RESOLVER`. Fixed: anchored args are double-quoted through the shell join.
3. When a broken link was produced, `reconcilePlugins` misreported it as "declares no dsh.bundle" — the resolver failure was conflated with a missing bundle declaration. The misreport disappears once the link resolves.
4. A bundled skill provider is not installable through `dsh plugin` without adding a `dsh.bundle.patch` wrapper, and a skill added as a filesystem `SKILL.md` sits entirely outside the plugin manager.
5. The MCP server script imports `@modelcontextprotocol/sdk` and `zod`, which the config-only bundle must declare as its own `dependencies` so the spawned `node server/echo-server.mjs` resolves them by walking up from the server directory — the hoisted workspace root does not serve it.
6. A config-only bundle still needs `src/index.ts` (`export {}`) and `src/invariant.ts` so the workspace tsdown entry glob (`{index,invariant,startup}`) has at least one source file to build.

The two demo plugins are functional and installable: the skill provider's registration test passes, and the MCP bridge round-trip (`echo`/`add`/`now`) was verified end to end. Both carry bilingual READMEs; invariant coverage rides the shared `test-invariants` topology suite.
