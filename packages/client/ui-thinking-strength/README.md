# @deepseek-ai/dsh-client-ui-thinking-strength

English | [中文](README.zh.md)

Thinking-strength plugin, browser half: a single composer tool-row chip in `conversation.input.right`, immediately before the primary send button, that opens the current model's selectable reasoning-effort levels and submits through the SAME per-session `ModelDirectory` owned by `ctx.modelDirectories` that `ui-model-selection`'s composer seat and `/model` popup read. The Host-reported `ModelSelection` stays the single selection fact, so a strength picked here is what the model seat shows next and vice versa. It ships as a user-installed library plugin — installed into the profile with `dsh plugin add`, never a `web-app` bundle row — so the plugin manager classifies it as `library`.

The chip renders for every ordinary session with a current model. The trigger shows the current effort (or the provider default); opening a model that carries exact-route reasoning metadata lists its adapter-owned level names, descriptions, and default, while a model without such metadata opens to the "no levels" notice. Choosing a level submits the complete selection through `session.selectModel`; choosing the current level just closes. A rejected selection announces through the shared transient Toast anchored to the composer card, with the directory's error text when one is present. The shared directory's store reaches the component as the bound `useDirectory` framework hook (the reserved inject `hooks` compartment), never as subscription machinery inside the component.

The package owns no directory state and no refresh chain: load/select verbs, availability, and the latest-error accessor come from the shared directory service, and the button follows the directory snapshot. Addressed subagent sessions expose no chip, and their verbs no-op, because those Agent-bound RPCs would activate persisted history outside the direct-parent continuation path.

## Model Experience

Indirectly, through the same `session.selectModel` RPC `ui-model-selection` uses, the chip submits the complete `ModelSelection` (provider, model, and optional effort) that the Host snapshots at the next prompt-assembly boundary; a running step keeps its already-assembled selection, and menu interaction adds no prompt content.

#### KV Cache effect

Selecting an effort can change provider-side cache reuse for subsequent requests to the same route; the prompt prefix itself is untouched.

## Known Limitations and Deferred Work

- **No arbitrary strength input** — the chip offers only the exact model's adapter-advertised levels; a model without reasoning metadata keeps the chip but opens to the no-levels notice instead of a list.
- **Requires `ui-model-selection`** — the chip reads the shared `ctx.modelDirectories` service and shares its per-session directory, so it is absent from compositions that omit that package.
