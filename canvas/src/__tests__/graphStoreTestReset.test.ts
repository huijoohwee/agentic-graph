import assert from 'node:assert/strict'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { resetCanvasTestRuntime } from '@/tests/lib/resetCanvasTestRuntime'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'

export async function testCanvasRuntimeResetClearsPreviousChatSession() {
  const chatSession = () => {
    const { chatAuthMode, chatApiKey, chatMessagesJson } = useGraphStore.getState()
    return { chatAuthMode, chatApiKey, chatMessagesJson }
  }
  const previous = chatSession()
  const contaminated = {
    chatAuthMode: 'byok' as const,
    chatApiKey: 'test-session-only',
    chatMessagesJson: '[{"role":"user","content":"previous test"}]',
  }
  try {
    useGraphStore.setState(contaminated)
    useGraphStore.getState().resetAll()
    assert.deepEqual(chatSession(), contaminated,
      'resetting a user workspace must continue to preserve chat settings')
    resetCanvasTestRuntime()
    const { chatAuthMode, chatApiKey, chatMessagesJson } = useGraphStore.getInitialState()
    assert.deepEqual(chatSession(), { chatAuthMode, chatApiKey, chatMessagesJson },
      'test cleanup must release previous credentials and request overrides')
    const initial = useGraphStore.getInitialState()
    useGraphStore.setState({ canvas2dRenderer: initial.canvas2dRenderer === 'd3' ? 'flow' : 'd3' })
    useMarkdownExplorerStore.getState().setActivePath('/docs/previous-case.md')
    useMarkdownExplorerStore.getState().requestRevealLine(99)
    resetCanvasTestRuntime()
    assert.equal(useGraphStore.getState().canvas2dRenderer, initial.canvas2dRenderer,
      'test cleanup must release the previous renderer preference')
    assert.equal(useMarkdownExplorerStore.getState().activePath, null,
      'test cleanup must release the previous source-selection owner')
    assert.equal(useMarkdownExplorerStore.getState().requestedRevealLine, null,
      'test cleanup must release the previous source reveal request')
    const { testMainPanelOpenAiApiKeyUsesServerManagedProxyContract } =
      await import('./mainPanelOpenAiServerManagedKey.test')
    await testMainPanelOpenAiApiKeyUsesServerManagedProxyContract()
    const { testRuntimeSourceFilesSyncsFullDocsMirrorTree } = await import('./workspaceSeedBootstrap.test')
    await testRuntimeSourceFilesSyncsFullDocsMirrorTree()
    resetCanvasTestRuntime()
    const { testWorkspaceBootstrapRetriesGraphOwningMaterializationAfterActivePathDrift } =
      await import('./workspaceBootstrapSourceAuthority.test')
    await testWorkspaceBootstrapRetriesGraphOwningMaterializationAfterActivePathDrift()
  } finally {
    useGraphStore.setState(previous)
  }
}

export function testGraphStoreTestResetReleasesPreviousEditorMutationGuard() {
  const failures: unknown[] = []
  try {
    useGraphStore.getState().setWorkspaceViewMode('editor')
    assert.equal(useGraphStore.getState().workspaceViewMode, 'editor')
    assert.equal(isWorkspaceGraphMutationBlocked(useGraphStore.getState()), true,
      'editor mode must protect graph mutations before test cleanup')

    resetGraphStoreForTests()
    assert.equal(isWorkspaceGraphMutationBlocked(useGraphStore.getState()), false,
      'test cleanup must not carry an editor mutation guard into the next case')
    useGraphStore.getState().setGraphData({
      type: 'Graph',
      context: 'frontmatter-flow',
      nodes: [{ id: 'editable', type: 'CustomWidget', label: 'Editable', properties: {} }],
      edges: [],
      metadata: { kind: 'frontmatter-flow', source: 'workspace:/reset.md' },
    })
    useGraphStore.getState().setFlowWidgetPinnedByNodeId({ editable: false })
    assert.equal(useGraphStore.getState().flowWidgetPinnedByNodeId.editable, false,
      'the next case must be able to update placement through the real guarded setter')
  } catch (error) {
    failures.push(error)
  } finally {
    try { resetGraphStoreForTests() } catch (error) { failures.push(error) }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) throw new AggregateError(failures, failures.map(error => String((error as Error)?.message ?? error)).join('; '))
}
