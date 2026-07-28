import { readFileSync } from 'node:fs'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { StoryboardCardMetaScrollRail } from '@/components/StoryboardWidgetCanvas/StoryboardCardMetaScrollRail'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
import type { GraphData } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { TEXT_SELECTION_WIDGET_LINK_SCHEMA } from '@/lib/storyboardWidget/textSelectionWidgetLink'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { waitForFrames } from '@/tests/lib/reactRootHarness'

const upstreamText = 'Upstream generated content must remain runtime input and never replace target-authored text.'

const graphData: GraphData = {
  type: 'Graph',
  nodes: [
    {
      id: 'source-widget',
      type: 'TextGeneration',
      label: 'Source Widget Card',
      properties: { lane: 'Widget Card', cardTypeLabel: 'Widget Card', output: upstreamText },
    },
    {
      id: 'target-widget',
      type: 'TextGeneration',
      label: 'Widget Card',
      properties: { lane: 'Widget Card', cardTypeLabel: 'Widget Card', prompt: '' },
    },
    {
      id: 'probe-target',
      type: 'TextGeneration',
      label: 'Probe-Tree Card',
      properties: { lane: 'Probe-Tree', cardTypeLabel: 'Probe-Tree Card', summary: '' },
    },
  ],
  edges: [],
}

const connectedPrompt: FlowConnectedValuesBySchemaPath = {
  'properties.prompt': {
    value: upstreamText,
    sources: [
      { edgeId: 'source-target-a', nodeId: 'source-widget', portKey: 'output' },
      { edgeId: 'source-target-b', nodeId: 'source-widget', portKey: 'output' },
    ],
  },
}

const connectedSummary: FlowConnectedValuesBySchemaPath = {
  'properties.summary': {
    value: upstreamText,
    sources: [{ edgeId: 'source-probe', nodeId: 'source-widget', portKey: 'output' }],
  },
}

export async function testStoryboardCardsRenderConnectedTextAsSourceChipsWithoutReplacingInput() {
  const board = buildStoryboardBoardModel({
    graphData,
    graphRevision: 1,
    connectedValuesByNodeId: new Map([
      ['target-widget', connectedPrompt],
      ['probe-target', connectedSummary],
    ]),
  })
  const cards = board.lanes.flatMap(lane => lane.cards)
  const target = cards.find(card => card.id === 'target-widget')
  const probeTarget = cards.find(card => card.id === 'probe-target')
  if (!target || !probeTarget) throw new Error(`expected connected target cards, got ${JSON.stringify(cards)}`)
  if (target.prompt || target.summary || target.output) {
    throw new Error(`expected connected text not to replace target-authored text, got ${JSON.stringify(target)}`)
  }
  if (target.sourceReferences?.length !== 1 || target.sourceReferences[0]?.label !== 'Source Widget Card') {
    throw new Error(`expected one deduplicated source Widget chip, got ${JSON.stringify(target.sourceReferences)}`)
  }
  if (target.sourceReferences[0]?.edgeIds.join(',') !== 'source-target-a,source-target-b') {
    throw new Error(`expected source chip to retain edge lineage, got ${JSON.stringify(target.sourceReferences[0])}`)
  }
  const targetTextModel = buildStoryboardCardTextModel(target)
  if (targetTextModel.primaryField.id !== 'prompt' || targetTextModel.primaryRaw !== '') {
    throw new Error(`expected an independent empty Prompt editor below the source chip, got ${JSON.stringify(targetTextModel)}`)
  }
  const probeTextModel = buildStoryboardCardTextModel(probeTarget)
  if (probeTextModel.primaryField.id !== 'summary' || probeTextModel.primaryRaw !== '') {
    throw new Error(`expected Probe-Tree to retain its independent Summary editor, got ${JSON.stringify(probeTextModel)}`)
  }

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const activatedSourceNodeIds: string[] = []
  const parentPointerEvents: string[] = []
  try {
    await act(async () => {
      root.render(
        <section
          onClick={() => parentPointerEvents.push('click')}
          onMouseDown={() => parentPointerEvents.push('mousedown')}
          onPointerDown={() => parentPointerEvents.push('pointerdown')}
        >
          <StoryboardCardMetaScrollRail card={target} onSourceReferenceActivate={reference => activatedSourceNodeIds.push(reference.nodeId)} />
        </section>,
      )
      await waitForFrames(dom.window, 4)
    })
    const chip = container.querySelector('[data-kg-storyboard-card-source-reference-chip="1"]')
    if (!(chip instanceof dom.window.HTMLElement)) throw new Error('expected source reference chip in the card metadata header')
    if (!(chip instanceof dom.window.HTMLButtonElement)) throw new Error('expected source reference chip to be an interactive button')
    if (chip.textContent?.trim() !== '←Source Widget Card') {
      throw new Error(`expected compact source title only, got ${JSON.stringify(chip.textContent)}`)
    }
    if (container.textContent?.includes(upstreamText)) throw new Error('expected source chip not to render upstream text')
    await act(async () => {
      chip.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))
      chip.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
      chip.click()
      await waitForFrames(dom.window, 2)
    })
    if (activatedSourceNodeIds.join(',') !== 'source-widget') {
      throw new Error(`expected source chip click to activate its connected upstream node, got ${JSON.stringify(activatedSourceNodeIds)}`)
    }
    if (parentPointerEvents.length !== 0) {
      throw new Error(`expected source chip activation not to trigger parent card pointer handlers, got ${JSON.stringify(parentPointerEvents)}`)
    }
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}

export async function testStoryboardCardProjectsCanonicalSelectionProvenanceAsSourceChip() {
  const provenanceGraph: GraphData = {
    ...graphData,
    edges: [{
      id: 'selection-source-target',
      source: 'source-widget',
      target: 'target-widget',
      label: 'selection',
      properties: {
        schema: TEXT_SELECTION_WIDGET_LINK_SCHEMA,
        'selection:text': 'Selected source evidence',
        'selection:startLine': 21,
        'selection:endLine': 23,
        'selection:documentPath': 'notes/provenance.md',
        'selection:createdAt': '2026-07-24T00:00:00.000Z',
        'selection:targetFieldId': 'prompt',
      },
    }],
  }
  const board = buildStoryboardBoardModel({
    graphData: provenanceGraph,
    graphRevision: 2,
    connectedValuesByNodeId: new Map(),
  })
  const target = board.lanes.flatMap(lane => lane.cards).find(card => card.id === 'target-widget')
  if (!target) throw new Error('expected the selection-linked target card')
  if (target.prompt || target.summary || target.output) {
    throw new Error(`expected provenance not to mutate target-authored text, got ${JSON.stringify(target)}`)
  }
  const reference = target.sourceReferences?.[0]
  if (!reference
    || reference.nodeId !== 'source-widget'
    || reference.edgeIds.join(',') !== 'selection-source-target'
    || reference.targetFieldIds.join(',') !== 'prompt'
    || reference.selectionProvenance?.[0]?.selectedText !== 'Selected source evidence') {
    throw new Error(`expected the canonical selection edge to project as a Source reference, got ${JSON.stringify(reference)}`)
  }

  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(<StoryboardCardMetaScrollRail card={target} />)
      await waitForFrames(dom.window, 4)
    })
    const chip = container.querySelector('[data-kg-storyboard-card-source-reference-chip="1"]')
    if (!(chip instanceof dom.window.HTMLButtonElement)) {
      throw new Error('expected a provenance Source chip')
    }
    if (chip.dataset.kgStoryboardCardSourceEdgeIds !== 'selection-source-target'
      || chip.dataset.kgStoryboardCardSourceProvenanceSchema !== TEXT_SELECTION_WIDGET_LINK_SCHEMA
      || chip.querySelector('[data-kg-storyboard-card-source-selection-range]')?.textContent !== 'L21–23') {
      throw new Error(`expected edge and line provenance on the Source chip, got ${chip.outerHTML}`)
    }
    if (!String(chip.title || '').includes('notes/provenance.md · L21–23')
      || !String(chip.title || '').includes('Selected source evidence')) {
      throw new Error(`expected the chip title to expose canonical selection provenance, got ${JSON.stringify(chip.title)}`)
    }
    const overlaySource = readFileSync(
      new URL('../components/StoryboardWidgetCanvas/StoryboardCardOverlayLayer2d.tsx', import.meta.url),
      'utf8',
    )
    const provenanceActivation = overlaySource.slice(
      overlaySource.indexOf('const provenance = reference.selectionProvenance?.[0]'),
      overlaySource.indexOf('const runCard = React.useCallback'),
    )
    if (!provenanceActivation.includes("selectNode(nodeId)\n      requestZoom('selection')\n      emitStoryboardCardProvenanceFocus({")
      || provenanceActivation.includes('requestZoomBounds')) {
      throw new Error('expected provenance Source chips to select and zoom the canonical source node before revealing its exact text')
    }
  } finally {
    await act(async () => root.unmount())
    restore()
  }
}

export function testStoryboardCardSelectionProvenanceSupportsWrappedFrontmatterNodeIds() {
  const wrappedId = (value: string) => ({ key: 'id', type: 'string', value })
  const wrappedGraph = {
    type: 'Graph',
    nodes: [
      {
        id: wrappedId('source-node'),
        type: { key: 'type', type: 'string', value: 'RichMediaPanel' },
        label: { key: 'label', type: 'string', value: 'Source panel' },
        properties: {},
      },
      {
        id: wrappedId('target-node'),
        type: { key: 'type', type: 'string', value: 'TextGeneration' },
        label: { key: 'label', type: 'string', value: 'Target card' },
        properties: {},
      },
    ],
    edges: [
      {
        id: 'selection-edge',
        source: wrappedId('source-node'),
        target: wrappedId('target-node'),
        label: 'selection',
        properties: {
          schema: { key: 'schema', type: 'string', value: TEXT_SELECTION_WIDGET_LINK_SCHEMA },
          'selection:text': { key: 'selection:text', type: 'string', value: 'Selected source text' },
          'selection:startLine': { key: 'selection:startLine', type: 'number', value: 4 },
          'selection:endLine': { key: 'selection:endLine', type: 'number', value: 5 },
          'selection:targetFieldId': { key: 'selection:targetFieldId', type: 'string', value: 'prompt' },
        },
      },
    ],
  } as unknown as GraphData

  const board = buildStoryboardBoardModel({
    graphData: wrappedGraph,
    graphRevision: 3,
    connectedValuesByNodeId: new Map(),
  })
  const target = board.lanes.flatMap(lane => lane.cards).find(card => card.id === 'target-node')
  const reference = target?.sourceReferences?.[0]
  if (!target || !reference
    || reference.nodeId !== 'source-node'
    || reference.edgeIds.join(',') !== 'selection-edge'
    || reference.selectionProvenance?.[0]?.startLine !== 4) {
    throw new Error(`expected wrapped frontmatter IDs to retain selection provenance, got ${JSON.stringify(target)}`)
  }
}
