# @deepseek-ai/dsh-client-ui-skills

English | [中文](README.zh.md)

The 技能 (skills) page: a sidebar-foot management surface for discoverable skills. The browser plugin registers one `sidebar.footer.action` entry (id `skills`) and opens a full-viewport panel that lists every discoverable skill with its source and an enablement switch, a search over name/description/provider, and an expandable detail block (description, provider, source, and the loaded instruction body). Reads and writes go through the generated [`skillInventory`](../../host/skill-inventory/README.md) Remote: `list` for snapshots, `setEnabled` for a switch flip (whose returned snapshot is authoritative), and `get` for the detail body. On the Host, the flip persists into the `skill-enablement` settings namespace and the model-facing catalog honors it, so a disabled skill leaves both this page and the model's available-skills list.

## Model Experience

Indirectly, through the enablement set it writes: `tool-skill` filters disabled skills from the model catalog. This package sends no request and renders no model-visible prose.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- One snapshot per open or retry — the panel does not subscribe to registry changes.
- The detail body loads lazily on expand and is not refreshed while the panel stays open.
