// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModsFooterAction } from '../src/client/ModsFooterAction.tsx'
import type {
  ModsFooterActionProps,
  ModsInjected,
} from '../src/client/ModsFooterAction.tsx'
import { en, type ModsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<ModsInjected['list']>>
const t = ((key: ModsLocaleKey): string => en[key]) as ModsFooterActionProps['t']

function props(
  list: ModsInjected['list'],
  setEnabled: ModsInjected['setEnabled'] = vi.fn(),
  wide = true,
): ModsFooterActionProps {
  return { wide, t, list, setEnabled } as ModsFooterActionProps
}

const SNAPSHOT = {
  entries: [
    { entryId: '8a1b2c3d', moduleName: '@deepseek-ai/cordis-plugin-hmr', enabled: true, fiberPhase: 'active', source: 'native', description: 'Live reload for Cordis plugins.', version: '1.4.0' },
    { entryId: 'pending', moduleName: 'cordis:pending-name', enabled: true, fiberPhase: 'pending', source: 'native', description: null, version: null },
    { entryId: 'loading', moduleName: '@fixture/loading-name', enabled: true, fiberPhase: 'loading', source: 'library', description: 'A user-installed library.', version: '0.3.1' },
    { entryId: 'failed', moduleName: '@fixture/failed-name', enabled: true, fiberPhase: 'failed', source: 'library', description: null, version: '0.9.0' },
    { entryId: 'unobserved', moduleName: '@fixture/unobserved-name', enabled: true, fiberPhase: null, source: null, description: 'No layer context.', version: null },
    { entryId: 'disabled-entry', moduleName: '@deepseek-ai/dsh-host-directory-picker-native', enabled: false, fiberPhase: null, source: 'native', description: null, version: null },
  ],
} as unknown as Snapshot

describe('ModsFooterAction', () => {
  it('opens the panel from the wide trigger and renders the managed rows', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    const setEnabled = vi.fn<ModsInjected['setEnabled']>()
    render(<ModsFooterAction {...props(list, setEnabled)} />)
    expect(list).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(await screen.findByRole('dialog', { name: en.title })).toBeTruthy()
    expect(list).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByText(`${SNAPSHOT.entries.length} ${en.count}`)).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getAllByRole('switch')).toHaveLength(6)
    const active = screen.getByRole('switch', { name: 'Disable hmr' })
    expect(active.getAttribute('aria-checked')).toBe('true')
    const off = screen.getByRole('switch', { name: 'Enable directory-picker-native' })
    expect(off.getAttribute('aria-checked')).toBe('false')
    for (const value of ['Mounted', 'Waiting for dependencies', 'Loading', 'Mount failed', 'Not mounted']) {
      expect(screen.getByRole('img', { name: value })).toBeTruthy()
    }
    expect(screen.getByText('pending-name')).toBeTruthy()
  })

  it('closes through the close button, Escape, and the mask', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    render(<ModsFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })

    fireEvent.click(screen.getByRole('button', { name: en.close }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog', { name: en.title })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('renders the rail trigger without a visible label', () => {
    render(<ModsFooterAction {...props(async () => SNAPSHOT, vi.fn(), false)} />)
    const trigger = screen.getByRole('button', { name: en.trigger })
    expect(trigger.textContent).toBe('')
  })

  it('expands one row into its detail block and back', async () => {
    render(<ModsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })

    const hmr = screen.getByRole('button', { name: 'hmr, Native plugins, Mounted' })
    fireEvent.click(hmr)
    const detail = document.getElementById('plugin-detail-8a1b2c3d')!
    expect(detail.getAttribute('id')).toBeTruthy()
    expect(within(detail).getByText('Live reload for Cordis plugins.')).toBeTruthy()
    expect(within(detail).getByText('1.4.0')).toBeTruthy()
    expect(within(detail).getByText('@deepseek-ai/cordis-plugin-hmr')).toBeTruthy()
    expect(within(detail).getByText('8a1b2c3d')).toBeTruthy()
    expect(within(detail).getByText(en.sourceNative)).toBeTruthy()
    expect(hmr.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(hmr)
    expect(document.getElementById('plugin-detail-8a1b2c3d')).toBeNull()
    expect(hmr.getAttribute('aria-expanded')).toBe('false')

    // A row without layer context reads as unknown; a null description and
    // version render the unavailable dash.
    fireEvent.click(screen.getByRole('button', { name: `unobserved-name, ${en.sourceUnknown}, Not mounted` }))
    const unobserved = document.getElementById('plugin-detail-unobserved')!
    expect(within(unobserved).getByText(en.sourceUnknown)).toBeTruthy()
    expect(within(unobserved).getByText(en.unavailable)).toBeTruthy()
    expect(within(unobserved).getByText('No layer context.')).toBeTruthy()

    // A null description alone also renders the dash while the version shows.
    fireEvent.click(screen.getByRole('button', { name: `failed-name, ${en.sourceLibrary}, Mount failed` }))
    const failed = document.getElementById('plugin-detail-failed')!
    expect(within(failed).getByText(en.unavailable)).toBeTruthy()
    expect(within(failed).getByText('0.9.0')).toBeTruthy()
  })

  it('applies the setEnabled snapshot and surfaces a refused write', async () => {
    const toggled = {
      entries: SNAPSHOT.entries.map(entry =>
        entry.entryId === '8a1b2c3d' ? { ...entry, enabled: false } : entry),
    } as unknown as Snapshot
    const setEnabled = vi.fn(async () => toggled)
    render(<ModsFooterAction {...props(async () => SNAPSHOT, setEnabled)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })

    fireEvent.click(screen.getByRole('switch', { name: 'Disable hmr' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable hmr' }).getAttribute('aria-checked')).toBe('false')
    })
    expect(setEnabled).toHaveBeenCalledWith({ entryId: '8a1b2c3d', enabled: false })
    expect(screen.queryByRole('alert')).toBeNull()

    const refused = vi.fn<ModsInjected['setEnabled']>().mockRejectedValue(new Error('private transport detail'))
    cleanup()
    render(<ModsFooterAction {...props(async () => SNAPSHOT, refused)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('switch', { name: 'Disable hmr' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe(en.writeError)
    expect(screen.queryByText('private transport detail')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Disable hmr' }).getAttribute('aria-checked')).toBe('true')
  })

  it('disables every switch while one write is pending', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    render(<ModsFooterAction {...props(async () => SNAPSHOT, async () => deferred.promise)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })

    fireEvent.click(screen.getByRole('switch', { name: 'Disable hmr' }))
    expect(screen.getByText(en.pending)).toBeTruthy()
    for (const control of screen.getAllByRole('switch')) {
      expect((control as HTMLButtonElement).disabled).toBe(true)
    }
    await act(async () => { deferred.resolve(SNAPSHOT) })
    await waitFor(() => {
      for (const control of screen.getAllByRole('switch')) {
        expect((control as HTMLButtonElement).disabled).toBe(false)
      }
    })
  })

  it('filters rows by status and source chips and by search query', async () => {
    render(<ModsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    const statusGroup = screen.getByRole('group', { name: en.statusFilters })
    const sourceGroup = screen.getByRole('group', { name: en.sourceFilters })

    fireEvent.click(within(statusGroup).getByRole('button', { name: `${en.filterDisabled} 1` }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()

    fireEvent.click(within(statusGroup).getByRole('button', { name: `${en.filterEnabled} 5` }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)

    fireEvent.click(within(statusGroup).getByRole('button', { name: `${en.filterAll} 6` }))
    fireEvent.click(within(sourceGroup).getByRole('button', { name: `${en.sourceLibrary} 2` }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('loading-name')).toBeTruthy()
    expect(screen.getByText('failed-name')).toBeTruthy()

    fireEvent.click(within(sourceGroup).getByRole('button', { name: `${en.sourceNative} 3` }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    fireEvent.click(within(sourceGroup).getByRole('button', { name: `${en.sourceAll} 6` }))
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), {
      target: { value: 'unobserved' },
    })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)

    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), {
      target: { value: 'not-a-plugin' },
    })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('collapses an expanded row that the active filters remove', async () => {
    render(<ModsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('button', { name: 'hmr, Native plugins, Mounted' }))
    expect(document.getElementById('plugin-detail-8a1b2c3d')).toBeTruthy()

    // The status filter hides the row, so the detail cannot stay open on it.
    fireEvent.click(screen.getByRole('button', { name: `${en.filterDisabled} 1` }))
    expect(document.getElementById('plugin-detail-8a1b2c3d')).toBeNull()
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<ModsInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce({ entries: [] })
    render(<ModsFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('shows the loading line and ignores a result after unmount', async () => {
    const loading = render(<ModsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(screen.getByText(en.loading)).toBeTruthy()
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
    await screen.findByRole('dialog', { name: en.title })
    loading.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<ModsFooterAction {...props(() => deferred.promise)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const pendingFailure = render(<ModsFooterAction {...props(() => deferredFailure.promise)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    pendingFailure.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
