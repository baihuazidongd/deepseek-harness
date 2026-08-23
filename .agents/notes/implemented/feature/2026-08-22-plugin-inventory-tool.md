# Agent Note: plugin_inventory, the model-facing plugin manager

Status: implemented

English | [中文](2026-08-22-plugin-inventory-tool.zh.md)

## Problem

The plugin manager existed only as a browser surface (`dsh-client-ui-mods` reading the `pluginInventory` Remote). The agent had no model-visible way to manage plugins: no tool to list the configured entries, none to flip an entry's enablement, and no statement anywhere the model reads of how a new plugin is installed into a profile (`dsh plugin --profile <name> add <package>` plus an entry row in the profile's `cordis.patch.yml`, applied live by the patch watcher). A user asking the agent to "disable the lsp plugin" or "install this plugin for me" had no path that did not start with the agent discovering all of this from source.

## Decision

New package `@deepseek-ai/dsh-tool-plugin-inventory` registers one `plugin_inventory` tool on `ctx.tools`, dispatching to the existing host `pluginInventory` service (`inject: ['tools', 'pluginInventory']`):

- `operation: 'list' | 'set_enabled'` (plus `entryId`/`enabled` for the write); both return the refreshed inventory as the wire value.
- The tool description is the usage guide the model reads: the entry fields, the hot-apply/persist semantics of a flip, the mirror-first install procedure, and how to treat a `failed` entry. The description text is pinned by the package test.
- Nullable entry fields (`fiberPhase`, `source`, `description`, `version`) use `oneOf` branches in the output schema because the enforced JSON Schema subset types `enum` against a single scalar type.

The service stays on the host plane (the browser Remote reads the same instance). What a preset chooses is whether its agent gets the tool: the shipped presets (`standard`, `code`, `cordis`) mount the row, and the web composition resolves the package through `dsh-web-app`'s dependencies. The shipped-catalog snapshot (`shipped-composition.e2e.ts`) gained `plugin_inventory` as a fixed member.

The Context merge for `pluginInventory` moved to the service package (`dsh-host-plugin-inventory` declares `Context.pluginInventory`), following the convention that the declaring Service Definition owns the merged type.

Documentation wiring follows the repo's generated-catalog rules: the inventory payload types gained a subsystem page (`docs/subsystems/plugins.md` with `type-equiv` blocks registered in `scripts/type-equiv.manifest.json`), `gen-cordis-catalog` maps the `pluginInventory` service to it, `gen-tool-catalog` carries the tool row with its Model Experience, and `gen-doc-graphs` classifies the service (`SERVICE_ROLES`, consumers `tool-plugin-inventory` and `api-remotes`); the generated catalog pages and graph docs keep their Chinese sides alongside.

## Mirror-first install (the minimal closed loop)

The first description installed straight into the live profile. The user's design (test on a spawned mirror with its own home and an offset port, AI-driven test ladder, report page, approval cards, diff review) was cut to the smallest loop that still proves a plugin before it touches the live tree, all of it inside the tool description because the agent already owns shell, file edits, and this tool:

1. Copy the booted profile's directory to `<name>-mirror` under `$DSH_HOME/profiles/` (a shell copy resolves the same tree).
2. `dsh plugin --profile <name>-mirror add <package>`, then an insert block in the mirror's `cordis.patch.yml` (`- insert:` with the `- id:`/`name:` pair — a bare top-level row is an override of an existing entry and is skipped for an unknown id).
3. Boot the mirror as a background process on a free port: `dsh --profile <name>-mirror --port <port>`. Same `DSH_HOME`, deliberately: a separate home would lose credentials, and the agent could not drive the mirror at all. Isolation comes from the profile copy and the port, not the home.
4. Read the mirror's log until the entry reports `active`, share the mirror URL, and wait for the user's approval.
5. After approval, repeat install+patch on the live profile (patch watcher applies it live, `list` verifies), then stop the mirror process; the mirror profile is disposable.

`dsh --profile <name> web` cannot serve as the mirror boot: the `web` subcommand hard-codes profile `web` and rejects parent `--profile`, so the app-argument form (`dsh --profile <name>-mirror --port <port>`) is the only spelling. Deferred from the user's design, none of it blocking: a dedicated mirror tool with health-check integration, the test-report page, approval cards, and patch-diff review UI.

## Alternatives considered

- A prompt section instead of a tool: states the facts but cannot act, and a prompt section cannot carry the inventory itself (it is dynamic state, and model-visible dynamic state belongs in tool results, not in a re-rendered prompt).
- Teaching the agent to edit `cordis.patch.yml` directly with fs/shell tools and no tool at all: possible today, but without the tool the agent has no cheap way to read entry ids or fiber phases, and the enablement write path (loader update + persisted row) has semantics the raw file edit would have to rediscover.

## Consequences

- Agents composed from the shipped presets can list and toggle plugins, and know the install procedure; agents on compositions without the host service leave the row waiting (standard Cordis inject semantics), never failed.
- A wording change to the model-visible guide is a test change in the same PR (the package test pins the `dsh plugin` line).
- TUI (base-bundle, non-preset) does not mount the tool yet; adding it there means mounting the host `plugin-inventory` row in the base bundle, which this change deliberately does not decide.
