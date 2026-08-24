/**
 * Register a keyless DuckDuckGo search backend in `ctx.web`.
 * @module @deepseek-ai/dsh-web-search-duckduckgo
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-web'
import { DuckDuckGoSearchProvider } from './provider.ts'

export { DuckDuckGoSearchProvider, DUCKDUCKGO_PROVIDER_ID } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-duckduckgo'

/** The web seam this provider registers into. */
export const inject = ['web']

/**
 * Register the DuckDuckGo search provider. It is keyless and config-free.
 * @param ctx - Cordis context carrying the web seam.
 */
export function apply(ctx: Context): void {
  ctx.web.registerSearchProvider(new DuckDuckGoSearchProvider())
}
