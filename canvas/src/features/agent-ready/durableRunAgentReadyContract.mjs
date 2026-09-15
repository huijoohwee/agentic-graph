import catalog from 'agentic-os/catalog/invocation.json' with { type: 'json' }

// The pinned OS catalog owns operation names, schemas and semantics. No executor import.
const operations = catalog.entries.filter(entry => entry.action === 'run')
export const DURABLE_RUN_AGENT_READY_TOOL_IDS = Object.freeze(Object.fromEntries(
  operations.map(entry => [entry.token.slice(1), entry.token.slice(1)]),
))
export const buildDurableRunAgentReadyToolContracts = ({ buildWebName }) => operations.map(entry => ({
  name: entry.token.slice(1),
  webName: buildWebName(entry.token.slice(1)),
  title: entry.token.slice(1),
  description: entry.summary,
  inputSchema: entry.inputSchema,
  annotations: {
    readOnlyHint: entry.semantic === 'read-only',
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: entry.token !== '/run.retry',
  },
  _meta: { invocation: entry.token, binding: '@input:', semantic: `#${entry.semantic}`, catalogDigest: catalog.digest },
}))
