/** The package's node half: an empty host body and an explained empty invariant companion. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SlgInvariant from '@deepseek-ai/dsh-client-ui-slg/invariant'

describe('invariant companion', () => {
  it('reserves package ownership with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })

    await expect(ctx.plugin(SlgInvariant).await()).resolves.toBeDefined()
  })

  it('has an empty node half', async () => {
    const { apply } = await import('@deepseek-ai/dsh-client-ui-slg')

    // The host body exists only so the package appears in the host cordis.yml;
    // every surface it ships lives in the browser half.
    apply()

    expect(typeof apply).toBe('function')
  })
})
