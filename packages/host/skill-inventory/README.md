# @deepseek-ai/dsh-host-skill-inventory

English | [中文](README.zh.md)

Remote projection of the discoverable skills with per-skill enablement. The gateway reads `ctx.skills` and overlays a user-disabled set persisted in the `skill-enablement` settings namespace, exposing `list` (every skill with an `enabled` flag), `get` (one skill's full body), and `setEnabled` (flip one skill). The disable set is the single source of truth the model-facing skill catalog and loader honor, so a disabled skill leaves both this management surface and the model's available-skills list.

## Model Experience

Indirectly, through the enablement set: `tool-skill` filters disabled skills out of the model catalog, the `skill` tool, and the `/name` gesture. This package itself sends no request and emits no model-visible prose.

#### KV Cache effect

None directly; a toggle changes which skills the `tool-skill` catalog publishes, shifting that plugin's provider KV prefix.

## Known Limitations and Deferred Work

- Per-skill enablement is a user preference; a skill disabled here is still discoverable by any consumer that bypasses the disable set.
