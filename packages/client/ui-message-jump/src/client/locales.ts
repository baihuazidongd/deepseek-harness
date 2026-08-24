/**
 * `message-jump` namespace dictionaries.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'group.aria': '跳转到我的消息',
  'cell.aria': '第 {ordinal} 条我的消息，共 {total} 条',
  'preview.empty': '[图片或非文本内容]',
} satisfies Record<string, string>

/** The message-jump namespace key union. */
export type MessageJumpKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'group.aria': 'Jump to my messages',
  'cell.aria': 'Message {ordinal} of {total} you sent',
  'preview.empty': '[image or non-text content]',
} satisfies Record<MessageJumpKey, string>
