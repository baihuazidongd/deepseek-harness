/** Copy dictionaries for the MCP (servers) management page. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  trigger: 'MCP',
  title: 'MCP 服务器',
  close: '关闭',
  loading: '正在读取 MCP 服务器…',
  error: '暂时无法读取 MCP 服务器。',
  retry: '重试',
  search: '搜索服务器',
  empty: '暂无 MCP 服务器。',
  emptySearch: '没有匹配的服务器。',
  writeError: '写入失败,更改未生效。',
  count: '个服务器',
  enable: '启用',
  disable: '停用',
  pending: '写入中…',
  detailTransport: '传输',
  detailTools: '工具',
  noTools: '无已注册工具',
  errorStatus: '连接失败',
  unavailable: '—',
} satisfies Record<string, string>

/** MCP page locale key union. */
export type McpLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  trigger: 'MCP',
  title: 'MCP servers',
  close: 'Close',
  loading: 'Reading MCP servers…',
  error: 'MCP servers are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search servers',
  empty: 'No MCP servers are bridged.',
  emptySearch: 'No matching servers.',
  writeError: 'The change did not land.',
  count: 'servers',
  enable: 'Enable',
  disable: 'Disable',
  pending: 'Writing…',
  detailTransport: 'Transport',
  detailTools: 'Tools',
  noTools: 'No tools registered',
  errorStatus: 'Connection failed',
  unavailable: '—',
} satisfies Record<McpLocaleKey, string>
