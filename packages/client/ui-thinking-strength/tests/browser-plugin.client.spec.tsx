// @vitest-environment jsdom
/**
 * ui-thinking-strength browser half on a real cordis Context with fake slots/
 * sessions/modelDirectories faces: the plugin registers the composer chip at
 * conversation.input.right over the shared model directory service, the inject
 * face's verbs route to that directory's load/select/store, an addressed
 * subagent session is reported unavailable and its verbs no-op, and
 * registration disposal rides the plugin fiber (HMR safety). The node half and
 * the invariant companion are exercised over the same Context.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThinkingStrengthInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

afterEach(cleanup)

const sid = (k: string): SessionId => k as SessionId

async function bench(options: { addressed?: boolean } = {}) {
  const ctx = new Context()
  const loads: string[] = []
  const selects: unknown[] = []
  let selectRejects = false
  const state: ModelDirectoryState = {
    current: { provider: 'acme', model: 'acme-large', reasoningEffort: 'high' },
    routable: true,
    groups: [],
    failures: [],
    status: 'ready',
    error: null,
  }
  const store = {
    getSnapshot: () => state,
    subscribe: () => () => {},
  }
  const directory = {
    store,
    load: async () => {
      loads.push('load')
      if (selectRejects) throw new Error('load failed')
    },
    select: async (selection: unknown) => {
      selects.push(selection)
      if (selectRejects) throw new Error('select failed')
    },
  }
  ctx.provide('modelDirectories', {
    directoryFor: (sessionId: SessionId) => {
      void sessionId
      return directory
    },
  })

  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.input.right': { kind: 'list', scope: 'session' } },
  } as never, (() => null) as never)

  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sessions', {
    subagentAddress: (sessionId: SessionId) => {
      void sessionId
      return options.addressed === true ? { mode: 'addressed' } : undefined
    },
  })

  const fiber = ctx.plugin({ inject: [...inject], apply })

  return {
    ctx,
    fiber,
    loads,
    selects,
    state,
    store,
    setSelectReject: (value: boolean) => { selectRejects = value },
    entry: () => {
      const entry = ctx.slots.entries('conversation.input.right')[0]
      if (entry === undefined) return undefined
      return {
        ...entry.options,
        locale: entry.locale,
        inject: entry.inject as unknown as ((sessionId: SessionId) => ThinkingStrengthInjected) | undefined,
      }
    },
  }
}

describe('ui-thinking-strength browser plugin', () => {
  it('registers the composer chip entry', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toMatchObject({ id: 'thinking-strength', order: 0, locale: 'thinking-strength' })
    expect(b.entry()?.inject).toBeTypeOf('function')
  })

  it('exposes the shared directory store through the inject face hooks', async () => {
    const b = await bench()
    await b.fiber.await()
    const face = b.entry()!.inject!(sid('s1'))
    expect(face.available).toBe(true)
    expect(face.hooks.directory).toBe(b.store)
  })

  it('routes load and select to the shared directory and reports the live error', async () => {
    const b = await bench()
    await b.fiber.await()
    const face = b.entry()!.inject!(sid('s1'))
    face.load()
    expect(b.loads).toEqual(['load'])
    const selection = { provider: 'acme', model: 'acme-large', reasoningEffort: 'max' }
    await expect(face.select(selection)).resolves.toBe(true)
    expect(b.selects).toEqual([selection])

    b.state.error = 'model-unavailable: adapter gone'
    expect(face.error()).toBe('model-unavailable: adapter gone')
  })

  it('maps a rejected directory select to false', async () => {
    const b = await bench()
    await b.fiber.await()
    const face = b.entry()!.inject!(sid('s1'))
    b.setSelectReject(true)
    await expect(face.select({ provider: 'acme', model: 'acme-large' })).resolves.toBe(false)
  })

  it('reports an addressed subagent session unavailable and no-ops its verbs', async () => {
    const b = await bench({ addressed: true })
    await b.fiber.await()
    const face = b.entry()!.inject!(sid('s1'))
    expect(face.available).toBe(false)
    face.load()
    await expect(face.select({ provider: 'acme', model: 'acme-large' })).resolves.toBe(false)
    expect(b.loads).toEqual([])
    expect(b.selects).toEqual([])
  })

  it('drops the entry when the plugin fiber unloads (HMR safety)', async () => {
    const b = await bench()
    await b.fiber.await()
    expect(b.entry()).toBeDefined()
    await b.fiber.dispose()
    expect(b.entry()).toBeUndefined()
  })
})

describe('ui-thinking-strength node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
