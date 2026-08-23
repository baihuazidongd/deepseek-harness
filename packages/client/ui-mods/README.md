# @deepseek-ai/dsh-client-ui-mods

English | [中文](README.zh.md)

The 插件 (plugins) page: a top-level management surface for Loader entry enablement. The browser plugin registers one `sidebar.footer.action` entry (id `mods`) — the trigger row beside Settings at the sidebar foot — and opens a full-viewport management panel. The panel lists every non-group Loader entry with its root Fiber status dot and one enablement switch, plus two filter chip groups — status (all/enabled/disabled) and source (all/native plugins/libraries), each with counts — and a search over module name and entry id. Clicking a row expands its detail block: the declared package description, version, full module specifier, loader entry id, and source category (`native` = an installation-owned bundle row, `library` = a package the user installed into the profile; an entry the Host could not classify reads as unknown, and an absent fact renders as a dash). Reads and writes go through the generated [`pluginInventory`](../../host/plugin-inventory/README.md) Remote: `list` for snapshots, `setEnabled` for a switch flip, whose returned snapshot is authoritative — a refused write reverts the row and raises a panel-level error line instead of leaving a stale optimistic state. On the Host, the write persists as an explicit row in the profile's user patch layer and hot-applies through the boot patch watcher, so a toggle survives restart.

The trigger and panel follow the settings shell's patterns: the trigger row matches the sidebar foot's compact rhythm (wide row and rail circle), and the panel is a mask-and-dialog overlay with Escape, mask-click, and header close paths plus baseline focus on the close button. Loading, empty, no-match, generic failure (with retry), and write-failure states stay local to the mounted component and never expose transport details.

## Model Experience

None, as this package only visualizes and manages Host composition state; a toggle can change which plugins a session's composition carries, and each affected plugin documents its own model effect.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One snapshot per open or retry** — the panel does not subscribe to Loader changes or automatically refetch after reconnect; reopening fetches fresh.
- **Detail facts are package-declared only** — the detail block shows the package's own `package.json` facts; entry configuration values, provenance layers, and failure stacks stay deferred.
- **Mirror testing and update flows deferred** — the plugin-manager roadmap (mirror-instance testing ladder, promote gate, harness-update flow) lands in later phases; this package is the management foundation.
