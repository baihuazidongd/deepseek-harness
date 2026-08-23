/**
 * `thinking-strength` namespace dictionaries.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger.aria': '选择思考强度，当前 {effort}',
  'menu.aria': '思考强度',
  'effort.providerDefault': '默认',
  'error.action': '思考强度操作失败：{message}',
  'error.generic': '无法更新思考强度。',
  'empty.efforts': '当前模型未提供思考强度。',
} satisfies Record<string, string>

/** The thinking-strength namespace key union. */
export type ThinkingStrengthKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger.aria': 'Select thinking strength, current {effort}',
  'menu.aria': 'Thinking strength',
  'effort.providerDefault': 'Default',
  'error.action': 'Thinking strength operation failed: {message}',
  'error.generic': 'Could not update thinking strength.',
  'empty.efforts': 'This model provides no thinking strength levels.',
} satisfies Record<ThinkingStrengthKey, string>
