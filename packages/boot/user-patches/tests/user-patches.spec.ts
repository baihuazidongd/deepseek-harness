import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { provideUserPatchPaths, upsertUserPatchRow } from '../src/index.ts'

const contexts: Context[] = []
const dirs: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** A fresh temp working directory removed after the test. */
async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'user-patches-'))
  dirs.push(dir)
  return dir
}

describe('provideUserPatchPaths', () => {
  it('provides a frozen snapshot readable as ctx.userPatchPaths', () => {
    const ctx = new Context()
    contexts.push(ctx)
    provideUserPatchPaths(ctx, { profilePatchPath: 'a.yml', homePatchPath: 'b.yml' })
    expect(ctx.userPatchPaths).toEqual({ profilePatchPath: 'a.yml', homePatchPath: 'b.yml' })
    expect(Object.isFrozen(ctx.userPatchPaths)).toBe(true)
  })

  it('rejects an empty profile or home path loudly', () => {
    const ctx = new Context()
    contexts.push(ctx)
    expect(() => { provideUserPatchPaths(ctx, { profilePatchPath: '', homePatchPath: 'b.yml' }) })
      .toThrow('profilePatchPath must be a non-empty absolute path')
    expect(() => { provideUserPatchPaths(ctx, { profilePatchPath: 'a.yml', homePatchPath: '' }) })
      .toThrow('homePatchPath must be a non-empty absolute path')
    expect(ctx.userPatchPaths).toBeUndefined()
  })
})

describe('upsertUserPatchRow', () => {
  it('creates the layer file when it does not exist', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await upsertUserPatchRow('dsh', file, { id: 'webserver', disabled: true })
    await expect(readFile(file, 'utf8')).resolves.toContain('id: webserver')
    await expect(readFile(file, 'utf8')).resolves.toContain('disabled: true')
  })

  it('appends a row to an existing empty layer', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, '[]\n')
    await upsertUserPatchRow('dsh', file, { id: 'lsp', disabled: true })
    const content = await readFile(file, 'utf8')
    expect(content).toContain('id: lsp')
    expect(content).toContain('disabled: true')
  })

  it('replaces only the targeted row disabled field and preserves other rows', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, [
      '- id: keep',
      '  config:',
      '    k: 1',
      '- id: target',
      '  disabled: true',
      '  config:',
      '    other: preserved',
      '',
    ].join('\n'))
    await upsertUserPatchRow('dsh', file, { id: 'target', disabled: false })
    const content = await readFile(file, 'utf8')
    expect(content).toContain('id: keep')
    expect(content).toContain('k: 1')
    expect(content).toContain('other: preserved')
    expect(content).toContain('disabled: false')
    expect(content).not.toContain('disabled: true')
  })

  it('round-trips an untouched row with a !!js config expression', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, [
      '- id: keep',
      '  config:',
      '    port: !!js ctx.webStartup.port ?? 3080',
      '',
    ].join('\n'))
    await upsertUserPatchRow('dsh', file, { id: 'other', disabled: true })
    const content = await readFile(file, 'utf8')
    expect(content).toContain('ctx.webStartup.port ?? 3080')
    expect(content).toContain('!!js')
  })

  it('fails loud on an unparsable layer', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, 'nope: [\n')
    await expect(upsertUserPatchRow('dsh', file, { id: 'x', disabled: true }))
      .rejects.toThrow('failed to parse patches')
  })

  it('fails loud on a non-array layer', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, 'id: x\n')
    await expect(upsertUserPatchRow('dsh', file, { id: 'x', disabled: true }))
      .rejects.toThrow('must be a top-level YAML array')
  })

  it('fails loud on a non-mapping row', async () => {
    const file = join(await workdir(), 'cordis.patch.yml')
    await writeFile(file, '- 3\n')
    await expect(upsertUserPatchRow('dsh', file, { id: 'x', disabled: true }))
      .rejects.toThrow('must be a mapping')
  })

  it('fails loud when the path cannot be read as a file', async () => {
    const dir = await workdir()
    const nested = join(dir, 'nested')
    await mkdir(nested)
    await expect(upsertUserPatchRow('dsh', nested, { id: 'x', disabled: true }))
      .rejects.toThrow('failed to read patches')
  })
})
