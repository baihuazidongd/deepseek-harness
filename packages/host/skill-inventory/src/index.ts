/**
 * Remote projection of the discoverable skills, with per-skill enablement
 * persisted into a user settings namespace. The disable set this gateway owns
 * is the single source of truth other host consumers read through
 * {@link SkillInventoryGateway.isDisabled}; the model-facing catalog and
 * loader honor it so a disabled skill leaves both the management surface and
 * the model's available-skills list.
 * @module @deepseek-ai/dsh-host-skill-inventory
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SkillDefinition, SkillSummary } from '@deepseek-ai/dsh-skill'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {
  SkillInventoryDetail,
  SkillInventoryEntry,
  SkillInventorySetEnabledRequest,
  SkillInventorySnapshot,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    skillInventory: SkillInventoryGateway
  }
}

/** Settings namespace owning the user-disabled skill names. */
export const SKILL_ENABLEMENT_NAMESPACE = settingsNamespace('skill-enablement')

interface SkillEnablement {
  disabled: string[]
}
const SkillEnablement: z<SkillEnablement> = z.object({
  disabled: z.array(z.string()).default([]),
})

/** Project one registry summary to the wire entry, overlaying the disable set. */
function toEntry(skill: SkillSummary, disabled: ReadonlySet<string>): SkillInventoryEntry {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    provider: skill.provider,
    source: skill.source,
    invocation: { modelInvocable: skill.invocation.modelInvocable, userInvocable: skill.invocation.userInvocable },
    enabled: !disabled.has(skill.name),
  }
}

/** Project one loaded definition to the wire detail, overlaying the disable set. */
function toDetail(skill: SkillDefinition, disabled: boolean): SkillInventoryDetail {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
    provider: skill.provider,
    source: skill.source,
    invocation: { modelInvocable: skill.invocation.modelInvocable, userInvocable: skill.invocation.userInvocable },
    content: skill.content,
    enabled: !disabled,
  }
}

/** Remote-only service exposing discoverable skills and their per-skill enablement. */
export class SkillInventoryGateway extends TypertRemoteService {
  static inject = ['skills', 'settings']

  private readonly enablement: SettingsScope<SkillEnablement>

  constructor(ctx: Context) {
    super(ctx, 'skillInventory')
    this.enablement = ctx.settings.register(SKILL_ENABLEMENT_NAMESPACE, SkillEnablement)
  }

  /** Whether one skill name sits in the user-disabled set. */
  isDisabled(name: string): boolean {
    return this.enablement.get().disabled.includes(name)
  }

  /**
   * Read the current skill catalog with the disable set folded into each entry.
   * @returns every discoverable skill, enabled unless the user disabled it.
   */
  @Remote('list')
  async list(): Promise<SkillInventorySnapshot> {
    const disabled = new Set(this.enablement.get().disabled)
    const skills = await this.ctx.skills.list()
    return { entries: skills.map(skill => toEntry(skill, disabled)) }
  }

  /**
   * Load one skill's full body for the detail surface.
   * @param request - the skill name.
   * @returns the loaded detail, or undefined when the name is unknown.
   */
  @Remote('get')
  async get(request: { name: string }): Promise<SkillInventoryDetail | undefined> {
    const skill = await this.ctx.skills.get(request.name)
    if (skill === undefined) return undefined
    return toDetail(skill, this.isDisabled(skill.name))
  }

  /**
   * Persist one skill's enablement into the `skill-enablement` settings
   * namespace and return the refreshed snapshot. The write replaces the
   * disabled-name array, so a later schema default can never silently reclaim
   * a disabled skill.
   * @param request - the skill name and desired enablement.
   * @returns the refreshed inventory snapshot.
   */
  @Remote('setEnabled')
  async setEnabled(request: SkillInventorySetEnabledRequest): Promise<SkillInventorySnapshot> {
    const disabled = new Set(this.enablement.get().disabled)
    if (request.enabled) disabled.delete(request.name)
    else disabled.add(request.name)
    await this.enablement.replace({ disabled: [...disabled] })
    return this.list()
  }
}

export default SkillInventoryGateway
