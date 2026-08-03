import { useGraphStore } from '@/hooks/useGraphStore'
import { shouldApplyWorkspaceDocumentSwitchSnapshot } from '@/lib/markdown-workspace-runtime/markdownWorkspaceDocumentSwitchApply'

export function testWorkspaceDocumentSwitchDefersUnhydratedFileUntilSourceSnapshot() {
  const base = {
    activePath: '/notes/ready.md' as never,
    pendingSwitchPath: '/notes/ready.md' as never,
    activeEntryKind: 'file',
    activeDocumentKey: '/notes/ready.md',
  }
  const matchingSnapshot = {
    current: true,
    revision: { path: '/notes/ready.md' as never, revision: 4 },
    value: '# Ready',
  }
  if (!shouldApplyWorkspaceDocumentSwitchSnapshot({ ...base, snapshot: matchingSnapshot })) {
    throw new Error('expected a current selected-path snapshot to publish document authority')
  }
  if (shouldApplyWorkspaceDocumentSwitchSnapshot({
    ...base,
    snapshot: { ...matchingSnapshot, current: false },
  })) {
    throw new Error('expected an invalidated source revision not to publish document authority')
  }
  if (shouldApplyWorkspaceDocumentSwitchSnapshot({
    ...base,
    snapshot: {
      ...matchingSnapshot,
      revision: { path: '/notes/previous.md' as never, revision: 4 },
    },
  })) {
    throw new Error('expected a snapshot owned by another path not to publish document authority')
  }
}

export async function testWorkspaceDocumentSwitchResolvedBlankClearsStaleGraph() {
  const state = useGraphStore.getState()
  state.resetAll()
  state.setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    metadata: { source: 'markdown:/notes/previous.md' },
    nodes: [{ id: 'stale-card', label: 'Stale card', type: 'Paragraph' }],
    edges: [],
  } as never)
  await useGraphStore.getState().setActiveMarkdownDocument({
    name: '/notes/empty.md',
    text: '',
    normalizeMermaidMmd: false,
    applyViewPreset: true,
    applyToGraph: true,
    forceApplyToGraph: true,
  })
  const graph = useGraphStore.getState().graphData
  const metadata = (graph?.metadata || {}) as Record<string, unknown>
  if ((graph?.nodes || []).length !== 0 || metadata.pending !== true || metadata.source !== 'markdown:/notes/empty.md') {
    throw new Error(`expected an authoritative resolved blank document to replace stale graph content, got ${JSON.stringify(graph)}`)
  }
}
