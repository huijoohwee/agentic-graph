import {
  areGraphDataPreviewSyncContentsEqual,
  hashGraphDataForPreviewSync,
} from '@/hooks/store/graphDataSliceUtils'

export function testPreviewSyncHashIgnoresRevisionAndHash() {
  const base = {
    metadata: {
      kind: 'test',
      source: 'local',
    },
    nodes: [{ id: 'a', label: 'a', type: 'T', properties: {} }],
    edges: [{ id: 'e', source: 'a', target: 'a', label: 'e', properties: {} }],
  }

  const a = {
    ...base,
    metadata: {
      ...(base.metadata as Record<string, unknown>),
      graphDataRevision: 1,
      hash: 'rev:1',
    },
  }
  const b = {
    ...base,
    metadata: {
      ...(base.metadata as Record<string, unknown>),
      graphDataRevision: 999,
      hash: 'rev:999',
    },
  }

  const ha = hashGraphDataForPreviewSync(a)
  const hb = hashGraphDataForPreviewSync(b)
  if (!ha || !hb) throw new Error('expected preview hash to be non-empty')
  if (ha !== hb) throw new Error('expected preview hash to ignore revision/hash metadata')
}

export function testPreviewSyncContentEqualityRejectsSameTopologyOutputChanges() {
  const base = {
    metadata: { kind: 'frontmatter-flow', graphDataRevision: 4, hash: 'rev:4' },
    nodes: [
      { id: 'n1', label: 'Widget Card', type: 'TextGeneration', properties: { prompt: '@agentic-graph.probe-tree' } },
      { id: 'n2', label: 'Rich Media Panel', type: 'RichMediaPanel', properties: { media_interactive: true } },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'output', properties: {} }],
  }
  const published = {
    ...base,
    metadata: { ...base.metadata, graphDataRevision: 9, hash: 'rev:9' },
    nodes: [
      base.nodes[0],
      {
        ...base.nodes[1],
        label: 'Probe-Tree Branches',
        properties: {
          media_interactive: true,
          output: '# Probe-Tree Branches',
          richMediaActiveTab: 'text',
          workflowOutputKey: 'probe-tree-branches',
        },
      },
    ],
  }

  if (hashGraphDataForPreviewSync(base) !== hashGraphDataForPreviewSync(published)) {
    throw new Error('expected the fast preview hash to remain topology-oriented for the regression fixture')
  }
  if (areGraphDataPreviewSyncContentsEqual(base, published)) {
    throw new Error('expected exact preview-sync equality to reject a same-topology Rich Media output change')
  }
}
