import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildStoryboardWidgetDraftGraphBaseSignature,
  bumpStoryboardWidgetDraftGraphDataRevision,
  resolveStoryboardWidgetDraftGraphDataForBaseReset,
} from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { readGraphDataRevision } from '@/lib/graph/documentMetadata'
import type { GraphData } from '@/lib/graph/types'

const graph = (revision: number, ids: string[]): GraphData => ({
  type: 'Graph',
  nodes: ids.map(id => ({ id, label: id, type: 'Widget', properties: {} })) as never,
  edges: [],
  metadata: { graphDataRevision: revision },
})

const graphWithNodeProperties = (revision: number, props: Record<string, unknown>): GraphData => ({
  type: 'Graph',
  context: 'markdown',
  nodes: [{ id: 'source_input', label: 'Source Input', type: 'Widget', properties: props }] as never,
  edges: [],
  metadata: { graphDataRevision: revision, kind: 'markdown', source: 'markdown:chat-log/session.md' },
})

export function testStoryboardWidgetBaseResetPreservesNewerSameDocumentDraft() {
  const base = graph(3, ['source_input', 'compute_summary'])
  const draft = graph(4, ['source_input', 'compute_summary'])
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/example.md::',
    previousDocumentKey: 'docs/example.md::',
    currentDraftGraphData: draft,
    nextBaseGraphData: base,
  })
  if (resolved !== draft) throw new Error('expected same-document stale base reset to preserve the newer live draft graph')
}

export function testStoryboardWidgetHistoryNavigationAlwaysRestoresBaseAuthority() {
  const staleDraft = graph(20, ['draft-only'])
  const undoBase = graph(4, ['undo-snapshot'])
  const redoBase = graph(5, ['redo-snapshot'])
  for (const base of [undoBase, redoBase, undoBase, redoBase]) {
    const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
      activeDocumentKey: 'docs/example.md::',
      previousDocumentKey: 'docs/example.md::',
      currentDraftGraphData: staleDraft,
      nextBaseGraphData: base,
      forceBaseReset: true,
    })
    if (resolved !== base) throw new Error('expected every Undo/Redo index transition to restore its canonical base snapshot')
  }
}

export function testStoryboardWidgetBaseResetReplacesDraftAcrossDocumentSwitchOrIncompatibleGraph() {
  const base = graph(3, ['source_input', 'compute_summary'])
  const switched = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/next.md::',
    previousDocumentKey: 'docs/example.md::',
    currentDraftGraphData: graph(4, ['source_input', 'compute_summary']),
    nextBaseGraphData: base,
  })
  const incompatible = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/example.md::',
    previousDocumentKey: 'docs/example.md::',
    currentDraftGraphData: graph(4, ['other_a', 'other_b']),
    nextBaseGraphData: base,
  })
  if (switched !== base || incompatible !== base) throw new Error('expected base reset to replace drafts across document switches or incompatible graph identities')
}

export function testStoryboardWidgetDraftGraphRevisionBumpIsNeutral() {
  const bumped = bumpStoryboardWidgetDraftGraphDataRevision(graph(5, ['n1']))
  if (readGraphDataRevision(bumped) !== 6) throw new Error('expected neutral Storyboard Widget draft revision bump to increment metadata graphDataRevision')
}

export function testStoryboardWidgetDraftGraphRevisionBumpOutranksRevisionFloor() {
  const bumped = bumpStoryboardWidgetDraftGraphDataRevision(graph(5, ['n1']), { revisionFloor: 42 })
  if (readGraphDataRevision(bumped) !== 43) throw new Error('expected Storyboard Widget draft revision bump to outrank the store/base graph revision floor')
}

export function testStoryboardWidgetBaseResetPreservesEqualRevisionSameDocumentDraft() {
  const base = graph(7, ['source_input', 'compute_summary'])
  const draft = graph(7, ['source_input', 'compute_summary'])
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/example.md::',
    previousDocumentKey: 'docs/example.md::',
    currentDraftGraphData: draft,
    nextBaseGraphData: base,
  })
  if (resolved !== draft) throw new Error('expected same-document equal-revision reset to preserve the live draft after store writeback')
}

export function testStoryboardWidgetBaseResetSkipsEquivalentNewerBaseRefresh() {
  const draft = graphWithNodeProperties(4, { value: 'same', nested: { count: 1 } })
  const base = graphWithNodeProperties(5, { value: 'same', nested: { count: 1 } })
  const changedBase = graphWithNodeProperties(6, { value: 'changed', nested: { count: 1 } })
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'chat-log/session.md::5',
    previousDocumentKey: 'chat-log/session.md::5',
    currentDraftGraphData: draft,
    nextBaseGraphData: base,
  })
  const changedResolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'chat-log/session.md::6',
    previousDocumentKey: 'chat-log/session.md::6',
    currentDraftGraphData: draft,
    nextBaseGraphData: changedBase,
  })
  if (buildStoryboardWidgetDraftGraphBaseSignature(draft) !== buildStoryboardWidgetDraftGraphBaseSignature(base)) {
    throw new Error('expected equivalent draft/base graph refreshes to share a reset signature')
  }
  if (resolved !== draft) throw new Error('expected equivalent newer base refresh to avoid replacing the active draft graph')
  if (changedResolved !== changedBase) throw new Error('expected changed newer base graph to replace the active draft graph')
}

export function testStoryboardWidgetBaseResetReconcilesCanonicalContentIntoNewerDraft() {
  const previousBase = graphWithNodeProperties(3, { prompt: 'Original prompt.', stable: 'base' })
  previousBase.nodes[0] = { ...previousBase.nodes[0]!, x: 0, y: 0 }
  const currentDraft = graphWithNodeProperties(8, { prompt: 'Original prompt.', stable: 'base', draftOnly: 'preserved' })
  currentDraft.nodes[0] = { ...currentDraft.nodes[0]!, x: 48, y: 32 }
  const nextBase = graphWithNodeProperties(4, { prompt: 'Canonical edited prompt.', stable: 'base' })
  nextBase.nodes[0] = { ...nextBase.nodes[0]!, x: 0, y: 0 }
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/example.md::',
    previousDocumentKey: 'docs/example.md::',
    currentDraftGraphData: currentDraft,
    nextBaseGraphData: nextBase,
    previousBaseGraphData: previousBase,
  })
  const node = resolved?.nodes[0]
  const properties = (node?.properties || {}) as Record<string, unknown>
  if (properties.prompt !== 'Canonical edited prompt.') throw new Error(`expected canonical base text to replace the stale draft value, got ${String(properties.prompt)}`)
  if (properties.draftOnly !== 'preserved') throw new Error('expected base reconciliation to preserve draft-only properties')
  if (node?.x !== 48 || node?.y !== 32) throw new Error(`expected base reconciliation to preserve draft-only layout, got ${node?.x},${node?.y}`)
  if (readGraphDataRevision(resolved) <= readGraphDataRevision(currentDraft)) throw new Error('expected reconciled draft revision to outrank both authorities')
}

export function testStoryboardWidgetBaseResetPreservesComposedSupersetAcrossNormalHistoryAppend() {
  const base = graph(7, ['n2'])
  const composedDraft = graph(8, ['ws:caca068a::n2', 'ws:caca068a::n18'])
  composedDraft.metadata = { ...composedDraft.metadata, sourceLayerComposition: 'compose' }
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agentic-graph.md::',
    previousDocumentKey: 'agentic-graph.md::',
    currentDraftGraphData: composedDraft,
    nextBaseGraphData: { ...base, nodes: [...base.nodes] },
    previousBaseGraphData: base,
  })
  if (resolved !== composedDraft) {
    throw new Error('expected an ordinary history append with a stale inner-id base to preserve the newer composed draft superset')
  }
}

export function testStoryboardWidgetBaseReparseKeepsOneCanonicalIdentityPerNode() {
  const previousBase = graph(7, ['n2'])
  const composedDraft = graph(9, ['ws:caca068a::n2', 'ws:caca068a::n18'])
  composedDraft.metadata = { ...composedDraft.metadata, sourceLayerComposition: 'compose' }
  const reparsedBase = graph(8, ['n2', 'n18'])
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agentic-graph.md::',
    previousDocumentKey: 'agentic-graph.md::',
    currentDraftGraphData: composedDraft,
    nextBaseGraphData: reparsedBase,
    previousBaseGraphData: previousBase,
  })
  const ids = (resolved?.nodes || []).map(node => String(node.id || '')).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['ws:caca068a::n18', 'ws:caca068a::n2'])) {
    throw new Error(`expected source reparse reconciliation to retain exactly one composed identity per node, got ${JSON.stringify(ids)}`)
  }
}

export function testStoryboardWidgetBaseResetDoesNotConflateAmbiguousInnerIdsAcrossLayers() {
  const base = graph(4, ['n1'])
  const ambiguousDraft = graph(5, ['ws:a::n1', 'ws:b::n1'])
  ambiguousDraft.metadata = { ...ambiguousDraft.metadata, sourceLayerComposition: 'compose' }
  const resolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agentic-graph.md::',
    previousDocumentKey: 'agentic-graph.md::',
    currentDraftGraphData: ambiguousDraft,
    nextBaseGraphData: base,
  })
  if (resolved !== base) {
    throw new Error('expected an unscoped inner id to remain incompatible with ambiguous same-inner nodes from multiple source layers')
  }
  const ambiguousBase = graph(6, ['ws:a::n1', 'ws:b::n1'])
  const unscopedDraft = graph(7, ['n1', 'n2', 'n3'])
  const reverseResolved = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agentic-graph.md::',
    previousDocumentKey: 'agentic-graph.md::',
    currentDraftGraphData: unscopedDraft,
    nextBaseGraphData: ambiguousBase,
    previousBaseGraphData: ambiguousBase,
  })
  if (reverseResolved !== ambiguousBase) {
    throw new Error('expected one unscoped inner id not to satisfy multiple same-inner base identities across source layers')
  }
}

export function testStoryboardWidgetBaseResetEffectKeysOffRevisionInsteadOfDerivedGraphIdentity() {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetRenderState.ts'), 'utf8')
  const storeSource = readFileSync(resolve(process.cwd(), 'src/hooks/useGraphStore.ts'), 'utf8')
  if (!source.includes('const storyboardWidgetBaseGraphDataRef = React.useRef(args.storyboardWidgetBaseGraphData)')) {
    throw new Error('expected the draft reset effect to read the latest derived base graph through a stable ref')
  }
  if (source.includes('[args.activeDocumentKey, args.baseGraphDataRevision, args.editorRuntimeActive, args.storyboardWidgetBaseGraphData]')) {
    throw new Error('expected derived graph object identity to stay out of the draft reset effect dependencies')
  }
  if (!source.includes('storyboardWidgetBaseContentSignature')) {
    throw new Error('expected derived base content changes to retrigger draft reconciliation without object-identity churn')
  }
  if (!source.includes('forceBaseReset: historyRestoreRevisionChanged') || !source.includes('args.historyRestoreRevision')) {
    throw new Error('expected only explicit history restoration to reset the Storyboard draft authority')
  }
  if (source.includes('forceBaseReset: historyIndexChanged') || source.includes('args.historyIndex')) {
    throw new Error('expected ordinary history snapshot recording to stop forcing a Storyboard draft reset')
  }
  if (!storeSource.includes('historyRestoreRevision: (get().historyRestoreRevision || 0) + 1')) {
    throw new Error('expected full store reset to advance the same monotonic restore revision used by Storyboard draft authority')
  }
  if (!storeSource.includes('resetAll: () => {\n    cancelScheduledHistoryCommit()')) {
    throw new Error('expected full store reset to cancel pending debounced history commits before clearing history')
  }
}
