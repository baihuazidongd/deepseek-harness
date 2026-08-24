import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillConventionalCommits from '@deepseek-ai/dsh-skill-conventional-commits'

describe('dsh-skill-conventional-commits', () => {
  it('registers and disposes the bundled conventional-commits skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(SkillConventionalCommits)
    const resourcePath = fileURLToPath(new URL('../assets/', import.meta.url))

    expect(await ctx.skills.list()).toEqual([{
      name: 'conventional-commits',
      description: 'Write git commit messages and pull-request titles that follow the Conventional Commits specification. Use whenever composing or reviewing a commit message or PR title.',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'conventional-commits',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resourcePath },
    }])
    const loaded = await ctx.skills.get('conventional-commits')
    expect(loaded?.content).toContain('# Conventional Commits')
    expect(loaded?.content).toContain('<type>(<scope>): <subject>')
    expect(loaded?.resourceBase).toEqual({ kind: 'directory', path: resourcePath })

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })
})
