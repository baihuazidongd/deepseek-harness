/**
 * Live-room settings store: host name and danmaku presentation survive
 * remounts and reloads. The plugin creates its handle at apply time so
 * identity follows the fiber; the engine keys persistence off the slot's
 * session scope.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'

/** Danmaku band on the video surface. */
export type SlgDmRegion = 'top' | 'middle' | 'bottom'

/** Persisted live-room settings state. */
export interface SlgSettingsState {
  /** Streamer display name; empty falls back to the locale default. */
  hostName: string
  dmRegion: SlgDmRegion
  dmDensity: number
  dmOpacity: number
  dmFontSize: number
  /** Danmaku scroll-rate multiplier; lower is slower. */
  dmSpeed: number
  /** Gift-danmaku scroll-rate multiplier; lower is slower. */
  giftSpeed: number
  dmStack: boolean
  /** Live thinking-panel height in px (4 rows default); user-resizable. */
  thinkHeight: number
}

/** Declared action shape used to give the exported factory a stable return type. */
export type SlgSettingsActions = {
  setHostName: (draft: SlgSettingsState, v: string) => void
  setDmRegion: (draft: SlgSettingsState, v: SlgDmRegion) => void
  setDmDensity: (draft: SlgSettingsState, v: number) => void
  setDmOpacity: (draft: SlgSettingsState, v: number) => void
  setDmFontSize: (draft: SlgSettingsState, v: number) => void
  setDmSpeed: (draft: SlgSettingsState, v: number) => void
  setGiftSpeed: (draft: SlgSettingsState, v: number) => void
  setDmStack: (draft: SlgSettingsState, v: boolean) => void
  setThinkHeight: (draft: SlgSettingsState, v: number) => void
}

/** Defaults for a fresh install and for the pre-session ephemeral settings face. */
export const SLG_SETTINGS_DEFAULTS: SlgSettingsState = {
  hostName: '',
  dmRegion: 'middle',
  dmDensity: 6,
  dmOpacity: 1,
  dmFontSize: 13,
  dmSpeed: 1,
  giftSpeed: 1,
  dmStack: true,
  thinkHeight: 96,
}

/**
 * Declares the persisted live-room settings state and write surface.
 * @returns the store handle.
 */
export function createSlgSettingsStore(): EngineStoreHandle<SlgSettingsState, SlgSettingsActions> {
  return defineStore({
    init: (): SlgSettingsState => ({ ...SLG_SETTINGS_DEFAULTS }),
    persist: 'dsh.slg.settings',
    actions: {
      setHostName: (d, v) => { d.hostName = v },
      setDmRegion: (d, v) => { d.dmRegion = v },
      setDmDensity: (d, v) => { d.dmDensity = v },
      setDmOpacity: (d, v) => { d.dmOpacity = v },
      setDmFontSize: (d, v) => { d.dmFontSize = v },
      setDmSpeed: (d, v) => { d.dmSpeed = v },
      setGiftSpeed: (d, v) => { d.giftSpeed = v },
      setDmStack: (d, v) => { d.dmStack = v },
      setThinkHeight: (d, v) => { d.thinkHeight = v },
    },
  })
}
