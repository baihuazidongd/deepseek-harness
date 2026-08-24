import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import SkillInventoryGateway from '../src/index.ts'

/** Writable in-memory settings provider for the skill-inventory lifecycle specs. */
class MemorySettings extends SettingsProvider {
  readonly doc: Record<string, unknown> = {}
  readonly writable = true

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[String(ns)] = structuredClone(section)
    return Promise.resolve()
  }
}

const CANDIDATE: SkillCandidate = {
  name: 'conventional-commits',
  description: 'Write Conventional Commits messages.',
  invocation: { modelInvocable: true, userInvocable: true },
  provider: 'test',
  source: 'bundled',
  rank: 600,
  locator: 'conventional-commits',
}

const provider: SkillProvider = {
  name: 'test',
  list: () => Promise.resolve([CANDIDATE]),
  async get(): Promise<SkillDefinition> {
    return { ...CANDIDATE, content: '# Conventional Commits\n\nWrite good commits.\n' }
  },
}

async function mounted(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => provider)
  await ctx.plugin(MemorySettings)
  await ctx.plugin(SkillInventoryGateway)
  return ctx
}

describe('dsh-host-skill-inventory', () => {
  it('projects skills with their enablement from the disable set', async () => {
    const ctx = await mounted()
    const inventory = ctx.skillInventory
    const snapshot = await inventory.list()
    expect(snapshot.entries).toEqual([{
      name: 'conventional-commits',
      description: 'Write Conventional Commits messages.',
      provider: 'test',
      source: 'bundled',
      invocation: { modelInvocable: true, userInvocable: true },
      enabled: true,
    }])
  })

  it('persists a per-skill disable and re-enable', async () => {
    const ctx = await mounted()
    const inventory = ctx.skillInventory

    const disabled = await inventory.setEnabled({ name: 'conventional-commits', enabled: false })
    expect(disabled.entries[0]?.enabled).toBe(false)
    expect(inventory.isDisabled('conventional-commits')).toBe(true)

    const reEnabled = await inventory.setEnabled({ name: 'conventional-commits', enabled: true })
    expect(reEnabled.entries[0]?.enabled).toBe(true)
    expect(inventory.isDisabled('conventional-commits')).toBe(false)
  })

  it('loads one skill body and marks an unknown name undefined', async () => {
    const ctx = await mounted()
    const inventory = ctx.skillInventory

    const detail = await inventory.get({ name: 'conventional-commits' })
    expect(detail?.content).toContain('# Conventional Commits')
    expect(detail?.enabled).toBe(true)

    expect(await inventory.get({ name: 'no-such-skill' })).toBeUndefined()
  })
})
