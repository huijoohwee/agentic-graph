import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { renderMermaidFrontmatterGeometry } from '@/lib/mermaid/mermaidFrontmatterGeometry'
import type { GraphData } from '@/lib/graph/types'

export async function testMermaidFrontmatterGeometryReusesSharedRenderSeam() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()

  const geometryPath = resolve(process.cwd(), 'src', 'lib', 'mermaid', 'mermaidFrontmatterGeometry.ts')
  const geometryText = readFileSync(geometryPath, 'utf8')

  if (!geometryText.includes('export async function renderMermaidFrontmatterGeometry')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared renderMermaidFrontmatterGeometry helper')
  }
  if (!geometryText.includes('const rendered = await renderMermaidFrontmatterGeometry({')) {
    throw new Error('expected applyMermaidFrontmatterGeometryToGraphData to reuse shared renderMermaidFrontmatterGeometry helper')
  }
  if (!geometryText.includes('const prepareMermaidFrontmatterGraphBindings = (graphData: GraphData): MermaidFrontmatterGraphBindings => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared prepareMermaidFrontmatterGraphBindings helper')
  }
  if (!geometryText.includes('const matchMermaidEdgeGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared matchMermaidEdgeGeometry helper')
  }
  if (!geometryText.includes('const assignFallbackMermaidEdgeGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared assignFallbackMermaidEdgeGeometry helper')
  }
  if (!geometryText.includes('const applyMermaidNodeGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared applyMermaidNodeGeometry helper')
  }
  if (!geometryText.includes('const applyMermaidSubgraphGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared applyMermaidSubgraphGeometry helper')
  }
  if (!geometryText.includes('const finalizeMermaidFrontmatterGraph = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared finalizeMermaidFrontmatterGraph helper')
  }
  if (!geometryText.includes("import { readNodeProperties } from '@/lib/graph/nodeProperties'")) {
    throw new Error('expected mermaidFrontmatterGeometry to reuse the shared node property reader upstream')
  }
  if (!geometryText.includes("import { toMetadataRecord } from '@/lib/graph/documentMetadata'")) {
    throw new Error('expected mermaidFrontmatterGeometry to reuse the shared document metadata coercion helper upstream')
  }
  if (!geometryText.includes('const resolveMermaidFrontmatterRenderInput = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared resolveMermaidFrontmatterRenderInput helper')
  }
  if (!geometryText.includes('const findFrontmatterMermaidDiagramNode = (graphData: GraphData): GraphNode | null => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid source-node discovery helper')
  }
  if (!geometryText.includes('const readFrontmatterMermaidDiagramProps = (graphData: GraphData): Record<string, unknown> | null => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid diagram-property reader helper')
  }
  if (!geometryText.includes('const readFrontmatterMermaidCodeFromProps = (props: Record<string, unknown> | null): string => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid code reader helper')
  }
  if (!geometryText.includes("const resolveMermaidFrontmatterTheme = (theme?: MermaidTheme): MermaidTheme => {")) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid theme resolver helper')
  }
  if (!geometryText.includes('const executeMermaidFrontmatterRender = async (')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid render-execution helper')
  }
  if (!geometryText.includes('const canRenderMermaidFrontmatterGeometry = (): boolean => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid render environment helper')
  }
  if (!geometryText.includes('const buildMermaidFrontmatterRenderResult = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid SVG result builder helper')
  }
  if (!geometryText.includes('const readMermaidFrontmatterSvgGeometry = (svg: string): MermaidFrontmatterSvgGeometry => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid SVG geometry reader helper')
  }
  if (!geometryText.includes('const hydrateMermaidEdgeLabelGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared Mermaid edge-label hydration helper inside SVG geometry parsing')
  }
  if (!geometryText.includes('const readMermaidEdgeGeometry = (args: {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared Mermaid base edge geometry reader inside SVG geometry parsing')
  }
  if (!geometryText.includes('const renderMermaidFrontmatterSvgCached = async (')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid cached SVG render helper')
  }
  if (!geometryText.includes("const resolveMermaidFrontmatterCachedRenderTheme = (")) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid cached render theme helper')
  }
  if (!geometryText.includes('const isFrontmatterMermaidDiagramProps = (props: Record<string, unknown> | null): boolean => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to expose shared frontmatter Mermaid diagram-property classification helper')
  }
  if (!geometryText.includes('return isFrontmatterMermaidDiagramProps(readNodeProperties(n))')) {
    throw new Error('expected frontmatter Mermaid diagram classifier to delegate property gating to the shared node property helper')
  }
  if (!geometryText.includes('return readNodeProperties(node)')) {
    throw new Error('expected frontmatter Mermaid diagram-property reader to reuse the shared node property helper')
  }
  if (!geometryText.includes('return readFrontmatterMermaidCodeFromProps(readFrontmatterMermaidDiagramProps(graphData))')) {
    throw new Error('expected frontmatter Mermaid code reader to compose shared diagram-property and code reader helpers')
  }
  if (!geometryText.includes('theme: resolveMermaidFrontmatterTheme(args.theme)')) {
    throw new Error('expected Mermaid frontmatter render input resolution to compose the shared theme resolver helper')
  }
  if (!geometryText.includes('return executeMermaidFrontmatterRender(renderInput)')) {
    throw new Error('expected Mermaid frontmatter renderer to delegate cached render execution to the shared render-execution helper')
  }
  if (!geometryText.includes('if (!canRenderMermaidFrontmatterGeometry()) return null')) {
    throw new Error('expected shared frontmatter Mermaid render-execution helper to delegate environment gating to the shared render environment helper')
  }
  if (!geometryText.includes('return buildMermaidFrontmatterRenderResult({')) {
    throw new Error('expected shared frontmatter Mermaid render-execution helper to delegate SVG result assembly to the shared result builder helper')
  }
  if (!geometryText.includes('geometry: readMermaidFrontmatterSvgGeometry(args.svg)')) {
    throw new Error('expected shared frontmatter Mermaid result builder to delegate SVG geometry parsing to the shared geometry reader helper')
  }
  if (!geometryText.includes('hydrateMermaidEdgeLabelGeometry({ edges, labelEls })')) {
    throw new Error('expected Mermaid SVG geometry parsing to delegate edge-label hydration to the shared helper')
  }
  if (!geometryText.includes('const geometry = readMermaidEdgeGeometry({')) {
    throw new Error('expected Mermaid SVG geometry parsing to delegate base edge extraction to the shared edge geometry reader helper')
  }
  if (!geometryText.includes('svg: await renderMermaidFrontmatterSvgCached(renderInput)')) {
    throw new Error('expected shared frontmatter Mermaid render-execution helper to delegate cached SVG rendering to the shared cached render helper')
  }
  if (!geometryText.includes('theme: resolveMermaidFrontmatterCachedRenderTheme(renderInput.theme)')) {
    throw new Error('expected shared frontmatter Mermaid cached SVG render helper to delegate theme coercion to the shared cached render theme helper')
  }
  if (!geometryText.includes('const resolveMermaidImageMediaKind = (imageUrl: string): \'image\' | \'svg\' => {')) {
    throw new Error('expected mermaidFrontmatterGeometry SSOT to centralize Mermaid image media-kind derivation')
  }
  if (!geometryText.includes('const edgeIdx = args.edgeIndexById.get(edgeId)')) {
    throw new Error('expected frontmatter Mermaid edge matching helper to reuse indexed edge lookups instead of repeated findIndex scans')
  }
  if (!geometryText.includes('applyMermaidEdgeVisual({')) {
    throw new Error('expected frontmatter Mermaid edge matching and fallback helpers to reuse shared edge-visual mutation helper')
  }
  if (!geometryText.includes("const readEdgeProperties = (edge: Pick<GraphEdge, 'properties'> | null | undefined): Record<string, unknown> | null => {")) {
    throw new Error('expected mermaidFrontmatterGeometry to centralize edge property coercion in one local helper')
  }
  if (!geometryText.includes('const properties = readEdgeProperties(current) || {}')) {
    throw new Error('expected Mermaid edge-visual writes to reuse the shared local edge property helper instead of coercing inline')
  }
  if (!geometryText.includes('const properties = readEdgeProperties(edge)')) {
    throw new Error('expected Mermaid fallback edge matching to reuse the shared local edge property helper instead of coercing inline')
  }
  if (!geometryText.includes('applyMermaidNodeGeometry({')) {
    throw new Error('expected frontmatter Mermaid geometry applier to reuse shared node geometry mutation helper')
  }
  if (!geometryText.includes('applyMermaidSubgraphGeometry({')) {
    throw new Error('expected frontmatter Mermaid geometry applier to reuse shared subgraph geometry mutation helper')
  }
  if (!geometryText.includes('return finalizeMermaidFrontmatterGraph({')) {
    throw new Error('expected frontmatter Mermaid geometry applier to reuse shared graph finalization helper')
  }
  if (!geometryText.includes("layoutEngine: 'mermaid'")) {
    throw new Error('expected shared graph finalization helper to preserve Mermaid layout engine metadata')
  }
  if (!geometryText.includes('...toMetadataRecord(args.graphData.metadata),')) {
    throw new Error('expected shared graph finalization helper to reuse the shared document metadata coercion helper before writing Mermaid layout metadata')
  }
  if (!geometryText.includes('const m = toMetadataRecord(n.metadata)')) {
    throw new Error('expected Mermaid block-order metadata reads to reuse the shared document metadata coercion helper')
  }
  if (geometryText.includes("const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null")) {
    throw new Error('expected Mermaid block-order metadata reads to stop coercing metadata inline')
  }
  if (!geometryText.includes('const renderInput = resolveMermaidFrontmatterRenderInput(args)')) {
    throw new Error('expected Mermaid frontmatter renderer to reuse shared render input resolution helper')
  }

  try {
    ;(globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__ = {
      registerLayoutLoaders: () => void 0,
      initialize: () => void 0,
      render: async () => ({
        svg: [
          '<svg viewBox="0 0 120 80">',
          '<g class="node" data-id="A" transform="translate(30,40)"><rect width="100" height="40" /></g>',
          '</svg>',
        ].join(''),
      }),
    }

    const graphData: GraphData = {
      type: 'graph',
      context: 'frontmatter-mermaid',
      nodes: [
        {
          id: 'diagram-1',
          type: 'MermaidDiagram',
          label: 'Diagram',
          properties: { code: 'graph TD\nA[Node A]', mermaidScope: 'frontmatter', isMermaidFrontmatter: true },
        },
      ],
      edges: [],
    }

    const result = await renderMermaidFrontmatterGeometry({ graphData, theme: 'light' })
    if (!result) throw new Error('expected shared frontmatter Mermaid seam to render geometry')
    if (result.theme !== 'light') throw new Error(`expected shared frontmatter Mermaid seam to preserve requested theme, got ${result.theme}`)
    if (result.code !== 'graph TD\nA[Node A]') throw new Error(`expected shared frontmatter Mermaid seam to preserve resolved code, got ${JSON.stringify(result.code)}`)
    if (result.geometry.nodes.length !== 1) throw new Error(`expected shared frontmatter Mermaid seam to parse one Mermaid node, got ${result.geometry.nodes.length}`)
    if (result.geometry.nodes[0]?.name !== 'A') throw new Error(`expected parsed Mermaid node name A, got ${String(result.geometry.nodes[0]?.name || '')}`)
  } finally {
    try {
      delete (globalThis as unknown as { __AG_TEST_MERMAID_API__?: unknown }).__AG_TEST_MERMAID_API__
    } catch {
      void 0
    }
    try {
      restoreDom()
    } catch {
      void 0
    }
    try {
      restoreWindow()
    } catch {
      void 0
    }
  }
}
