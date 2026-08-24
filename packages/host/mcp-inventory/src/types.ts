/** One MCP server's tool projection. */
export interface McpToolView {
  readonly name: string
  readonly description: string
}

/**
 * Health of one bridged MCP server, folded from its enablement and whether it
 * registered any tools: a disabled entry is `disabled`; an enabled entry with
 * tools is `active`; an enabled entry with no tools is `error` (the bridge
 * connected with no tools, or the initial connection failed and `failOnStartupError`
 * let the entry stay active).
 */
export type McpServerStatus = 'active' | 'disabled' | 'error'

/** One MCP server exposed by an mcp-client Loader entry, with its tools. */
export interface McpServerEntry {
  /** The server's `serverName` namespace. */
  readonly name: string
  /** The mcp-client Loader entry id the enablement toggle targets. */
  readonly entryId: string
  /** The transport the server connects over. */
  readonly transport: string
  /** Effective Loader enablement of the mcp-client entry. */
  readonly enabled: boolean
  /** Derived health, so a client can render a failure without re-deriving it. */
  readonly status: McpServerStatus
  /** The tools this server currently registers, in registration order. */
  readonly tools: readonly McpToolView[]
}

/** Point-in-time MCP server inventory returned by the MCP inventory Remote. */
export interface McpInventorySnapshot {
  readonly servers: readonly McpServerEntry[]
}

/** One per-server enablement write. */
export interface McpInventorySetEnabledRequest {
  /** The server's `serverName`. */
  readonly name: string
  /** The desired enablement. */
  readonly enabled: boolean
}
