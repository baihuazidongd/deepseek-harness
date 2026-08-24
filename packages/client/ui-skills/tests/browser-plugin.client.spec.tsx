// @vitest-environment jsdom
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, NS } from '../src/client/index.ts'
import { SkillsFooterAction } from '../src/client/SkillsFooterAction.tsx'
import type { SkillsInjected } from '../src/client/SkillsFooterAction.tsx'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const EMPTY = { entries: [] }
type ListResult =
  | { readonly ok: true; readonly value: typeof EMPTY }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const list = vi.fn<() => Promise<ListResult>>().mockResolvedValue({ ok: true, value: EMPTY })
  const setEnabled = vi.fn().mockResolvedValue({ ok: true, value: EMPTY })
  const get = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  ctx.provide('remote.skillInventory', { list, setEnabled, get })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, list, setEnabled }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-skills browser plugin', () => {
  it('declares only the services used by the footer-action contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.skillInventory'])
  })

  it('registers a localized footer action without reading the Remote eagerly', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('sidebar.footer.action')[0]!
    expect(entry.component).toBe(SkillsFooterAction)
    expect(entry.options).toMatchObject({ id: 'skills', order: 1 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('技能')
    expect(b.list).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => SkillsInjected)()
    await expect(injected.list()).resolves.toEqual(EMPTY)
    expect(b.list).toHaveBeenCalledOnce()
    b.list.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } })
    await expect(injected.list()).rejects.toThrow('skillInventory.list failed: REMOTE_ERROR: unavailable')
    await b.ctx.fiber.dispose()
  })
})
