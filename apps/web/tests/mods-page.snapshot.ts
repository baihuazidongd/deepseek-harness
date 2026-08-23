// @vitest-environment jsdom
// Assembled plugins-page snapshot: boots the real built workspace client
// bundles through AppWebEntry's ModuleLoader path against the keyless
// FixtureApiClient transport (no API key, no model round), opens the
// sidebar-foot 插件 page, and pins the entry rows, both filter chip groups,
// and one expanded detail block the fixture plugin inventory serves — then
// flips one switch through the fixture `pluginInventory/setEnabled` Remote
// and asserts the returned snapshot lands. The per-package suites bench over
// src; this is the assembled-output check that a dropped footer-action
// registration, a broken Remote mount, or a gateway-validation miss would
// fail.
//
// Keyless and deterministic: the fixture is the fake server, so the inventory
// entries and the write result are fixed in the fixture, not harvested from a
// live host.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { hasClass, installAssembledBootEnv, mountAssembledApp, REFRESHING_GOLDEN } from './assembled-boot.ts'

const EXPECTED = join(process.cwd(), 'apps/web/tests/snapshots/mods-page/ui.expected.md')

installAssembledBootEnv()

/** Normalize one managed entry row: loader entry id, short name, switch state. */
function rowText(row: Element): string {
  const name = [...row.querySelectorAll('*')].find(el => hasClass(el, 'rowName'))?.textContent?.trim() ?? ''
  const control = row.querySelector('[role="switch"]')
  return `${row.getAttribute('data-plugin-entry')}: ${name}=${control?.getAttribute('aria-checked')}`
}

/** Normalize the whole panel: count, both filter chip groups, rows, and the expanded detail. */
function panelShape(dialog: Element): string {
  const lines: string[] = []
  const count = dialog.querySelector('[data-plugin-count]')?.textContent?.trim()
  if (count !== undefined && count !== '') lines.push(`count=${count}`)
  for (const group of [...dialog.querySelectorAll('[role="group"]')]) {
    const label = group.getAttribute('aria-label') ?? ''
    for (const chip of [...group.querySelectorAll('[aria-pressed]')]) {
      lines.push(`chip[${label}]=${chip.textContent?.trim()} pressed=${chip.getAttribute('aria-pressed')}`)
    }
  }
  for (const row of [...dialog.querySelectorAll('[data-plugin-entry]')]) lines.push(rowText(row))
  const detail = dialog.querySelector('[data-open="true"] [class*=detailFields]')
  if (detail !== null) {
    for (const field of [...detail.children]) {
      const dt = field.querySelector('dt')?.textContent?.trim() ?? ''
      const dd = field.querySelector('dd')?.textContent?.trim() ?? ''
      lines.push(`detail.${dt}=${dd}`)
    }
  }
  const description = dialog.querySelector('[data-open="true"] [class*=detailDescription]')?.textContent?.trim()
  if (description !== undefined) lines.push(`detail.description=${description}`)
  return lines.join('\n')
}

describe('assembled plugins page', () => {
  it('opens the sidebar-foot 插件 page, pins one detail block, and flips a switch through the fixture Remote', async () => {
    mountAssembledApp()

    await screen.findByRole('tree', { name: 'Sessions' }, { timeout: 10_000 })
    fireEvent.click(await screen.findByRole('button', { name: 'Plugins' }, { timeout: 10_000 }))
    // The loading and ready panels are separate dialog nodes; query fresh,
    // never hold the loading element.
    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(5)
    }, { timeout: 10_000 })
    const dialog = screen.getByRole('dialog', { name: 'Plugin manager' })

    fireEvent.click(screen.getByRole('button', { name: 'lsp, Native plugins' }))
    await waitFor(() => {
      expect(dialog.querySelectorAll('[data-open="true"]')).toHaveLength(1)
    }, { timeout: 10_000 })

    const shape = panelShape(dialog)
    if (REFRESHING_GOLDEN) {
      mkdirSync(dirname(EXPECTED), { recursive: true })
      writeFileSync(EXPECTED, shape)
    }
    await expect(shape).toMatchFileSnapshot(EXPECTED)

    fireEvent.click(screen.getByRole('switch', { name: 'Enable lsp' }))
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Disable lsp' }).getAttribute('aria-checked')).toBe('true')
    }, { timeout: 10_000 })
  })
})
