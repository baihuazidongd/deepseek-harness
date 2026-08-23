import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as UserPatchesInvariant from '../src/invariant.ts'

describe('user-patches invariant companion', () => {
  it('registers the empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(UserPatchesInvariant).await()).resolves.toBeDefined()
    await ctx.fiber.dispose()
  })
})
