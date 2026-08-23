/**
 * @deepseek-ai/dsh-user-patches — the user patch-layer paths a dsh launcher
 * hands to the app it boots, plus the atomic row writer that persists a
 * loader-entry enablement change into the profile's own layer.
 *
 * The paths are launcher facts, like the command line: an app plugin cannot
 * derive which files its composition treated as the user layers, so the
 * launcher provides them on the context before any tree entry mounts. The
 * writer keeps the file in the include's entry-list dialect — `!!js`
 * expression scalars round-trip unchanged — so a runtime toggle lands in the
 * same format the boot-time reader and watcher (`watchUserPatches` in
 * `dsh-app-boot`) consume, and a later manual edit of the file still
 * overrides what this writer left.
 * @module @deepseek-ai/dsh-user-patches
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import * as yaml from 'js-yaml'
import { entryListSchema, type PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import type { Context } from '@deepseek-ai/cordis'

/**
 * The user patch layers of one booted surface, in composition order: the
 * profile's own layer first, the home-level layer applied over every profile
 * second. Absolute paths.
 */
export interface UserPatchPaths {
  /** The booted profile's layer (`$DSH_HOME/profiles/<name>/cordis.patch.yml`). */
  readonly profilePatchPath: string
  /** The home-level layer (`$DSH_HOME/cordis.patch.yml`). */
  readonly homePatchPath: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * The user patch-layer paths of this boot; provided by a launcher before
     * the tree mounts. Absent when the embedding surface composed no user
     * layers, in which case enablement writes must fail loud rather than
     * guess a file.
     */
    userPatchPaths?: UserPatchPaths
  }
}

/**
 * Provide the user patch-layer paths on a host context before any tree entry
 * mounts. The snapshot is frozen; later mutation of the caller's object
 * cannot change what the app reads.
 * @param ctx - the host context the tree will mount under.
 * @param paths - both user-layer paths of this composition.
 * @throws when either path is not a non-empty string.
 */
export function provideUserPatchPaths(ctx: Context, paths: UserPatchPaths): void {
  for (const [label, value] of [['profilePatchPath', paths.profilePatchPath], ['homePatchPath', paths.homePatchPath]] as const) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`provideUserPatchPaths: ${label} must be a non-empty absolute path`)
    }
  }
  ctx.provide('userPatchPaths', Object.freeze({ ...paths }))
}

/** One enablement override row {@link upsertUserPatchRow} persists. */
export interface UserPatchEnablementRow {
  /** The Loader-tree entry id the row targets. */
  readonly id: string
  /** The explicit enablement written for the target entry. */
  readonly disabled: boolean
}

const WRITE_RETRY_LIMIT = 10
const WRITE_RETRY_DELAY_MS = 50

/**
 * Mirrors the include's own rename-retry classification for Windows-transient
 * failures.
 */
/* v8 ignore next 4 -- EACCES/EBUSY/EPERM on rename only occur when an outside
   process holds the destination open; no portable test can produce them. */
function retryableWriteError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code
  return code === 'EACCES' || code === 'EBUSY' || code === 'EPERM'
}

/**
 * Parse one user patch layer with the include's dialect and the same
 * strictness the boot reader applies: a present file that is not a top-level
 * array of mappings is a misconfiguration and must fail loud, never be
 * silently replaced.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - the source path, quoted in errors.
 * @param content - the file's text.
 * @returns the parsed patch rows.
 */
function parsePatchRows(binName: string, file: string, content: string): PatchOptions[] {
  let parsed: unknown
  try {
    parsed = yaml.load(content, { schema: entryListSchema })
  } catch (error) {
    throw new Error(`${binName}: failed to parse patches ${file}: ${String(error)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${binName}: patches ${file} must be a top-level YAML array of loader patch entries`)
  }
  parsed.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${binName}: patches entry ${index + 1} in ${file} must be a mapping (a loader patch entry)`)
    }
  })
  return parsed as PatchOptions[]
}

/**
 * Replace `file` with its temp sibling, retrying Windows-transient rename
 * failures with the include's own backoff limits.
 */
/* v8 ignore next 11 -- the retry path needs an EACCES/EBUSY/EPERM rename failure
   no portable test can produce; the first-attempt rename is exercised through the
   writer tests. */
async function renameWithRetry(file: string): Promise<void> {
  for (let retry = 0; ; retry++) {
    try {
      await rename(`${file}.tmp`, file)
      return
    } catch (error) {
      if (!retryableWriteError(error) || retry >= WRITE_RETRY_LIMIT) throw error
      await delay((retry + 1) * WRITE_RETRY_DELAY_MS)
    }
  }
}

/**
 * Upsert one id-targeted enablement row in a user patch layer, atomically.
 * The file stays in the entry-list dialect: untargeted rows — including
 * their `!!js` config expressions — round-trip unchanged, the targeted row's
 * `disabled` field is replaced while its other fields survive, and a missing
 * target appends a fresh row. A missing file counts as an empty layer and is
 * created. The temp-file-plus-rename write never leaves a half-written layer
 * for the boot watcher to read.
 * @param binName - the diagnostic prefix on the thrown error.
 * @param file - absolute path of the user patch file.
 * @param row - the enablement override to persist.
 * @throws when the existing file cannot be read or is not a valid patch list.
 */
export async function upsertUserPatchRow(
  binName: string,
  file: string,
  row: UserPatchEnablementRow,
): Promise<void> {
  let content: string
  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') content = '[]\n'
    else throw new Error(`${binName}: failed to read patches ${file}: ${String(error)}`)
  }
  const rows = parsePatchRows(binName, file, content)
  const target = rows.find(entry => entry.id === row.id)
  if (target === undefined) rows.push({ id: row.id, disabled: row.disabled })
  else target.disabled = row.disabled
  await writeFile(`${file}.tmp`, yaml.dump(rows, { schema: entryListSchema }))
  await renameWithRetry(file)
}
