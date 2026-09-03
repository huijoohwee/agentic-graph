import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testDeerFlowPrdTadUsesImplementedGatewayOwners(): void {
  const docs = [
    'docs/documents/agentic-graph-deerflow/agentic-graph-deerflow-prd-tad.md',
    'docs/documents/agentic-graph-deerflow/agentic-graph-deerflow-prd-tad.companion.md',
    'docs/documents/agentic-graph-deerflow/agentic-graph-deerflow-prd-tad-integration-contracts-and-patterns.md',
    'docs/documents/agentic-graph-deerflow/agentic-graph-deerflow-prd-tad-delivery-validation.md',
    'docs/documents/agentic-graph-deerflow/agentic-graph-deerflow-setup-guide.md',
  ].map(readRepoFile).join('\n')
  const owners = [
    'canvas/src/features/panels/views/deerflowApiDocs.ts',
    'canvas/src/lib/chatEndpoint.ts',
    'canvas/src/features/storyboard-widget-manager/registryTemplates.ts',
    'canvas/src/hooks/store/storyboardWidgetManagerRegistryPersistence.ts',
    'canvas/src/features/chat/richMediaRun.ts',
    'canvas/src/features/chat/deerflowRunGeneration.ts',
    'canvas/src/features/markdown-workspace/workspaceImport/deerflowUrlImport.ts',
  ].map(readRepoFile).join('\n')

  const requiredDocTokens = [
    '**Status**: Accepted and implemented baseline',
    'Document Version**: 1.2.0',
    'DeerFlow as a first-class optional local-gateway provider',
    '`canvas/src/features/panels/views/deerflowApiDocs.ts` | Shipped',
    '`canvas/src/hooks/store/storyboardWidgetManagerRegistryPersistence.ts` | Shipped',
    '`canvas/src/features/chat/deerflowRunGeneration.ts` | Shipped',
    '`canvas/src/features/markdown-workspace/workspaceImport/deerflowUrlImport.ts` | Shipped',
    'The shipped DeerFlow baseline documents the local HTTP gateway, not a DeerFlow MCP bridge.',
    'A future DeerFlow MCP bridge requires source owners and tests before docs can mark it implemented.',
  ]
  for (const token of requiredDocTokens) {
    if (!docs.includes(token)) {
      throw new Error(`Expected DeerFlow PRD/TAD docs to include ${JSON.stringify(token)}`)
    }
  }

  const requiredOwnerTokens = [
    'DEERFLOW_API_REQUEST_DOC_ENTRIES',
    'mapOpenAiRowKeyToDeerFlowRowKey',
    'getDeerFlowApiRowAnchorId',
    'CHAT_PROVIDER_DEERFLOW',
    'CHAT_DEERFLOW_ENDPOINT_URL',
    'textGeneration.deerflow',
    'generateRunImageWithDeerFlow',
    'generateRunVideoWithDeerFlow',
    'DEERFLOW_RUNS_STREAM_PATH',
    'resolveDeerFlowRunsStreamEndpoint',
    'resolveDeerFlowRunsWaitEndpoint',
    'importWorkspaceUrlViaDeerFlow',
  ]
  for (const token of requiredOwnerTokens) {
    if (!owners.includes(token)) {
      throw new Error(`Expected DeerFlow source owner token ${JSON.stringify(token)}`)
    }
  }

  const staleDocTokens = [
    '**Status**: Proposed',
    'direct/MCP',
    'Direct vs MCP',
    'MCP Adapter',
    'MCP mode',
    'MCP bridge mode',
    'Provider mode (`direct|mcp`)',
    'behind feature flag',
    'feature flag strategy',
    'DeerFlow direct and MCP adapters',
    'mode-gated direct/MCP settings validation',
    'MCP-mode integration tests',
    'direct API mode and MCP bridge mode',
  ]
  for (const token of staleDocTokens) {
    if (docs.includes(token)) {
      throw new Error(`Expected DeerFlow PRD/TAD docs to remove stale token ${JSON.stringify(token)}`)
    }
  }
}
