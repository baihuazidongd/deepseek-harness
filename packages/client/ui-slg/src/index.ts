/**
 * Live-stream room view plugin, node half.
 *
 * Deliberately empty. The room is a browser-only conversation surface (a
 * `conversation` slot replacement); nothing here reaches a model request or a
 * host service. See the browser half for the slot registration.
 */

/** Host plugin body — no host-side contribution. */
export function apply(): void {}
