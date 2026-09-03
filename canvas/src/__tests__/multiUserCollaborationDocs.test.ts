import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testMultiUserCollaborationDocsUseImplementedCollaborationOwners(): void {
  const docs = [
    'docs/documents/agentic-graph-multi-user-collaboration-prd.tad.md',
    'docs/documents/agentic-graph-multi-user-collaboration-prd.tad.companion.md',
  ].map(readRepoFile).join('\n')
  const owners = [
    'canvas/src/features/panels/mainPanelTabs.ts',
    'canvas/src/features/panels/views/CollaborationView.tsx',
    'canvas/src/features/collaboration/use-agentic-graph-storage-collaboration-runtime.ts',
    'canvas/src/lib/markdown-workspace-runtime/MarkdownWorkspaceRuntime.impl.tsx',
    'canvas/src/lib/storage/agentic-graph-storage-canvas-room-client.ts',
    'cloudflare/workers/agentic-graph-storage/canvasSyncRoom.ts',
    'cloudflare/workers/agentic-graph-storage/index.ts',
    'cloudflare/workers/agentic-graph-storage/chatAuth.ts',
    'canvas/src/features/collaboration/p2pCollaborationProtocol.ts',
    'canvas/src/features/collaboration/p2pCollaborationStore.ts',
    'canvas/src/features/collaboration/useP2PCollaborationRuntime.ts',
    'canvas/src/components/toolbar/useCanvasToolbarContext.ts',
    'canvas/scripts/verify-multi-user-collaboration-e2e.ts',
    'canvas/package.json',
    'canvas/src/__tests__/mainPanelCollaboration.test.tsx',
    'canvas/src/__tests__/mainPanelCollaboration.protocolStore.test.ts',
    'canvas/src/__tests__/mainPanelCollaboration.view.test.tsx',
    'canvas/src/__tests__/mainPanelCollaboration.runtimeRelay.test.tsx',
    'canvas/src/__tests__/mainPanelCollaboration.runtimeLifecycle.test.tsx',
    'canvas/src/__tests__/mainPanelCollaboration.testkit.tsx',
  ].map(readRepoFile).join('\n')

  const requiredDocTokens = [
    '**Status**: Accepted and implemented authenticated room transport',
    'authenticated storage-room transport',
    'current canonical collaboration path for storage-configured workspaces is the authenticated canvas-room transport',
    'fallback no-server WebRTC invite/answer flow remains available only when authenticated room transport is not configured',
    '`canvas/src/features/collaboration/use-agentic-graph-storage-collaboration-runtime.ts` | Shipped',
    '`canvas/src/lib/storage/agentic-graph-storage-canvas-room-client.ts` | Shipped',
    '`cloudflare/workers/agentic-graph-storage/canvasSyncRoom.ts` | Shipped',
    '`canvas/src/features/panels/views/CollaborationView.tsx` | Shipped',
    '`canvas/src/features/collaboration/p2pCollaborationProtocol.ts` | Shipped',
    '`canvas/src/features/collaboration/p2pCollaborationStore.ts` | Shipped',
    '`canvas/src/features/collaboration/useP2PCollaborationRuntime.ts` | Shipped',
    '`npm --prefix canvas run validate:multi-user-collaboration:e2e`',
  ]
  for (const token of requiredDocTokens) {
    if (!docs.includes(token)) {
      throw new Error(`Expected multi-user collaboration docs to include ${JSON.stringify(token)}`)
    }
  }

  const requiredOwnerTokens = [
    "key: 'collaboration'",
    'use-agentic-graph-storage-collaboration-runtime',
    'setActiveText: effectiveContent.effectiveSetActiveText',
    'buildAgenticGraphStorageCanvasRoomWebSocketUrl',
    'Workspace room connected',
    'Connect Room',
    'Reconnect Room',
    'buildAgenticGraphStorageCanvasRoomPath',
    'useP2PCollaborationStore',
    'P2P_COLLAB_INVITE_SEARCH_PARAM',
    'P2P_COLLAB_ANSWER_SEARCH_PARAM',
    'P2P_COLLAB_PROTOCOL_VERSION',
    'parseP2PCollaborationWireMessage',
    'useP2PCollaborationRuntime',
    "detailTab === 'collaboration'",
    'validate:multi-user-collaboration:e2e',
    'QUERY_PARAM_OPEN_EDITOR_WORKSPACE',
    "import { LOCAL_DOC_PARAM } from '../src/features/canvas/canvasDocDeepLink'",
    'url.searchParams.set(LOCAL_DOC_PARAM, DOC_PATH)',
    'verify-multi-user-collaboration-e2e.ts',
    'assertRoomStatus(WORKER_URL, ownerConnectedSnapshot.markdownDocumentName)',
    'session-roster',
    'document-sync',
    'testP2PCollaborationRuntimeRelaysRosterPresenceAndDocumentAcrossGuests',
  ]
  for (const token of requiredOwnerTokens) {
    if (!owners.includes(token)) {
      throw new Error(`Expected multi-user collaboration source owner token ${JSON.stringify(token)}`)
    }
  }

  const staleDocTokens = [
    '**Status**: Proposed',
    'Zero authenticated users can collaborate today',
    'Every push/pull request is unauthenticated',
    'No Real-Time Collaboration Awareness',
    'No User Identity',
    'No Access Control',
    'a JWT is issued',
    'D1 Becomes Operational SSOT',
    'viewer role',
    'Worker returns 403 Forbidden',
    '0002_agentic_graph_auth.sql',
    'Auth Middleware',
    'users table',
    'The larger authenticated collaboration model remains a planned extension.',
    'Authenticated workspace membership, D1 role checks, server-side audit trails, and Durable Object rooms are not part of the implemented baseline.',
  ]
  for (const token of staleDocTokens) {
    if (docs.includes(token)) {
      throw new Error(`Expected multi-user collaboration docs to remove stale token ${JSON.stringify(token)}`)
    }
  }
}

export const testMultiUserCollaborationDocsUseImplementedP2POwners =
  testMultiUserCollaborationDocsUseImplementedCollaborationOwners
