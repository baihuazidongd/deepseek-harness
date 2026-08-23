/**
 * Bilingual copy for the archived-sessions settings section. Product copy is
 * Chinese; English is the fallback dictionary.
 * @module @deepseek-ai/dsh-client-ui-session-archive/client/locales
 */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  nav: '归档会话',
  intro: '归档的会话不会出现在侧边栏，日志仍完整保留。在这里可以找回它们。',
  listHeading: '已归档',
  empty: '当前没有归档的会话。',
  restore: '恢复',
  restoring: '恢复中…',
  open: '打开',
  failure: '恢复失败',
  ungrouped: '未分组',
} satisfies Record<string, string>

/** Archived-sessions locale key union. */
export type SessionArchiveLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  nav: 'Archived sessions',
  intro: 'Archived conversations stay out of the sidebar while their logs remain intact. Recover them here.',
  listHeading: 'Archived',
  empty: 'Nothing is archived right now.',
  restore: 'Restore',
  restoring: 'Restoring…',
  open: 'Open',
  failure: 'Restore failed',
  ungrouped: 'Ungrouped',
} satisfies Record<SessionArchiveLocaleKey, string>
