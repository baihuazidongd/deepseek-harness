/**
 * `dsh mirror <verb>` — disposable mirror profiles: copy a booted profile's
 * composition files into a sibling profile, boot it as a background web
 * instance on a free port, and stop or discard it when the test is over. A
 * mirror is a normal profile directory carrying a `.dsh-mirror.json` state
 * record; the record is what `discard` requires, so a real profile can never
 * be deleted by mistake. Creation copies the manifest, lockfile, workspace
 * config, and user patch layer — never `node_modules` (pnpm junctions point
 * into the source tree); `pnpm install` relinks user-installed plugins from
 * the shared store instead. The mirror shares `$DSH_HOME` with the main
 * instance on purpose: credentials and settings carry over, and the driving
 * agent can reach the mirror's files; isolation comes from the profile copy
 * and the offset port.
 * @module @deepseek-ai/dsh/mirror
 */

import { openSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, opendirSync, readFileSync, rmSync, writeFileSync, copyFileSync, type Dir } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { PROFILES_DIR, resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

const NAME = 'dsh'

/** Filename of the mirror state record inside a mirror profile directory. */
export const MIRROR_STATE_FILENAME = '.dsh-mirror.json'

/** Filename of the mirror's launch log inside a mirror profile directory. */
export const MIRROR_LOG_FILENAME = '.dsh-mirror.log'

/** Durable state of one mirror; `pid`/`port` appear once it has been launched. */
interface MirrorState {
  /** The profile this mirror was copied from. */
  readonly source: string
  readonly createdAt: string
  /** Host process id of the launched instance, while it runs. */
  pid?: number
  /** The port the launched instance serves. */
  port?: number
  /** When this mirror was last launched. */
  launchedAt?: string
}

/** Composition files copied from the source profile on create. */
const COPY_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'cordis.patch.yml'] as const

/** One row of `dsh mirror list`. */
export interface MirrorListing {
  /** The mirror profile's name. */
  name: string
  /** The profile the mirror was copied from. */
  source: string
  /** Whether a recorded host process is still alive. */
  running: boolean
  /** The recorded port, once launched. */
  port?: number
}

/** Process and stream seams; production uses the process, tests inject fakes. */
export const internals: {
  stdout: { write(chunk: string): unknown }
  stderr: { write(chunk: string): unknown }
  spawn: typeof spawn
  spawnSync: typeof spawnSync
} = {
  stdout: process.stdout,
  stderr: process.stderr,
  spawn,
  spawnSync,
}

/** How long `launch` waits for the mirror's HTTP endpoint before giving up. */
const HEALTH_TIMEOUT_MS = 120_000
/** How often `launch` polls the mirror's HTTP endpoint. */
const HEALTH_POLL_MS = 500

/**
 * Read one mirror's state record.
 * @param mirror - the mirror profile name.
 * @returns the parsed state, or undefined when the profile holds no record.
 * @throws when the record exists but is unreadable or not a valid record.
 */
function readMirrorState(mirror: string): MirrorState | undefined {
  const file = join(resolveProfileDir(mirror), MIRROR_STATE_FILENAME)
  if (!existsSync(file)) return undefined
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${NAME} mirror: ${file} must be a JSON object`)
  }
  const state = parsed as Partial<MirrorState>
  if (typeof state.source !== 'string' || typeof state.createdAt !== 'string') {
    throw new Error(`${NAME} mirror: ${file} must carry source and createdAt`)
  }
  return state as MirrorState
}

/** Write one mirror's state record. */
function writeMirrorState(mirror: string, state: MirrorState): void {
  writeFileSync(join(resolveProfileDir(mirror), MIRROR_STATE_FILENAME), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * The state record with its launch fields cleared, for a mirror whose host
 * process is gone. Optional properties cannot carry an explicit `undefined`
 * under exactOptionalPropertyTypes, so the record rebuilds without them.
 * @param state - the record to clear.
 * @returns a copy holding only creation facts (and the last launch time).
 */
function clearLaunchFields(state: MirrorState): MirrorState {
  const next: MirrorState = { source: state.source, createdAt: state.createdAt }
  if (state.launchedAt !== undefined) next.launchedAt = state.launchedAt
  return next
}

/**
 * Whether a host process id is alive.
 * @param pid - the recorded process id.
 * @returns true when the process exists (or exists but is owned elsewhere).
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    /* v8 ignore next -- EPERM (alive but owned elsewhere) needs a foreign process no portable test can arrange. */
    return (error as NodeJS.ErrnoException | null)?.code === 'EPERM'
  }
}

/**
 * Pick a free TCP port by asking the OS for one and closing the listener.
 * The port can race another binder between close and use; local mirror use
 * accepts that window.
 * @returns a currently free port number.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      /* v8 ignore next 2 -- after a successful listen(0) the address is always { port }. */
      const port = typeof address === 'object' && address !== null ? address.port : undefined
      server.close(() => {
        /* v8 ignore next 2 -- the guarded undefined comes only from the impossible address shape above. */
        if (port === undefined) reject(new Error('no port assigned'))
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

/**
 * Fetch the mirror's root page once.
 * @returns true when the server answered anything (including an error status).
 */
function probeHttp(port: number): Promise<boolean> {
  return fetch(`http://127.0.0.1:${String(port)}/`).then(() => true, () => false)
}

/**
 * Create a mirror profile copied from a source profile: copy the composition
 * files (manifest, lockfile, workspace config, user patch layer), relink
 * user-installed plugins through `pnpm install` (skipped for dependency-free
 * manifests), and write the state record that marks the directory as a
 * mirror — the record `discard` requires.
 * @param mirror - the mirror profile name (must not already exist).
 * @param source - the profile to copy (must exist).
 * @returns the exit code.
 */
export function runMirrorCreate(mirror: string, source: string): number {
  if (mirror === source) {
    internals.stderr.write(`${NAME} mirror create: a mirror cannot copy itself\n`)
    return 1
  }
  const sourceDir = resolveProfileDir(source)
  if (!existsSync(join(sourceDir, 'package.json'))) {
    internals.stderr.write(`${NAME} mirror create: source profile ${JSON.stringify(source)} has no manifest — boot or initialize it first\n`)
    return 1
  }
  const mirrorDir = resolveProfileDir(mirror)
  if (existsSync(mirrorDir)) {
    internals.stderr.write(`${NAME} mirror create: ${mirrorDir} already exists\n`)
    return 1
  }
  mkdirSync(mirrorDir, { recursive: true })
  for (const file of COPY_FILES) {
    if (existsSync(join(sourceDir, file))) copyFileSync(join(sourceDir, file), join(mirrorDir, file))
  }
  const manifest = JSON.parse(readFileSync(join(mirrorDir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
  const dependencyCount = Object.keys(manifest.dependencies ?? {}).length
  if (dependencyCount > 0) {
    // Windows resolves pnpm through its .cmd shim, which spawn() refuses
    // without a shell since the CVE-2024-27980 hardening.
    const result = internals.spawnSync('pnpm', ['install'], {
      cwd: mirrorDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
    if (result.status !== 0) {
      internals.stderr.write(`${NAME} mirror create: pnpm install failed in ${mirrorDir} — re-run it there, then dsh mirror launch ${mirror}\n`)
      return result.status ?? 1
    }
  }
  writeMirrorState(mirror, { source, createdAt: new Date().toISOString() })
  internals.stdout.write(`${NAME} mirror ${mirror} created from ${source} at ${mirrorDir}\n`)
  internals.stdout.write(`install into it with: dsh plugin --profile ${mirror} add <package>\n`)
  internals.stdout.write(`then boot it with: dsh mirror launch ${mirror}\n`)
  return 0
}

/**
 * Boot one mirror as a detached background web instance on a free port and
 * wait until its HTTP endpoint answers.
 * @param mirror - the mirror profile name.
 * @returns the exit code.
 */
export async function runMirrorLaunch(mirror: string): Promise<number> {
  const state = readMirrorState(mirror)
  if (state === undefined) {
    internals.stderr.write(`${NAME} mirror launch: ${JSON.stringify(mirror)} is not a mirror (no ${MIRROR_STATE_FILENAME}) — create it with dsh mirror create\n`)
    return 1
  }
  if (state.pid !== undefined && processAlive(state.pid)) {
    internals.stderr.write(`${NAME} mirror launch: ${mirror} is already running (pid ${String(state.pid)}, port ${String(state.port)})\n`)
    return 1
  }
  const mirrorDir = resolveProfileDir(mirror)
  const port = await freePort()
  const logFile = join(mirrorDir, MIRROR_LOG_FILENAME)
  const log = openSync(logFile, 'a')
  // Re-exec this bin with its own loader flags (tsx's --import survives the
  // source launch; a built bin carries none) and hand the port to the web app.
  /* v8 ignore next -- argv[1] is absent only under eval-style entry, which the CLI never is. */
  const child = internals.spawn(process.execPath, [...process.execArgv, process.argv[1] ?? '', '--profile', mirror, '--port', String(port)], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  const pid = child.pid
  if (pid === undefined) {
    internals.stderr.write(`${NAME} mirror launch: the process exited without a pid — read ${logFile}\n`)
    return 1
  }
  writeMirrorState(mirror, { ...state, pid, port, launchedAt: new Date().toISOString() })
  internals.stdout.write(`${NAME} mirror ${mirror} launching on http://127.0.0.1:${String(port)} (log: ${logFile})\n`)
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  for (;;) {
    if (await probeHttp(port)) {
      internals.stdout.write(`${NAME} mirror ${mirror} is up: http://127.0.0.1:${String(port)}\n`)
      return 0
    }
    if (child.exitCode !== null) {
      internals.stderr.write(`${NAME} mirror launch: the mirror process exited early — read ${logFile}\n`)
      return 1
    }
    if (Date.now() > deadline) {
      internals.stderr.write(`${NAME} mirror launch: no HTTP answer within ${String(HEALTH_TIMEOUT_MS)}ms — the instance may still be booting; check ${logFile} and http://127.0.0.1:${String(port)}\n`)
      return 1
    }
    await new Promise((resolve) => { setTimeout(resolve, HEALTH_POLL_MS) })
  }
}

/** List every mirror profile under `$DSH_HOME/profiles`. */
export function listMirrors(): MirrorListing[] {
  const profiles = join(resolveDshHome(), PROFILES_DIR)
  const listings: MirrorListing[] = []
  let dir: Dir
  try {
    dir = opendirSync(profiles)
  } catch {
    return listings
  }
  let entry = dir.readSync()
  while (entry !== null) {
    if (entry.isDirectory()) {
      const state = (() => {
        try {
          return readMirrorState(entry.name)
        } catch {
          return undefined
        }
      })()
      if (state !== undefined) {
        listings.push({
          name: entry.name,
          source: state.source,
          running: state.pid !== undefined && processAlive(state.pid),
          // exactOptionalPropertyTypes: the optional port carries no explicit undefined.
          ...(state.port !== undefined ? { port: state.port } : {}),
        })
      }
    }
    entry = dir.readSync()
  }
  dir.closeSync()
  return listings.sort((a, b) => a.name.localeCompare(b.name))
}

/** Print every mirror with its running state. */
export function runMirrorList(): number {
  const listings = listMirrors()
  if (listings.length === 0) {
    internals.stdout.write(`${NAME} mirror: no mirrors (create one with dsh mirror create <name> --from <profile>)\n`)
    return 0
  }
  for (const listing of listings) {
    const run = listing.running ? `running on :${String(listing.port)}` : 'stopped'
    internals.stdout.write(`${listing.name}  ${run}  from ${listing.source}\n`)
  }
  return 0
}

/**
 * Print one mirror's state: record fields, process liveness, and the log's
 * tail.
 * @param mirror - the mirror profile name.
 * @returns the exit code.
 */
export function runMirrorStatus(mirror: string): number {
  const state = readMirrorState(mirror)
  if (state === undefined) {
    internals.stderr.write(`${NAME} mirror status: ${JSON.stringify(mirror)} is not a mirror\n`)
    return 1
  }
  const running = state.pid !== undefined && processAlive(state.pid)
  internals.stdout.write(`mirror:  ${mirror}\nfrom:    ${state.source}\ncreated: ${state.createdAt}\n`)
  internals.stdout.write(`process: ${running ? `running (pid ${String(state.pid)})` : state.pid !== undefined ? 'exited' : 'never launched'}\n`)
  if (state.port !== undefined) internals.stdout.write(`port:    ${String(state.port)}\n`)
  const logFile = join(resolveProfileDir(mirror), MIRROR_LOG_FILENAME)
  if (existsSync(logFile)) {
    const tail = readFileSync(logFile, 'utf8').trimEnd().split('\n').slice(-15).join('\n')
    if (tail.length > 0) internals.stdout.write(`log tail (${logFile}):\n${tail}\n`)
  }
  return 0
}

/**
 * Stop one mirror's background instance, killing its whole process tree.
 * @param mirror - the mirror profile name.
 * @returns the exit code.
 */
export function runMirrorStop(mirror: string): number {
  const state = readMirrorState(mirror)
  if (state === undefined) {
    internals.stderr.write(`${NAME} mirror stop: ${JSON.stringify(mirror)} is not a mirror\n`)
    return 1
  }
  if (state.pid === undefined) {
    internals.stdout.write(`${NAME} mirror stop: ${mirror} is not running\n`)
    return 0
  }
  if (!processAlive(state.pid)) {
    writeMirrorState(mirror, clearLaunchFields(state))
    internals.stdout.write(`${NAME} mirror stop: ${mirror} had already exited\n`)
    return 0
  }
  /* v8 ignore next 9 -- platform-split kill paths: each OS lane can execute only its own. */
  if (process.platform === 'win32') {
    const killed = internals.spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore' })
    if (killed.status !== 0) {
      internals.stderr.write(`${NAME} mirror stop: taskkill failed for pid ${String(state.pid)}\n`)
      return killed.status ?? 1
    }
  } else {
    process.kill(state.pid, 'SIGKILL')
  }
  writeMirrorState(mirror, clearLaunchFields(state))
  internals.stdout.write(`${NAME} mirror stop: ${mirror} stopped\n`)
  return 0
}

/**
 * Stop and delete one mirror profile directory. The state record is the
 * authorization: a directory without one is a real profile and is refused.
 * @param mirror - the mirror profile name.
 * @returns the exit code.
 */
export function runMirrorDiscard(mirror: string): number {
  const state = readMirrorState(mirror)
  if (state === undefined) {
    internals.stderr.write(`${NAME} mirror discard: ${JSON.stringify(mirror)} is not a mirror — refusing to delete a real profile\n`)
    return 1
  }
  if (state.pid !== undefined && processAlive(state.pid)) {
    const stopped = runMirrorStop(mirror)
    if (stopped !== 0) return stopped
  }
  rmSync(resolveProfileDir(mirror), { recursive: true, force: true })
  internals.stdout.write(`${NAME} mirror discard: ${mirror} deleted\n`)
  return 0
}
