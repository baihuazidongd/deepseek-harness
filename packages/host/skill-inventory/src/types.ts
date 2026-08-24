/** One skill's model/user invocation policy. */
export interface SkillInvocation {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** Where a skill's source lives (filesystem root or a bundled/runtime provider). */
export type SkillSource = string

/** One discoverable skill projected to trusted clients, with its enablement. */
export interface SkillInventoryEntry {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly provider: string
  readonly source: SkillSource
  readonly invocation: SkillInvocation
  /** False when the user has disabled this skill in the management surface. */
  readonly enabled: boolean
}

/** Point-in-time skill inventory returned by the skill inventory Remote. */
export interface SkillInventorySnapshot {
  readonly entries: readonly SkillInventoryEntry[]
}

/** One per-skill enablement write. */
export interface SkillInventorySetEnabledRequest {
  /** The kebab-case skill name. */
  readonly name: string
  /** The desired enablement. */
  readonly enabled: boolean
}

/** One skill's full detail, including its loaded body. */
export interface SkillInventoryDetail {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly provider: string
  readonly source: SkillSource
  readonly invocation: SkillInvocation
  readonly content: string
  readonly enabled: boolean
}
