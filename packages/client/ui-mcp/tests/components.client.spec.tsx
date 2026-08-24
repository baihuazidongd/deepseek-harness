// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpFooterAction } from '../src/client/McpFooterAction.tsx'
import type { McpFooterActionProps, McpInjected } from '../src/client/McpFooterAction.tsx'
import { en, type McpLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<McpInjected['list']>>
const t = ((key: McpLocaleKey): string => en[key]) as McpFooterActionProps['t']

function props(list: McpInjected['list'], setEnabled: McpInjected['setEnabled'] = vi.fn()): McpFooterActionProps {
  return { wide: true, t, list, setEnabled } as McpFooterActionProps
}

const SNAPSHOT = {
  servers: [
    {
      name: 'everything', entryId: 'include:mcp-everything', transport: 'stdio', enabled: true,
      tools: [
        { name: 'mcp__everything__echo', description: 'Echoes text.' },
        { name: 'mcp__everything__add', description: 'Adds two numbers.' },
      ],
    },
    { name: 'empty', entryId: 'include:mcp-empty', transport: 'streamable-http', enabled: false, tools: [] },
  ],
} as unknown as Snapshot

describe('McpFooterAction', () => {
  it('opens the panel and renders the managed servers', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    render(<McpFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect(await screen.findByRole('dialog', { name: en.title })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'Disable everything' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Enable empty' }).getAttribute('aria-checked')).toBe('false')
  })

  it('expands a server and lists its tools', async () => {
    render(<McpFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('button', { name: 'everything, stdio' }))
    const detail = document.getElementById('mcp-detail-everything')!
    expect(within(detail).getByText('stdio')).toBeTruthy()
    expect(within(detail).getByText('mcp__everything__echo')).toBeTruthy()
    expect(within(detail).getByText('Echoes text.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'empty, streamable-http' }))
    expect(within(document.getElementById('mcp-detail-empty')!).getByText(en.noTools)).toBeTruthy()
  })

  it('applies the setEnabled snapshot and surfaces a refused write', async () => {
    const toggled = {
      servers: SNAPSHOT.servers.map(server =>
        server.name === 'everything' ? { ...server, enabled: false } : server),
    } as unknown as Snapshot
    const setEnabled = vi.fn(async () => toggled)
    render(<McpFooterAction {...props(async () => SNAPSHOT, setEnabled)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('switch', { name: 'Disable everything' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Enable everything' }).getAttribute('aria-checked')).toBe('false')
    })
    expect(setEnabled).toHaveBeenCalledWith({ name: 'everything', enabled: false })

    cleanup()
    render(<McpFooterAction {...props(async () => SNAPSHOT, vi.fn().mockRejectedValue(new Error('x')))} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.click(screen.getByRole('switch', { name: 'Disable everything' }))
    expect((await screen.findByRole('alert')).textContent).toBe(en.writeError)
  })

  it('filters by search query and closes through Escape', async () => {
    render(<McpFooterAction {...props(async () => SNAPSHOT)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    await screen.findByRole('dialog', { name: en.title })
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), { target: { value: 'empty' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<McpInjected['list']>()
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValueOnce({ servers: [] })
    render(<McpFooterAction {...props(list)} />)
    fireEvent.click(screen.getByRole('button', { name: en.trigger }))
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })
})
