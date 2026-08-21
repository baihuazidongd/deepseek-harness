/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-slg`.
 * @module @deepseek-ai/dsh-client-ui-slg/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-slg'

/** Cordis companion plugin name. */
export const name = 'client-ui-slg-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the only contribution is the `conversation` slot
 * replacement, an effect owned and observed by the slot registry (its ledger
 * is the authoritative event stream).
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
