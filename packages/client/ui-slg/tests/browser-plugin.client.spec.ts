/**
 * apply wiring on a real cordis Context + SlotRegistry: SlgGameView registered
 * into the frame-declared `conversation` slot (single, session-maybe) at a
 * shadowing priority, with the conversation verbs resolved from the scoped
 * `conversation` service and the model face from `modelDirectories`, plus
 * fiber-teardown unregistration. Presentation behavior is covered props-direct
 * in slg-game-view.client.spec.tsx; no renderer machinery here.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlgGameView } from '../src/client/SlgGameView.tsx'
import { apply, inject } from '../src/client/index.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  // The conversation slot exists only while its declaring entry is live.
  slots.register(
    { name: 'root', children: { 'conversation': { kind: 'single', scope: 'session-maybe' } } } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  // No scoped conversation in this bench: send/stop must reject rather than throw.
  ctx.provide('sessions', {
    scope: () => undefined,
    binding: () => undefined,
    subagentAddress: () => undefined,
  })
  ctx.provide('modelDirectories', {
    directoryFor: vi.fn(() => { throw new Error('no scope in bench') }),
  })
  return { ctx, slots }
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'modelDirectories'])
  })

  it('registers the room into the conversation slot at a shadowing priority', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('conversation')[0]!
    expect(entry.component).toBe(SlgGameView)
    expect(entry.locale).toBe('slg')
    expect(entry.options.priority).toBe(-1)
    expect(entry.options.id).toBeUndefined()
  })

  it('injects verbs that reject without a scoped conversation, and degrades the model face', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('conversation')[0]!
    const face = entry.inject?.('s1' as never) as {
      send: (text: string) => Promise<void>
      stop: () => Promise<void>
      modelAvailable: boolean
      selectModel: (selection: unknown) => Promise<boolean>
    } | undefined
    expect(typeof face?.send).toBe('function')
    expect(typeof face?.stop).toBe('function')
    expect(face?.modelAvailable).toBe(false)
    await expect(face!.selectModel({ provider: 'deepseek', model: 'deepseek-v4-pro' })).resolves.toBe(false)
    await expect(face!.send('hi')).rejects.toThrow('conversation service unavailable')
    await expect(face!.stop()).rejects.toThrow('conversation service unavailable')
  })

  it('rejects send/stop when no session is current', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('conversation')[0]!
    const face = entry.inject?.(undefined as never) as {
      send: (text: string) => Promise<void>
      stop: () => Promise<void>
    } | undefined
    await expect(face!.send('hi')).rejects.toThrow('conversation service unavailable')
    await expect(face!.stop()).rejects.toThrow('conversation service unavailable')
  })

  it('forwards send/stop through a scoped conversation', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as SlotRegistry
    slots.register(
      { name: 'root', children: { 'conversation': { kind: 'single', scope: 'session-maybe' } } } as never,
      () => null,
    )
    ctx.provide('locale', new LocaleRuntime(ctx))
    const conversation = { send: vi.fn(() => Promise.resolve()), cancel: vi.fn(() => Promise.resolve()) }
    ctx.provide('sessions', {
      scope: () => ({ get: () => conversation }),
      binding: () => undefined,
      subagentAddress: () => undefined,
    })
    ctx.provide('modelDirectories', {
      directoryFor: vi.fn(() => { throw new Error('no scope in bench') }),
    })
    await ctx.plugin({ inject: [...inject], apply }).await()
    const entry = slots.entries('conversation')[0]!
    const face = entry.inject?.('s1' as never) as
      { send: (text: string) => Promise<void>; stop: () => Promise<void> } | undefined
    await face!.send('hi')
    await face!.stop()
    expect(conversation.send).toHaveBeenCalledWith('hi')
    expect(conversation.cancel).toHaveBeenCalledTimes(1)
  })

  it('teardown unregisters the slot entry', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(slots.entries('conversation')).toHaveLength(1)
    await fiber.dispose()
    expect(slots.entries('conversation')).toHaveLength(0)
  })
})
