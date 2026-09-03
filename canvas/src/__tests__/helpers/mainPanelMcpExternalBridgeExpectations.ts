export function assertExternalMcpBridgeIdsAreRuntimeExecutable(text: string): void {
  ;[
    'agentic-graph.tool.catalog',
    'agentic-graph.tool.search',
    'agentic-graph.tool.describe',
    'agentic-graph.tool.call',
    'Runtime-executable',
  ].forEach(token => {
    if (!text.includes(token)) {
      throw new Error(`expected external MCP runtime contract to preserve ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
  ;['planned target', 'deferred schema access', 'documented-only'].forEach(token => {
    if (text.includes(token)) {
      throw new Error(`expected external MCP runtime contract to remove stale wording ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
    }
  })
}
