// @vitest-environment jsdom
// ThinkingStrengthButton behavior: the composer tool-row chip opens the current
// model's reasoning-effort list and submits through the injected verbs, driven
// purely through props (the directory arrives as the bound `useDirectory` hook).
// Unavailable sessions and models without reasoning metadata render nothing.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { ThinkingStrengthButton } from '../src/client/ThinkingStrengthButton.tsx'
import { zh } from '../src/client/locales.ts'

type Props = Parameters<typeof ThinkingStrengthButton>[0]

const t = makeTranslate(zh, commonZh) as Props['t']

afterEach(cleanup)

function makeState(over: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'acme', model: 'acme-large', reasoningEffort: 'high' },
    routable: true,
    groups: [{
      id: 'acme',
      name: 'Acme',
      models: [{
        id: 'acme-large',
        name: 'Acme Large',
        reasoning: {
          efforts: [
            { id: 'off', name: 'Off' },
            { id: 'high', name: 'High' },
            { id: 'max', name: 'Max', description: 'Maximum reasoning' },
          ],
          defaultEffort: 'high',
        },
      }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...over,
  }
}

interface Bench {
  select: ReturnType<typeof vi.fn<Props['select']>>
  error: ReturnType<typeof vi.fn<Props['error']>>
  load: ReturnType<typeof vi.fn<Props['load']>>
  view: ReturnType<typeof render>
}

function bench(options: {
  available?: boolean
  state?: ModelDirectoryState
  select?: (selection: ModelSelection) => Promise<boolean>
  error?: () => string | null
} = {}): Bench {
  const state = options.state ?? makeState()
  const select = vi.fn<Props['select']>(options.select ?? (() => Promise.resolve(true)))
  const error = vi.fn<Props['error']>(options.error ?? (() => null))
  const load = vi.fn<Props['load']>(() => {})
  const useDirectory: SnapshotSelectorHook<ModelDirectoryState> = sel => sel(state)
  const props = {
    available: options.available ?? true,
    load,
    select,
    error,
    useDirectory,
    t,
  } as Props
  const view = render(<ThinkingStrengthButton {...props} />)
  return { select, error, load, view }
}

describe('ThinkingStrengthButton', () => {
  it('renders nothing when the session cannot select a model', () => {
    const b = bench({ available: false })
    expect(b.view.container.firstChild).toBeNull()
  })

  it('renders the button for a model without reasoning metadata, opening to no levels', () => {
    const state = makeState({
      current: { provider: 'acme', model: 'plain' },
      groups: [{ id: 'acme', name: 'Acme', models: [{ id: 'plain', name: 'Plain' }] }],
    })
    bench({ state })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 默认' }))
    expect(screen.getByText('当前模型未提供思考强度。')).toBeTruthy()
  })

  it('renders nothing before the first load resolves a model', () => {
    const b = bench({ state: makeState({ current: null, groups: [] }) })
    expect(b.view.container.firstChild).toBeNull()
  })

  it('renders the button when the current route is no longer in the catalog, opening to no levels', () => {
    bench({ state: makeState({ current: { provider: 'acme', model: 'gone' } }) })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 默认' }))
    expect(screen.getByText('当前模型未提供思考强度。')).toBeTruthy()
  })

  it('loads on mount and shows the current effort on the trigger', () => {
    const b = bench()
    expect(b.load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '选择思考强度，当前 High' })).toBeTruthy()
  })

  it('shows the provider default label when no effort is selected and none is the default', () => {
    const state = makeState({
      current: { provider: 'acme', model: 'acme-large' },
    })
    delete state.groups[0]!.models[0]!.reasoning!.defaultEffort
    bench({ state })
    expect(screen.getByRole('button', { name: '选择思考强度，当前 默认' })).toBeTruthy()
  })

  it('opens the effort menu and marks the current level checked', () => {
    bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    expect(screen.getByRole('menu', { name: '思考强度' })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: 'High' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: 'Max' }).getAttribute('aria-checked')).toBe('false')
  })

  it('lists the level description when the adapter supplies one', () => {
    bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    expect(screen.getByText('Maximum reasoning')).toBeTruthy()
  })

  it('selecting a different level submits the complete selection and closes on success', async () => {
    const b = bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))
    expect(b.select).toHaveBeenCalledWith({ provider: 'acme', model: 'acme-large', reasoningEffort: 'max' })
    await waitFor(() => { expect(screen.queryByRole('menu')).toBeNull() })
  })

  it('selecting the current level closes without submitting', () => {
    const b = bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'High' }))
    expect(b.select).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('submits the provider default by omitting the effort', async () => {
    const state = makeState({ current: { provider: 'acme', model: 'acme-large', reasoningEffort: 'max' } })
    delete state.groups[0]!.models[0]!.reasoning!.defaultEffort
    const b = bench({ state })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 Max' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '默认' }))
    expect(b.select).toHaveBeenCalledWith({ provider: 'acme', model: 'acme-large' })
  })

  it('announces a rejected selection with the directory error', async () => {
    bench({
      select: () => Promise.resolve(false),
      error: () => 'model-unavailable: adapter gone',
    })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('思考强度操作失败：model-unavailable: adapter gone')).toBeTruthy()
  })

  it('announces a rejected selection generically when the directory carries no error', async () => {
    bench({ select: () => Promise.resolve(false), error: () => null })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))
    expect(await screen.findByText('无法更新思考强度。')).toBeTruthy()
  })

  it('clears the toast once the banner times out', async () => {
    vi.useFakeTimers()
    try {
      bench({ select: () => Promise.resolve(false), error: () => null })
      fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Max' }))
      await act(async () => { await Promise.resolve() })
      expect(screen.getByRole('alert')).toBeTruthy()
      act(() => { vi.advanceTimersByTime(4000) })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('refreshes the directory on every open', () => {
    const b = bench()
    const trigger = screen.getByRole('button', { name: '选择思考强度，当前 High' })
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    fireEvent.click(trigger)
    expect(b.load).toHaveBeenCalledTimes(3) // mount + two opens (the middle click closes)
  })

  it('Escape closes the menu and restores focus to the trigger', async () => {
    bench()
    const trigger = screen.getByRole('button', { name: '选择思考强度，当前 High' })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: '思考强度' })
    fireEvent.keyDown(menu.parentElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    await waitFor(() => { expect(document.activeElement).toBe(trigger) })
  })

  it('a non-Escape key leaves the menu open', () => {
    bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    const root = screen.getByRole('menu', { name: '思考强度' }).parentElement!
    fireEvent.keyDown(root, { key: 'Enter' })
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('a mousedown outside the menu closes it', () => {
    bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a mousedown inside the menu keeps it open', () => {
    bench()
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    fireEvent.mouseDown(screen.getByRole('menuitemradio', { name: 'Max' }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('focus leaving the root closes the menu, focus moving inside keeps it', () => {
    bench()
    const trigger = screen.getByRole('button', { name: '选择思考强度，当前 High' })
    fireEvent.click(trigger)
    const root = screen.getByRole('menu', { name: '思考强度' }).parentElement!

    fireEvent.focusOut(root, { relatedTarget: trigger })
    expect(screen.getByRole('menu')).toBeTruthy()

    fireEvent.focusOut(root, { relatedTarget: document.body })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('disables the level rows while a selection is in flight', () => {
    bench({ state: makeState({ status: 'selecting' }) })
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 High' }))
    expect(screen.getByRole('menuitemradio', { name: 'Max' })).toHaveProperty('disabled', true)
  })

  it('shows the empty notice when a reasoning model advertises no levels', () => {
    const state = makeState()
    state.groups[0]!.models[0]!.reasoning!.efforts = []
    bench({ state })
    // With no levels the trigger falls back to the raw adapter id.
    fireEvent.click(screen.getByRole('button', { name: '选择思考强度，当前 high' }))
    expect(screen.getByText('当前模型未提供思考强度。')).toBeTruthy()
  })
})
