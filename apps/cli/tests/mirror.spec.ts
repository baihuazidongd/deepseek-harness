import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChildProcess } from 'node:child_process'
import {
  internals,
  listMirrors,
  MIRROR_STATE_FILENAME,
  runMirrorCreate,
  runMirrorDiscard,
  runMirrorLaunch,
  runMirrorList,
  runMirrorStatus,
  runMirrorStop,
} from '../src/mirror.ts'

const dirs: string[] = []
const lines: { out: string[]; err: string[] } = { out: [], err: [] }

beforeEach(() => {
  lines.out = []
  lines.err = []
  internals.stdout = { write: (chunk: string) => { lines.out.push(chunk) } }
  internals.stderr = { write: (chunk: string) => { lines.err.push(chunk) } }
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
  delete process.env.DSH_HOME
})

/** A temp DSH_HOME with one dependency-free source profile. */
async function home(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'dsh-mirror-'))
  dirs.push(base)
  const profiles = join(base, 'profiles')
  await mkdir(join(profiles, 'web'), { recursive: true })
  await writeFile(join(profiles, 'web', 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    'dsh.profile.bundles': ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  }))
  await writeFile(join(profiles, 'web', 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\n')
  await writeFile(join(profiles, 'web', 'cordis.patch.yml'), '[]\n')
  process.env.DSH_HOME = base
  return base
}

/** The current DSH_HOME's profiles root. */
const profilesRoot = (): string => join(process.env.DSH_HOME!, 'profiles')

/** Read one mirror's state record as JSON. */
function stateOf(mirror: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(profilesRoot(), mirror, MIRROR_STATE_FILENAME), 'utf8')) as Record<string, unknown>
}

/** Overwrite one mirror's state record. */
async function record(mirror: string, state: Record<string, unknown>): Promise<void> {
  await writeFile(join(profilesRoot(), mirror, MIRROR_STATE_FILENAME), JSON.stringify(state))
}

/** A fake ChildProcess carrying a chosen pid and an inspectable unref mock. */
function fakeChild(pid: number, exitCode: number | null = null): { child: ChildProcess; unref: ReturnType<typeof vi.fn> } {
  const unref = vi.fn()
  return { child: { pid, exitCode, killed: false, unref } as unknown as ChildProcess, unref }
}

describe('dsh mirror create', () => {
  it('copies the composition files and writes the state record', async () => {
    const base = await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    const mirrorDir = join(base, 'profiles', 'web-mirror')
    expect(existsSync(join(mirrorDir, 'package.json'))).toBe(true)
    expect(existsSync(join(mirrorDir, 'pnpm-workspace.yaml'))).toBe(true)
    expect(existsSync(join(mirrorDir, 'cordis.patch.yml'))).toBe(true)
    expect(existsSync(join(mirrorDir, 'node_modules'))).toBe(false)
    expect(stateOf('web-mirror')).toMatchObject({ source: 'web' })
    expect(lines.out.join('')).toContain('created from web')
  })

  it('relies on pnpm install in the mirror directory when dependencies exist', async () => {
    await home()
    await writeFile(join(profilesRoot(), 'web', 'package.json'), JSON.stringify({ dependencies: { x: '1' } }))
    const calls: Array<[string, readonly string[], string]> = []
    internals.spawnSync = ((command: string, args: readonly string[], options: { cwd: string }) => {
      calls.push([command, args, options.cwd])
      return { status: 0 }
    }) as never
    expect(runMirrorCreate('m', 'web')).toBe(0)
    expect(calls).toEqual([['pnpm', ['install'], join(profilesRoot(), 'm')]])
  })

  it('skips the relink for a manifest without a dependencies key', async () => {
    await home()
    await writeFile(join(profilesRoot(), 'web', 'package.json'), JSON.stringify({ name: 'dsh-profile-web' }))
    const calls: unknown[][] = []
    internals.spawnSync = ((command: string, args: readonly string[]) => {
      calls.push([command, args])
      return { status: 0 }
    }) as never
    expect(runMirrorCreate('m', 'web')).toBe(0)
    expect(calls).toEqual([])
  })

  it('treats a null or nonzero relink status as failure without writing the record', async () => {
    await home()
    await writeFile(join(profilesRoot(), 'web', 'package.json'), JSON.stringify({ dependencies: { x: '1' } }))
    internals.spawnSync = (() => ({ status: null })) as never
    expect(runMirrorCreate('m', 'web')).toBe(1)
    internals.spawnSync = (() => ({ status: 2 })) as never
    expect(runMirrorCreate('m2', 'web')).toBe(2)
    expect(existsSync(join(profilesRoot(), 'm', MIRROR_STATE_FILENAME))).toBe(false)
    expect(lines.err.join('')).toContain('pnpm install failed')
  })

  it('refuses a self-copy, a missing source, and an existing target', async () => {
    await home()
    expect(runMirrorCreate('web', 'web')).toBe(1)
    expect(lines.err.join('')).toContain('cannot copy itself')
    expect(runMirrorCreate('m', 'nope')).toBe(1)
    expect(lines.err.join('')).toContain('has no manifest')
    await mkdir(join(profilesRoot(), 'taken'), { recursive: true })
    await writeFile(join(profilesRoot(), 'taken', 'package.json'), '{}')
    expect(runMirrorCreate('taken', 'web')).toBe(1)
    expect(lines.err.join('')).toContain('already exists')
  })

  it('fails loud on a corrupt mirror state record', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    const file = join(profilesRoot(), 'web-mirror', MIRROR_STATE_FILENAME)
    await writeFile(file, '[1]')
    expect(() => runMirrorStatus('web-mirror')).toThrow('must be a JSON object')
    await writeFile(file, JSON.stringify({ source: 5, createdAt: 'now' }))
    expect(() => runMirrorStatus('web-mirror')).toThrow('must carry source and createdAt')
  })
})

describe('dsh mirror list and status', () => {
  it('lists nothing without a profiles root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'dsh-mirror-empty-'))
    dirs.push(base)
    process.env.DSH_HOME = base
    expect(runMirrorList()).toBe(0)
    expect(lines.out.join('')).toContain('no mirrors')
    expect(listMirrors()).toEqual([])
  })

  it('lists mirrors sorted, skipping non-directories and corrupt records', async () => {
    await home()
    await writeFile(join(profilesRoot(), 'not-a-dir'), 'x')
    await mkdir(join(profilesRoot(), 'corrupt'), { recursive: true })
    await writeFile(join(profilesRoot(), 'corrupt', MIRROR_STATE_FILENAME), '{nope')
    expect(runMirrorCreate('b-mirror', 'web')).toBe(0)
    expect(runMirrorCreate('a-mirror', 'web')).toBe(0)
    // One row with a dead recorded pid carries a recorded port but no liveness.
    await record('b-mirror', { source: 'web', createdAt: 'now', pid: 999999, port: 9 })
    lines.out = []
    expect(runMirrorList()).toBe(0)
    const text = lines.out.join('')
    expect(text).toContain('a-mirror')
    expect(text).toContain('b-mirror')
    expect(text.indexOf('a-mirror')).toBeLessThan(text.indexOf('b-mirror'))
    const rows = listMirrors()
    expect(rows.map(row => row.name)).toEqual(['a-mirror', 'b-mirror'])
    expect(rows.find(row => row.name === 'a-mirror')).toMatchObject({ running: false })
    expect(rows.find(row => row.name === 'b-mirror')).toMatchObject({ running: false, port: 9 })
  })

  it('status reports never-launched, exited, and running mirrors, and tails a non-empty log', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    writeFileSync(join(profilesRoot(), 'web-mirror', '.dsh-mirror.log'), '')
    expect(runMirrorStatus('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('never launched')
    expect(lines.out.join('')).not.toContain('log tail')
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: 999999, port: 7 })
    lines.out = []
    expect(runMirrorStatus('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('exited')
    expect(lines.out.join('')).toContain('port:    7')
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 7 })
    lines.out = []
    expect(runMirrorStatus('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain(`running (pid ${String(process.pid)})`)
    expect(runMirrorStatus('web')).toBe(1)
    expect(lines.err.join('')).toContain('is not a mirror')
    await writeFile(join(profilesRoot(), 'web-mirror', '.dsh-mirror.log'), 'one\ntwo\n')
    expect(runMirrorStatus('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('two')
  })
})

describe('dsh mirror launch, stop, discard', () => {
  /** A fetch stub that refuses the first `refusals` probes, then answers. */
  const refusingFetch = (refusals: number): ReturnType<typeof vi.fn> => {
    let calls = 0
    return vi.fn(async () => {
      calls += 1
      if (calls <= refusals) throw new Error('refused')
    })
  }

  it('launch spawns the bin with the loader flags, records state, and waits for HTTP', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    const { child, unref } = fakeChild(4242)
    const spawns: Array<[string, readonly string[], { detached: boolean }]> = []
    internals.spawn = ((command: string, args: readonly string[], options: { detached: boolean }) => {
      spawns.push([command, args, options])
      return child
    }) as never
    const fetchStub = refusingFetch(2)
    vi.stubGlobal('fetch', fetchStub)
    expect(await runMirrorLaunch('web-mirror')).toBe(0)
    const [command, args, options] = spawns[0]!
    expect(command).toBe(process.execPath)
    expect(args).toContain(process.argv[1])
    expect(args.slice(-4)).toEqual(['--profile', 'web-mirror', '--port', expect.any(String)])
    expect(options.detached).toBe(true)
    expect(unref).toHaveBeenCalled()
    expect(fetchStub).toHaveBeenCalledTimes(3)
    const state = stateOf('web-mirror')
    expect(state.pid).toBe(4242)
    expect(Number.isInteger(state.port)).toBe(true)
    expect(lines.out.join('')).toContain(`is up: http://127.0.0.1:${String(state.port)}`)
    expect(existsSync(join(profilesRoot(), 'web-mirror', '.dsh-mirror.log'))).toBe(true)
  })

  it('launch times out when the instance never answers', async () => {
    vi.useFakeTimers({ now: Date.now() })
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    internals.spawn = (() => fakeChild(4242).child) as never
    vi.stubGlobal('fetch', refusingFetch(Number.MAX_SAFE_INTEGER))
    const code = await Promise.race([
      runMirrorLaunch('web-mirror'),
      (async () => {
        await vi.advanceTimersByTimeAsync(121_000)
        return 'still-pending'
      })(),
    ])
    expect(code).toBe(1)
    expect(lines.err.join('')).toContain('no HTTP answer')
  })

  it('launch refuses non-mirrors, reports early exits and pid-less spawns, and blocks a second launch', async () => {
    await home()
    expect(await runMirrorLaunch('web')).toBe(1)
    expect(lines.err.join('')).toContain('is not a mirror')
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    internals.spawn = (() => fakeChild(4242, 1).child) as never
    vi.stubGlobal('fetch', refusingFetch(Number.MAX_SAFE_INTEGER))
    expect(await runMirrorLaunch('web-mirror')).toBe(1)
    expect(lines.err.join('')).toContain('exited early')
    internals.spawn = (() => ({ pid: undefined, exitCode: null, unref: vi.fn() })) as never
    expect(await runMirrorLaunch('web-mirror')).toBe(1)
    expect(lines.err.join('')).toContain('without a pid')
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 1 })
    expect(await runMirrorLaunch('web-mirror')).toBe(1)
    expect(lines.err.join('')).toContain('already running')
  })

  it('stop reports non-mirrors and tolerates exited or unlaunched mirrors', async () => {
    await home()
    expect(runMirrorStop('web')).toBe(1)
    expect(lines.err.join('')).toContain('is not a mirror')
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    await record('web-mirror', { source: 'web', createdAt: 'now' })
    expect(runMirrorStop('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('is not running')
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: 999999, launchedAt: 'then' })
    expect(runMirrorStop('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('had already exited')
    expect(stateOf('web-mirror')).toEqual({ source: 'web', createdAt: 'now', launchedAt: 'then' })
  })

  it('stop kills the tree and keeps the record when the kill fails', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 7, launchedAt: 'then' })
    const kills: Array<[string, readonly string[]]> = []
    internals.spawnSync = ((command: string, args: readonly string[]) => {
      kills.push([command, args])
      return { status: 1 }
    }) as never
    if (process.platform === 'win32') {
      expect(runMirrorStop('web-mirror')).toBe(1)
      expect(lines.err.join('')).toContain('taskkill failed')
      expect(stateOf('web-mirror')).toMatchObject({ pid: process.pid })
      internals.spawnSync = (() => ({ status: null })) as never
      expect(runMirrorStop('web-mirror')).toBe(1)
      internals.spawnSync = (() => ({ status: 128 })) as never
      expect(runMirrorDiscard('web-mirror')).toBe(128)
      expect(existsSync(join(profilesRoot(), 'web-mirror'))).toBe(true)
    } else {
      // The POSIX branch signals the pid directly; a faked spawnSync never
      // runs there, and killing the runner's own pid is not an option.
      const { spawn: realSpawn } = await import('node:child_process')
      const victim = realSpawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'])
      await new Promise((resolve) => { victim.once('spawn', resolve) })
      await record('web-mirror', { source: 'web', createdAt: 'now', pid: victim.pid, port: 7 })
      expect(runMirrorStop('web-mirror')).toBe(0)
      expect(kills).toEqual([])
      expect(stateOf('web-mirror').pid).toBeUndefined()
      expect(runMirrorDiscard('web-mirror')).toBe(0)
      expect(existsSync(join(profilesRoot(), 'web-mirror'))).toBe(false)
      try { victim.kill('SIGKILL') } catch { /* already gone with the tree */ }
    }
  })

  it('a successful tree kill clears the record and a live mirror lists as running', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 7 })
    internals.spawnSync = (() => ({ status: 0 })) as never
    expect(runMirrorStop('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('stopped')
    expect(stateOf('web-mirror')).toEqual({ source: 'web', createdAt: 'now' })
    // The list row of a live mirror reports its port.
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 7 })
    lines.out = []
    expect(runMirrorList()).toBe(0)
    expect(lines.out.join('')).toContain('running on :7')
    // An exited record without a port omits the status port line, and a stop
    // clear without a last launch time keeps neither field.
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: 999999 })
    lines.out = []
    expect(runMirrorStatus('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('exited')
    expect(lines.out.join('')).not.toContain('port:')
    expect(runMirrorStop('web-mirror')).toBe(0)
    expect(stateOf('web-mirror')).toEqual({ source: 'web', createdAt: 'now' })
  })

  it('discard of a live mirror takes the stop-then-delete path', async () => {
    await home()
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: process.pid, port: 7 })
    internals.spawnSync = (() => ({ status: 0 })) as never
    expect(runMirrorDiscard('web-mirror')).toBe(0)
    expect(lines.out.join('')).toContain('stopped')
    expect(existsSync(join(profilesRoot(), 'web-mirror'))).toBe(false)
  })

  it('discard refuses real profiles and stops a running mirror before deleting it', async () => {
    await home()
    expect(runMirrorDiscard('web')).toBe(1)
    expect(lines.err.join('')).toContain('refusing to delete a real profile')
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    expect(runMirrorDiscard('web-mirror')).toBe(0)
    expect(existsSync(join(profilesRoot(), 'web-mirror'))).toBe(false)
    expect(runMirrorCreate('web-mirror', 'web')).toBe(0)
    await record('web-mirror', { source: 'web', createdAt: 'now', pid: 999999 })
    expect(runMirrorDiscard('web-mirror')).toBe(0)
    expect(existsSync(join(profilesRoot(), 'web-mirror'))).toBe(false)
  })
})
