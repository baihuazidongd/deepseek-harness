/** Archive section registration: slot declaration injection and the locale-following label thunk. */
// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry, createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { ArchiveSection } from '../src/client/ArchiveSection.tsx'

// The service reads its initial locale from the browser; these specs assert
// the shipped Chinese copy, so they state the browser they assume.
usePinnedBrowserLanguages('zh-CN')

function emptySessions(): SessionListState {
  return {
    ids: [], byId: {}, current: undefined, phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }
}

function emptyWorkspaces(): WorkspaceListState {
  return {
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready',
    error: null, baselinesReady: true, recentWorkspaceId: undefined,
  }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  ctx.provide('sessions', { list: createSnapshotStore(emptySessions()), open: () => {} })
  ctx.provide('workspaces', {
    list: createSnapshotStore(emptyWorkspaces()),
    unarchiveSession: () => Promise.resolve(),
  })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

describe('ui-session-archive apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'workspaces'])
  })

  it('registers the recovery nav entry for declarations before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = before.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(ArchiveSection)
    expect(entry.options).toMatchObject({ id: 'session-archive', order: 30 })
    expect(resolveSlotLabel(entry.options.label)).toBe('归档会话')
    const injected = (entry.inject as unknown as () => import('../src/client/ArchiveSection.tsx').ArchiveSectionInjected)()
    expect(typeof injected.useSessions).toBe('function')
    expect(typeof injected.useWorkspaces).toBe('function')
    expect(typeof injected.unarchive).toBe('function')
    expect(typeof injected.open).toBe('function')

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    expect(after.slots.entries('settings.section')).toHaveLength(0)
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('settings.section')[0]!.component).toBe(ArchiveSection)
    expect(after.slots.entries('settings.section')).toHaveLength(1)
  })

  it('the label thunk follows the active locale without re-registration', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Archived sessions')
    b.locale.setLocale('zh')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('归档会话')
  })

  it('locale change while the slot is undeclared stays a no-op', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.locale.setLocale('en')
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    b.locale.setLocale('zh')
  })

  it('re-registers after an HMR collapse re-declares the slot (stale disposer must not block)', async () => {
    const b = await bench()
    const redeclare = declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)
    redeclare()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('settings.section')[0]!.component).toBe(ArchiveSection)
    expect(b.slots.entries('settings.section')).toHaveLength(1)
  })

  it('registers the zh/en nav dictionaries and disposes everything with the fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.locale.bind('settings.sessionArchive')('nav')).toBe('归档会话')
    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    // The (ns, locale) seats are free again — the dictionary disposers ran.
    expect(() => b.locale.register('settings.sessionArchive', 'zh', {})).not.toThrow()
    expect(() => b.locale.register('settings.sessionArchive', 'en', {})).not.toThrow()
  })
})
