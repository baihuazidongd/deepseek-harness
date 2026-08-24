// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillsFooterAction } from '../src/client/SkillsFooterAction.tsx'
import type { SkillsFooterActionProps, SkillsInjected } from '../src/client/SkillsFooterAction.tsx'
import { en, type SkillsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<SkillsInjected['list']>>
const t = ((key: SkillsLocaleKey): string => en[key]) as SkillsFooterActionProps['t']

function props(list: SkillsInjected['list'], setEnabled: SkillsInjected['setEnabled'] = vi.fn(), get: SkillsInjected['get'] = async () => undefined): SkillsFooterActionProps {
  return { wide: true, t, list, setEnabled, get } as SkillsFooterActionProps
}

const SNAPSHOT = {
  entries: [
    { name: 'conventional-commits', description: 'Write Conventional Commits.', provider: 'test', source: 'bundled', invocation: { modelInvocable: true, userInvocable: true }, enabled: true },
    { name: 'code-review', description: 'Review a diff.', provider: 'filesystem', source: 'project-dsh', invocation: { modelInvocable: true, userInvocable: true }, enabled: false },
  ],
} as unknown as Snapshot

describe('SkillsFooterAction', () => {
  it('opens the panel and renders the managed skills', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    render(<SkillsFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(await screen.findByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'Disable conventional-commits' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Enable code-review' }).getAttribute('aria-checked')).toBe('false')
  })

  it('expands a row and loads its instruction body', async () => {
    const get = vi.fn(async () => ({
      name: 'conventional-commits', description: 'Write Conventional Commits.', provider: 'test', source: 'bundled',
      invocation: { modelInvocable: true, userInvocable: true }, content: '# Conventional Commits\n\nWrite good commits.\n', enabled: true,
    }))
    render(<SkillsFooterAction {...props(async () => SNAPSHOT, vi.fn(), get)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    const row = screen.getByRole('button', { name: 'conventional-commits, bundled' })
    fireEvent.click(row)
    const detail = document.getElementById('skill-detail-conventional-commits')!
    expect(within(detail).getByText('test')).toBeTruthy()
    await waitFor(() => { expect(within(detail).getByText(/# Conventional Commits/)).toBeTruthy() })
    expect(get).toHaveBeenCalledWith({ name: 'conventional-commits' })
  })

  it('applies the setEnabled snapshot and surfaces a refused write', async () => {
    const toggled = {
      entries: SNAPSHOT.entries.map(entry =>
        entry.name === 'conventional-commits' ? { ...entry, enabled: false } : entry),
    } as unknown as Snapshot
    const setEnabled = vi.fn(async () => toggled)
    render(<SkillsFooterAction {...props(async () => SNAPSHOT, setEnabled)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('switch', { name: 'Disable conventional-commits' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable conventional-commits' }).getAttribute('aria-checked')).toBe('false')
    })
    expect(setEnabled).toHaveBeenCalledWith({ name: 'conventional-commits', enabled: false })

    cleanup()
    render(<SkillsFooterAction {...props(async () => SNAPSHOT, vi.fn().mockRejectedValue(new Error('x')))} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('switch', { name: 'Disable conventional-commits' }))
    expect((await screen.findByRole('alert')).textContent).toBe(en.writeError)
  })

  it('filters by search query', async () => {
    render(<SkillsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), { target: { value: 'code-review' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), { target: { value: 'nope' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('closes through the close button and Escape', async () => {
    render(<SkillsFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('button', { name: en.close }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<SkillsInjected['list']>()
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValueOnce({ entries: [] })
    render(<SkillsFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
