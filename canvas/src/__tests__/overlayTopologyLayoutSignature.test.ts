import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildOverlayNodeLayoutSignature,
  buildOverlayTopologyLayoutSignature,
} from '@/lib/storyboardWidget/overlayTopologyLayoutSignature'
import type { GraphData } from '@/lib/graph/types'

export const testOverlayTopologyLayoutSignatureReusesSharedNodePropertiesReader = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'overlayTopologyLayoutSignature.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { readNodeProperties } from '@/lib/graph/nodeProperties'")) {
    throw new Error('expected overlay topology layout signature to reuse the shared node properties reader upstream')
  }
  if (!text.includes('const props = readNodeProperties(node)')) {
    throw new Error('expected overlay topology layout signature to reuse the shared node properties reader for node layout props')
  }
  if (text.includes("const props = (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) ? node.properties as Record<string, unknown> : {}")) {
    throw new Error('expected overlay topology layout signature to stop coercing node properties inline')
  }
}

export const testOverlayTopologyLayoutSignatureIncludesVisualLayoutProps = () => {
  const signature = buildOverlayTopologyLayoutSignature({
    type: 'GraphData',
    nodes: [
      {
        id: 'overlay:node-a',
        type: 'Widget',
        properties: {
          'visual:width': 120,
          'visual:height': 80,
          'visual:minWidth': 60,
          'visual:minHeight': 40,
          'visual:zIndex': '5',
          'flow:widgetFormId': 'demo-form',
        },
      },
    ],
    edges: [],
  } as never)
  const changedSignature = buildOverlayTopologyLayoutSignature({
    type: 'GraphData',
    nodes: [
      {
        id: 'overlay:node-a',
        type: 'Widget',
        properties: {
          'visual:width': 121,
          'visual:height': 80,
          'visual:minWidth': 60,
          'visual:minHeight': 40,
          'visual:zIndex': '5',
          'flow:widgetFormId': 'demo-form',
        },
      },
    ],
    edges: [],
  } as never)
  if (!signature || !changedSignature) throw new Error('expected overlay topology layout signatures to be produced')
  if (signature === changedSignature) {
    throw new Error('expected visual layout property changes to affect the overlay topology layout signature')
  }
}

export const testOverlayNodeLayoutSignatureIgnoresProvenanceEdgePublication = () => {
  const base: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'source', type: 'RichMediaPanel', label: 'Source', properties: { 'visual:width': 640 } },
      { id: 'target', type: 'TextGeneration', label: 'Target', properties: { 'visual:width': 400 } },
    ],
    edges: [],
  }
  const withEdge: GraphData = {
    ...base,
    edges: [{
      id: 'selection-edge',
      source: 'source',
      target: 'target',
      label: 'selection',
      properties: { schema: 'agentic-graph-text-selection-widget-link/v1' },
    }],
  }
  if (buildOverlayNodeLayoutSignature(base) !== buildOverlayNodeLayoutSignature(withEdge)) {
    throw new Error('expected edge publication not to invalidate authored node placement')
  }
  if (buildOverlayTopologyLayoutSignature(base) === buildOverlayTopologyLayoutSignature(withEdge)) {
    throw new Error('expected the full topology signature to keep invalidating overlay edge rendering')
  }
}
