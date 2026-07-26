import React from 'react'
import { createRoot } from 'react-dom/client'

import {
  beginTextSelectionWidgetLinkSession,
  buildTextSelectionWidgetEdge,
  buildTextSelectionWidgetEdgePersistenceProperties,
  clearTextSelectionWidgetLinkSession,
  hasOutgoingTextSelectionWidgetEdge,
  TEXT_SELECTION_WIDGET_CREATE_EVENT,
  getTextSelectionWidgetLinkSnapshot,
  isTextSelectionWidgetEdgePersisted,
  persistTextSelectionWidgetEdgeAfterTargetCreation,
  readTextSelectionWidgetEdgeProvenance,
  readTextSelectionWidgetSourceHighlights,
  resolveTextSelectionWidgetTargetPosition,
  TEXT_SELECTION_WIDGET_LINK_SCHEMA,
  type TextSelectionWidgetCreateDetail,
  TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY,
  TEXT_SELECTION_WIDGET_TARGET_PORT_KEY,
} from '@/lib/storyboardWidget/textSelectionWidgetLink'
import {
  buildStoryboardWidgetInsertionPlacement,
  captureStoryboardWidgetInsertionPlacement,
} from '@/lib/storyboardWidget/widgetInsertionPlacement'
import type { GraphData } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import WidgetPalette from '@/features/toolbar/WidgetPalette'
import { MarkdownInlineSelectionToolbar } from '@/lib/markdown-core/ui/MarkdownInlineSelectionToolbar'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import {
  collectTextSelectionProvenanceHighlightRects,
} from '@/lib/ui/textSelectionProvenanceHighlights'
import {
  buildSelectionProvenanceConnectorPath,
  resolveSelectionProvenanceOutputHandle,
} from '@/lib/ui/selectionProvenanceConnectorGeometry'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
} from '@/lib/graph/flowPorts'

export function testTextSelectionWidgetLinkBuildsTargetPlacementAndProvenanceEdge() {
  clearTextSelectionWidgetLinkSession()
  const session = beginTextSelectionWidgetLinkSession({
    sourceNodeId: 'source-panel',
    selectedText: '  selected source text  ',
    startLine: 12,
    endLine: 13,
    documentPath: 'notes/example.md',
  })
  if (!session || getTextSelectionWidgetLinkSnapshot() !== session) {
    throw new Error('expected the selected text to arm one active Widget-link session')
  }
  if (session.selectedText !== 'selected source text') {
    throw new Error(`expected normalized selected text, got ${JSON.stringify(session.selectedText)}`)
  }

  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'source-panel',
        type: 'RichMediaPanel',
        label: 'Source',
        x: 100,
        y: 220,
        properties: { 'visual:width': 720 },
      },
      {
        id: 'target-widget',
        type: 'TextGeneration',
        label: 'Target',
        x: 940,
        y: 220,
        properties: {},
      },
    ],
    edges: [],
  }
  const position = resolveTextSelectionWidgetTargetPosition({ sourceNode: graphData.nodes[0]! })
  if (position.x !== 940 || position.y !== 220) {
    throw new Error(`expected target placement beside the Rich Media source, got ${JSON.stringify(position)}`)
  }
  const edge = buildTextSelectionWidgetEdge({
    graphData,
    session,
    targetNodeId: 'target-widget',
  })
  if (!edge || edge.source !== 'source-panel' || edge.target !== 'target-widget' || edge.label !== 'selection') {
    throw new Error(`expected a source-to-target selection edge, got ${JSON.stringify(edge)}`)
  }
  if (edge.properties.schema !== TEXT_SELECTION_WIDGET_LINK_SCHEMA
    || edge.properties['selection:text'] !== 'selected source text'
    || edge.properties['selection:startLine'] !== 12
    || edge.properties['selection:endLine'] !== 13
    || edge.properties['selection:documentPath'] !== 'notes/example.md'
    || edge.properties['selection:targetFieldId'] !== 'prompt'
    || edge.properties[FLOW_EDGE_SOURCE_PORT_KEY] !== TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY
    || edge.properties[FLOW_EDGE_TARGET_PORT_KEY] !== TEXT_SELECTION_WIDGET_TARGET_PORT_KEY) {
    throw new Error(`expected persisted selection provenance, got ${JSON.stringify(edge.properties)}`)
  }
  const persistedProperties = buildTextSelectionWidgetEdgePersistenceProperties(edge)
  if (persistedProperties?.schema !== TEXT_SELECTION_WIDGET_LINK_SCHEMA
    || persistedProperties['selection:text'] !== 'selected source text'
    || persistedProperties['selection:startLine'] !== 12
    || persistedProperties['selection:endLine'] !== 13
    || persistedProperties['selection:targetFieldId'] !== 'prompt'
    || persistedProperties[FLOW_EDGE_SOURCE_PORT_KEY] !== TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY
    || persistedProperties[FLOW_EDGE_TARGET_PORT_KEY] !== TEXT_SELECTION_WIDGET_TARGET_PORT_KEY) {
    throw new Error(`expected durable frontmatter selection provenance, got ${JSON.stringify(persistedProperties)}`)
  }
  const provenance = readTextSelectionWidgetEdgeProvenance(edge)
  if (!provenance
    || provenance.selectedText !== 'selected source text'
    || provenance.documentPath !== 'notes/example.md'
    || provenance.startLine !== 12
    || provenance.endLine !== 13
    || provenance.targetFieldId !== 'prompt') {
    throw new Error(`expected canonical selection provenance readback, got ${JSON.stringify(provenance)}`)
  }

  graphData.edges.push(edge)
  const sourceHighlights = readTextSelectionWidgetSourceHighlights({
    graphData,
    sourceNodeId: 'source-panel',
  })
  if (sourceHighlights.length !== 1
    || sourceHighlights[0]?.edgeId !== edge.id
    || sourceHighlights[0]?.selectedText !== 'selected source text'
    || sourceHighlights[0]?.sourcePortKey !== TEXT_SELECTION_WIDGET_SOURCE_PORT_KEY
    || sourceHighlights[0]?.targetPortKey !== TEXT_SELECTION_WIDGET_TARGET_PORT_KEY
    || !hasOutgoingTextSelectionWidgetEdge({ graphData, sourceNodeId: 'source-panel' })) {
    throw new Error(`expected the source highlight to reuse canonical edge provenance, got ${JSON.stringify(sourceHighlights)}`)
  }
  const duplicate = buildTextSelectionWidgetEdge({
    graphData,
    session,
    targetNodeId: 'target-widget',
  })
  if (duplicate?.id !== edge.id) {
    throw new Error('expected repeated target creation to resolve the existing provenance edge')
  }
  const composedGraphData: GraphData = {
    ...graphData,
    nodes: graphData.nodes.map(node => ({ ...node, id: `workspace-layer::${node.id}` })),
    edges: [{
      ...edge,
      id: `workspace-layer::${edge.id}`,
      source: `workspace-layer::${edge.source}`,
      target: `workspace-layer::${edge.target}`,
    }],
  }
  if (!isTextSelectionWidgetEdgePersisted({ graphData: composedGraphData, edge })) {
    throw new Error('expected composed workspace edge identity to satisfy the post-write persistence proof')
  }
  const composedDuplicate = buildTextSelectionWidgetEdge({
    graphData: composedGraphData,
    session,
    targetNodeId: 'target-widget',
  })
  if (composedDuplicate?.id !== `workspace-layer::${edge.id}`) {
    throw new Error(
      `expected inner endpoint ids to resolve the existing composed edge, got ${JSON.stringify(composedDuplicate)}`,
    )
  }
  const composedEdge = buildTextSelectionWidgetEdge({
    graphData: {
      ...composedGraphData,
      edges: [{
        id: 'workspace-layer::e1',
        source: 'workspace-layer::unrelated-source',
        target: 'workspace-layer::unrelated-target',
        label: 'flow',
        properties: {},
      }],
    },
    session,
    targetNodeId: 'target-widget',
  })
  if (!composedEdge
    || composedEdge.id !== 'e2'
    || composedEdge.source !== 'workspace-layer::source-panel'
    || composedEdge.target !== 'workspace-layer::target-widget') {
    throw new Error(
      `expected inner ids to resolve against the composed graph without reusing e1, got ${JSON.stringify(composedEdge)}`,
    )
  }
  clearTextSelectionWidgetLinkSession()
  if (getTextSelectionWidgetLinkSnapshot() !== null) {
    throw new Error('expected completing or cancelling the flow to clear the active selection')
  }
}

export function testTextSelectionWidgetLinkProjectsExactSourceHighlightAndConnector() {
  const { dom, restore } = initJsdomHarness()
  try {
    const root = dom.window.document.createElement('section')
    root.innerHTML = [
      '<p data-start-line="1" data-end-line="1">selected source text outside the provenance range</p>',
      '<p data-start-line="12" data-end-line="13"><strong>selected source text</strong> inside the provenance range</p>',
    ].join('')
    dom.window.document.body.appendChild(root)
    Object.defineProperties(root, {
      clientWidth: { configurable: true, value: 400 },
      clientHeight: { configurable: true, value: 200 },
    })
    root.getBoundingClientRect = () => ({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 410,
      bottom: 220,
      width: 400,
      height: 200,
      toJSON: () => ({}),
    })
    Object.defineProperty(dom.window.Range.prototype, 'getClientRects', {
      configurable: true,
      value() {
        return [{
          x: 50,
          y: 60,
          left: 50,
          top: 60,
          right: 170,
          bottom: 78,
          width: 120,
          height: 18,
          toJSON: () => ({}),
        }]
      },
    })

    const rects = collectTextSelectionProvenanceHighlightRects({
      root,
      selections: [{
        edgeId: 'selection-edge',
        text: 'selected source text',
        startLine: 12,
        endLine: 13,
      }],
    })
    if (rects.length !== 1
      || rects[0]?.edgeId !== 'selection-edge'
      || rects[0]?.left !== 40
      || rects[0]?.top !== 40
      || rects[0]?.width !== 120
      || rects[0]?.height !== 18) {
      throw new Error(`expected one exact, line-scoped provenance highlight, got ${JSON.stringify(rects)}`)
    }
    const innerNodeOwner = dom.window.document.createElement('section')
    innerNodeOwner.setAttribute('data-node-id', 'n2')
    innerNodeOwner.appendChild(root)
    dom.window.document.body.appendChild(innerNodeOwner)
    const outerOverlayOwner = dom.window.document.createElement('section')
    outerOverlayOwner.setAttribute('data-node-id', 'workspace-layer::n2')
    const outputHandle = dom.window.document.createElement('button')
    outputHandle.setAttribute('data-kg-port-handle', '1')
    outputHandle.setAttribute('data-kg-port-dir', 'out')
    outputHandle.setAttribute('data-kg-port-node-id', 'workspace-layer::n2')
    outputHandle.setAttribute('data-kg-port-key', 'output')
    outerOverlayOwner.appendChild(outputHandle)
    dom.window.document.body.appendChild(outerOverlayOwner)
    const resolvedHandle = resolveSelectionProvenanceOutputHandle({
      root,
      sourceNodeId: 'n2',
      sourcePortKey: 'output',
    })
    if (resolvedHandle !== outputHandle) {
      throw new Error('expected the connector to resolve the canonical output handle across nested Rich Media overlay owners')
    }
    const path = buildSelectionProvenanceConnectorPath({
      source: { x: 170, y: 69 },
      target: { x: 400, y: 100 },
    })
    if (path !== 'M 170.00 69.00 C 266.60 69.00 303.40 100.00 400.00 100.00') {
      throw new Error(`expected a stable highlight-to-output-port connector, got ${JSON.stringify(path)}`)
    }
  } finally {
    restore()
  }
}

export function testTextSelectionWidgetInsertionPreservesExistingCollectivePlacement() {
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', source: 'markdown:notes/example.md' },
    nodes: [{ id: 'source-panel', type: 'RichMediaPanel', label: 'Source', properties: {} }],
    edges: [],
  }
  const graphKey = 'frontmatter-flow:markdown:notes/example.md'
  const snapshot = captureStoryboardWidgetInsertionPlacement({
    graphData,
    pinnedByGraphMetaKey: {
      [graphKey]: { 'source-panel': true, 'existing-widget': false },
    },
    pinnedByNodeId: { stale: true },
    screenByGraphMetaKey: {
      [graphKey]: { 'existing-widget': { left: 44, top: 88 } },
    },
    screenByNodeId: { stale: { left: 1, top: 2 } },
    worldByGraphMetaKey: {
      [graphKey]: { 'source-panel': { x: 120, y: 240 } },
    },
    worldByNodeId: { stale: { x: 3, y: 4 } },
  })
  const next = buildStoryboardWidgetInsertionPlacement({
    snapshot,
    targetNodeId: 'target-widget',
    targetWorldPosition: { x: 940, y: 240 },
    pinTargetInCanvas: true,
  })
  if (JSON.stringify(snapshot.pinnedByNodeId) !== JSON.stringify({
    'source-panel': true,
    'existing-widget': false,
  })) {
    throw new Error(`expected the document-scoped pinned map, got ${JSON.stringify(snapshot.pinnedByNodeId)}`)
  }
  if (next.worldByNodeId['source-panel']?.x !== 120 || next.worldByNodeId['source-panel']?.y !== 240) {
    throw new Error(`expected the source placement to stay unchanged, got ${JSON.stringify(next.worldByNodeId)}`)
  }
  if (next.screenByNodeId['existing-widget']?.left !== 44 || next.screenByNodeId['existing-widget']?.top !== 88) {
    throw new Error(`expected existing floating placement to stay unchanged, got ${JSON.stringify(next.screenByNodeId)}`)
  }
  if (next.pinnedByNodeId['target-widget'] !== true
    || next.worldByNodeId['target-widget']?.x !== 940
    || next.worldByNodeId['target-widget']?.y !== 240) {
    throw new Error(`expected only the inserted target to receive a new world anchor, got ${JSON.stringify(next)}`)
  }
}

export async function testTextSelectionWidgetLinkWaitsForCreatedTargetPublication() {
  const session = beginTextSelectionWidgetLinkSession({
    sourceNodeId: 'source-panel',
    selectedText: 'selected source text',
    startLine: 12,
    endLine: 13,
    documentPath: 'notes/example.md',
  })
  if (!session) throw new Error('expected an active selection-link session')

  let graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'source-panel',
      type: 'RichMediaPanel',
      label: 'Source',
      x: 100,
      y: 220,
      properties: {},
    }],
    edges: [],
  }
  let waitCount = 0
  let addEdgeCount = 0
  const result = await persistTextSelectionWidgetEdgeAfterTargetCreation({
    readGraphDataCandidates: () => [graphData],
    session,
    targetNodeId: 'target-widget',
    addEdge: edge => {
      addEdgeCount += 1
      graphData = { ...graphData, edges: [...graphData.edges, edge] }
    },
    waitForGraphMutation: async () => {
      waitCount += 1
      graphData = {
        ...graphData,
        nodes: [
          ...graphData.nodes,
          {
            id: 'target-widget',
            type: 'TextGeneration',
            label: 'Target',
            x: 940,
            y: 220,
            properties: {},
          },
        ],
      }
    },
  })

  if (result.kind !== 'persisted'
    || result.edge.source !== 'source-panel'
    || result.edge.target !== 'target-widget') {
    throw new Error(`expected the delayed target publication to persist its selection edge, got ${JSON.stringify(result)}`)
  }
  if (waitCount !== 1 || addEdgeCount !== 1 || graphData.edges.length !== 1) {
    throw new Error(
      `expected one bounded publication wait and one edge write, got ${JSON.stringify({
        waitCount,
        addEdgeCount,
        edgeCount: graphData.edges.length,
      })}`,
    )
  }
  clearTextSelectionWidgetLinkSession()
}

export async function testWidgetPaletteCreatesTargetFromActiveTextSelection() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const entry: WidgetRegistryEntry = {
      id: 'default/textGeneration',
      isEnabled: true,
      nodeTypeId: 'TextGeneration',
      widgetTypeId: 'default',
      formId: 'textGeneration',
      fields: [],
      ports: [],
      updatedAt: '2026-07-24T00:00:00.000Z',
    }
    const session = beginTextSelectionWidgetLinkSession({
      sourceNodeId: 'source-panel',
      selectedText: 'selected source text',
      startLine: 12,
      endLine: 13,
      documentPath: 'notes/example.md',
    })
    if (!session) throw new Error('expected an active selection-link session')

    let received: TextSelectionWidgetCreateDetail | null = null
    const onCreate = (event: Event) => {
      received = (event as CustomEvent<TextSelectionWidgetCreateDetail>).detail
      if (received) received.claimed = true
    }
    dom.window.addEventListener(TEXT_SELECTION_WIDGET_CREATE_EVENT, onCreate)

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(
      root,
      React.createElement(WidgetPalette, { entries: [entry], dragEnabled: true }),
      { window: dom.window, frames: 4 },
    )

    const header = String(container.textContent || '')
    if (!header.includes('Choose a target Widget to link to “selected source text”.')) {
      throw new Error(`expected active link-mode guidance, got ${JSON.stringify(header)}`)
    }
    const button = container.querySelector('[role="button"][aria-label="Create linked Widget Card Type 0"]')
    if (!(button instanceof dom.window.HTMLElement)) {
      throw new Error('expected the Widget palette entry to switch from drag mode to linked-create mode')
    }
    button.click()
    await new Promise<void>(resolve => dom.window.requestAnimationFrame(() => resolve()))

    if (!received || received.session !== session) {
      throw new Error('expected the palette click to dispatch the active selection session')
    }
    if (received.target.registryEntryId !== entry.id
      || received.target.nodeTypeId !== entry.nodeTypeId
      || received.target.layoutVariantId !== 'widget-card-type-0') {
      throw new Error(`expected the selected palette target contract, got ${JSON.stringify(received.target)}`)
    }
    dom.window.removeEventListener(TEXT_SELECTION_WIDGET_CREATE_EVENT, onCreate)
  } finally {
    clearTextSelectionWidgetLinkSession()
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testTextSelectionWidgetLinkKeepsMathAndAddsDistinctProvenanceAction() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  const anchor = dom.window.document.createElement('span')
  container.appendChild(anchor)
  dom.window.document.body.appendChild(container)
  const root = createRoot(container as unknown as HTMLElement)
  const toolbarRef = { current: null } as React.RefObject<HTMLElement | null>
  const anchorRef = { current: anchor } as React.RefObject<HTMLSpanElement | null>
  const actions: string[] = []

  try {
    await mountReactRoot(
      root,
      React.createElement(MarkdownInlineSelectionToolbar, {
        show: true,
        anchorRef,
        toolbarRef,
        holdToolbarInteraction: () => void 0,
        onToolbarInteractionEnd: () => void 0,
        floatingMenuButtonDangerClassName: '',
        floatingMenuButtonDisabledClassName: '',
        toolbarMenuClassName: '',
        toolbarMenuButtonClassName: '',
        toolbarMenuDividerClassName: '',
        applyTurnInto: () => void 0,
        applyToggleHeading: () => void 0,
        applyAlign: () => void 0,
        applyDraftAction: () => void 0,
        applyWrap: (left, right) => actions.push(`wrap:${left}${right}`),
        applyCreateLinkedWidget: () => actions.push('create-linked-widget'),
        applyComment: () => void 0,
        applyHighlightColor: () => void 0,
        applyColor: () => void 0,
        applyClearFormatting: () => void 0,
        applyChecklist: () => void 0,
        applyDivider: () => void 0,
        openSlashCommandMenu: () => void 0,
        openVariableCommandMenu: () => void 0,
        handleDuplicate: () => void 0,
        handleDelete: () => void 0,
      }),
      { window: dom.window, frames: 4 },
    )

    const mathButton = dom.window.document.querySelector('button[aria-label="Math"]')
    const provenanceButton = dom.window.document.querySelector(
      'button[aria-label="Create linked widget from selection"]',
    )
    if (!(mathButton instanceof dom.window.HTMLButtonElement)) {
      throw new Error('expected the ∑ Math action to remain present in link-enabled Rich Media editing')
    }
    if (mathButton.textContent?.trim() !== '∑' || mathButton.hasAttribute('data-kg-create-linked-widget')) {
      throw new Error('expected ∑ to remain exclusively bound to Math/LaTeX formatting')
    }
    if (!(provenanceButton instanceof dom.window.HTMLButtonElement)) {
      throw new Error('expected a separate provenance target-widget action')
    }
    const provenanceIcon = provenanceButton.querySelector('[data-kg-provenance-direction-icon="target"]')
    if (provenanceIcon?.textContent?.trim() !== '→') {
      throw new Error('expected the linked-target action to reuse the shared target-provenance glyph')
    }

    mathButton.click()
    provenanceButton.click()
    if (actions.join(',') !== 'wrap:$$,create-linked-widget') {
      throw new Error(`expected distinct Math and provenance actions, got ${JSON.stringify(actions)}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window })
    restore()
  }
}
