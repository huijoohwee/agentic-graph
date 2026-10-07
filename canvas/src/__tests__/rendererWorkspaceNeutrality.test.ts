import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testWorkspaceJsonPipelineStaysNeutralAndFileAgnostic() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'active-graph-data', 'workspaceStructuredGraph.ts'), 'utf8')
  const perDocumentUiStateText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'persistence', 'perDocumentUiState.ts'), 'utf8')
  const canvasSliceText = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'canvasSlice.ts'), 'utf8')
  if (!text.includes("const WORKSPACE_GRAPH_PARSE_HINT = 'workspace:inline-data'")) {
    throw new Error('expected neutral inline workspace parse hint for JSON fallback parsing')
  }
  if (text.includes("parseGraph(name || 'workspace.json', text)")) {
    throw new Error('expected workspace JSON fallback parsing to avoid file-specific workspace.json')
  }
  if (text.includes("parseGraph(name || 'workspace.data.json', text)")) {
    throw new Error('expected workspace JSON fallback parsing to avoid hardcoded .json file hints')
  }
  if (!text.includes('buildFlowchartSourceMeta({')) {
    throw new Error('expected workspace flowchart parsing to carry shared source metadata')
  }
  if (!text.includes("const WORKSPACE_GRAPH_SOURCE = 'workspace:graph'")) {
    throw new Error('expected workspace JSON pipeline to use a neutral workspace graph source identity')
  }
  if (!text.includes("const WORKSPACE_GRAPH_SOURCE_KIND = 'workspace'")) {
    throw new Error('expected workspace JSON pipeline to tag workspace source kind explicitly')
  }
  if (text.includes('return { ...graphData, nodes: [], edges: [] }')) {
    throw new Error('expected flowchart path to avoid synthetic empty graph placeholders')
  }
  if (!perDocumentUiStateText.includes('isCanvas2dRendererId(record.canvas2dRenderer)')) {
    throw new Error('expected per-document UI persistence to reuse the shared 2D renderer id validator')
  }
  if (!canvasSliceText.includes('isCanvas2dRendererId(v) ? v : DEFAULT_CANVAS_2D_RENDERER')) {
    throw new Error('expected canvas slice bootstrap to reuse the shared 2D renderer id validator')
  }
}
