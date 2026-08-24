// @vitest-environment jsdom
/**
 * ui-message-jump browser half on a real cordis Context with fake slots/locale
 * faces: the plugin registers the header control at
 * conversation.session.header.actions, waits on that slot's declaration, and
 * registration disposal rides the plugin fiber (HMR safety). The node half is
 * exercised over the same Context.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.session.header.actions': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)

  ctx.provide('locale', new LocaleRuntime(ctx))

  const fiber = ctx.plugin({ inject: [...inject], apply })

  return {
    ctx,
    fiber,
    entry: () => {
      const entry = ctx.slots.entries('conversation.session.header.actions')[0]
      if (entry === undefined) return undefined
      return { ...entry.options, locale: entry.locale }
    },
  }
}

describe('ui-message-jump browser plugin', () => {
  it('registers the header control entry', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toMatchObject({ id: 'message-jump', order: 0, locale: 'message-jump' })
  })

  it('drops the entry when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toBeDefined()
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
  })
})

describe('ui-message-jump node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
