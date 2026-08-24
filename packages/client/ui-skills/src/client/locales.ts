/** Copy dictionaries for the 技能 (skills) management page. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  trigger: '技能',
  title: '技能管理',
  close: '关闭',
  loading: '正在读取技能…',
  error: '暂时无法读取技能。',
  retry: '重试',
  search: '搜索技能',
  empty: '暂无技能。',
  emptySearch: '没有匹配的技能。',
  writeError: '写入失败,更改未生效。',
  count: '个技能',
  enable: '启用',
  disable: '停用',
  pending: '写入中…',
  detailDescription: '描述',
  detailProvider: '提供者',
  detailSource: '来源',
  detailContent: '正文',
  unavailable: '—',
} satisfies Record<string, string>

/** Skills page locale key union. */
export type SkillsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  trigger: 'Skills',
  title: 'Skill manager',
  close: 'Close',
  loading: 'Reading skills…',
  error: 'Skills are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search skills',
  empty: 'No skills are available.',
  emptySearch: 'No matching skills.',
  writeError: 'The change did not land.',
  count: 'skills',
  enable: 'Enable',
  disable: 'Disable',
  pending: 'Writing…',
  detailDescription: 'Description',
  detailProvider: 'Provider',
  detailSource: 'Source',
  detailContent: 'Instructions',
  unavailable: '—',
} satisfies Record<SkillsLocaleKey, string>
