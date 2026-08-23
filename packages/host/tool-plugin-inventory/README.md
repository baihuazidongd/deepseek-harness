# @deepseek-ai/dsh-tool-plugin-inventory

English | [中文](README.zh.md)

Model-facing `plugin_inventory` tool over the host plugin-inventory Remote.

The tool exposes two operations to the agent:

- `list` — every configured Loader entry with its entry id, module name, enabled flag, fiber lifecycle phase, source classification (`native` / `library`), and declared package description/version.
- `set_enabled` — flip one entry by entry id. The change hot-applies to the live Loader tree and persists into the booted profile's user patch layer (`cordis.patch.yml`), so it survives relaunches.

The tool description is the usage guide the model reads: besides the two operations it states the mirror-first install procedure — copy the booted profile's directory to `<name>-mirror` under `$DSH_HOME/profiles/`, run `dsh plugin --profile <name>-mirror add <package>` through the shell plus an entry row in the mirror's `cordis.patch.yml`, boot the mirror as a background process on a free port (`dsh --profile <name>-mirror --port <port>`, same `DSH_HOME` so credentials carry over), read its log until the entry reports `active`, share the mirror URL, and wait for user approval before repeating install+patch on the live profile (applied live by the patch watcher) — and how to treat a `failed` entry. The description text is owned here and pinned by the package test, so a wording change lands with its test change.

The service itself stays on the host plane: the browser Remote (`dsh-host-plugin-inventory`) reads the same instance the tool dispatches to, and enablement writes are owned by that service. What a preset chooses is whether its agent gets the tool at all — the shipped presets mount this row under `apps/cli/config/agent-presets/*/agent.cordis.yml`.

## Composition

```yaml
- id: tool-plugin-inventory
  name: '@deepseek-ai/dsh-tool-plugin-inventory'
```

Requires the host `pluginInventory` service (mounted by the web composition in `dsh-web-app`); a composition without the service leaves the row waiting, not failed.

## Model Experience

### Tool schemas and results

#### What the model sees

The generated [`plugin_inventory` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-plugin-inventory). Both operations return the refreshed inventory as compact JSON, and the schema description itself is the usage guide — entry fields, hot-apply and persist semantics of a flip, the mirror-first install procedure, and how to treat a `failed` entry — so the package registers no prompt section.

#### Token effect

Fixed schema cost only; no prompt registration. Each call appends one inventory result whose size scales with the Loader tree.

#### KV Cache effect

The schema is prefix-stable while its definition and visibility are unchanged; calls and results append after the reusable request prefix without invalidating earlier entries.

## Known Limitations and Deferred Work

- The TUI (base bundle, non-preset) does not mount this tool; exposing it there means mounting the host `plugin-inventory` row in the base bundle, which is deliberately not decided here.
- The tool reads no failure detail for a `failed` entry (the Loader fiber error is not projected by the inventory Remote yet), so the model can see that an entry failed but not why.
