// Minimal self-contained MCP server over stdio, bundled with dsh-mcp-everything.
// Exposes three tools (echo, add, now) so the mcp-client bridge can be verified
// offline without downloading a reference server.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer(
  { name: 'everything', version: '1.0.0' },
  { capabilities: { tools: { listChanged: true } } },
)

server.registerTool('echo', {
  title: 'Echo',
  description: 'Echoes the given text back unchanged.',
  inputSchema: { text: z.string().describe('Text to echo') },
}, async (args) => ({
  content: [{ type: 'text', text: args.text }],
}))

server.registerTool('add', {
  title: 'Add',
  description: 'Adds two numbers.',
  inputSchema: {
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
  },
}, async (args) => ({
  content: [{ type: 'text', text: String(args.a + args.b) }],
}))

server.registerTool('now', {
  title: 'Now',
  description: 'Returns the current ISO-8601 timestamp.',
  inputSchema: {},
}, async () => ({
  content: [{ type: 'text', text: new Date().toISOString() }],
}))

const transport = new StdioServerTransport()
await server.connect(transport)
