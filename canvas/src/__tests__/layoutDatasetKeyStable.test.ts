import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeLayoutDatasetKey } from '@/lib/canvas/layoutPositioning'

export const testLayoutDatasetKeyStableAcrossRevision = () => {
  const graphData = {
    nodes: Array.from({ length: 120 }).map((_, i) => ({ id: `n${i}`, type: 'Node', properties: {} })),
    edges: Array.from({ length: 180 }).map((_, i) => ({ source: `n${i % 120}`, target: `n${(i * 7) % 120}`, label: 'rel' })),
    metadata: {},
  }

  const k1 = computeLayoutDatasetKey({ graphData: graphData as any, graphDataRevision: 1 })
  const k2 = computeLayoutDatasetKey({ graphData: graphData as any, graphDataRevision: 2 })
  if (k1 !== k2) throw new Error(`expected datasetKey stable across revision bumps, got ${k1} vs ${k2}`)

  const graphData2 = {
    ...graphData,
    nodes: [...graphData.nodes, { id: 'n_new', type: 'Node', properties: {} }],
  }
  const k3 = computeLayoutDatasetKey({ graphData: graphData2 as any, graphDataRevision: 3 })
  if (k3 === k2) throw new Error('expected datasetKey to change when graph shape changes')
}

export const testLayoutDatasetKeyReusesSharedReaders = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'canvas', 'layoutPositioning.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { toMetadataRecord } from '@/lib/graph/documentMetadata'")) {
    throw new Error('expected layout dataset key helper to reuse the shared document metadata reader upstream')
  }
  if (!text.includes("import { readNodeProperties } from '@/lib/graph/nodeProperties'")) {
    throw new Error('expected layout dataset key helper to reuse the shared node properties reader upstream')
  }
  if (!text.includes('const meta = toMetadataRecord(graphData?.metadata)')) {
    throw new Error('expected layout dataset key graph metadata reads to reuse the shared document metadata reader')
  }
  if (!text.includes("const props = readNodeProperties(n as Pick<GraphNode, 'properties'> | null | undefined)")) {
    throw new Error('expected layout dataset key document node property reads to reuse the shared node properties reader')
  }
  if (!text.includes('const nMeta = toMetadataRecord(n?.metadata)')) {
    throw new Error('expected layout dataset key document node metadata reads to reuse the shared document metadata reader')
  }
  if (text.includes('function isRecord(v: unknown): v is Record<string, unknown> {')) {
    throw new Error('expected layout dataset key helper to stop defining a local record guard')
  }
}
