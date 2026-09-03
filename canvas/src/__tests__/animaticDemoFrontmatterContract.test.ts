import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

const DEMO_DOC_PATH = path.resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs', 'agentic-graph-animatic-demo.md')
const normalizeSpace = (value: string): string => String(value || '').replace(/\s+/g, ' ').trim()

export function testAnimaticDemoReusesSharedFlowFrontmatterContract() {
  const text = readFileSync(DEMO_DOC_PATH, 'utf8')
  const preset = parseCanvasWorkspaceFrontmatterPreset(text)
  if (!preset) {
    throw new Error('expected Gantt-timeline demo to expose a parseable canvas frontmatter preset')
  }
  if (preset.canvasSurfaceMode !== '2d' || preset.canvasRenderMode !== '2d') {
    throw new Error(`expected Gantt-timeline demo to stay on the explicit 2d surface/render preset, got ${JSON.stringify(preset)}`)
  }
  if (preset.canvas2dRenderer !== 'gantt') {
    throw new Error(`expected Gantt-timeline demo to land on the Gantt renderer, got ${String(preset.canvas2dRenderer)}`)
  }
  if (preset.documentSemanticMode !== 'document' || preset.frontmatterModeEnabled !== true) {
    throw new Error(`expected Gantt-timeline demo to stay document/frontmatter driven, got ${JSON.stringify(preset)}`)
  }
  if (preset.multiDimTableModeEnabled !== false || preset.documentStructureBaselineLock !== false) {
    throw new Error(`expected Gantt-timeline demo to keep non-Gantt mode toggles explicit, got ${JSON.stringify(preset)}`)
  }
  if (!text.includes('\nflow:\n')) {
    throw new Error('expected Gantt-timeline demo to reuse the shared flow: frontmatter graph contract')
  }
  if (!text.includes('\nflow_diagrams:\n') || !text.includes('type: mermaid_gantt')) {
    throw new Error('expected Gantt-timeline demo to keep typed Mermaid Gantt source in shared flow_diagrams frontmatter')
  }
  for (const snippet of ['dateFormat HH:mm', 'axisFormat %H:%M', 'Initial vert : vert, v1, 17:30, 2m', 'Task A : 3m', 'Task B : 8m', 'Final vert : vert, v2, 17:58, 4m']) {
    if (!text.includes(snippet)) {
      throw new Error(`expected Gantt-timeline demo to keep Mermaid Gantt syntax snippet: ${snippet}`)
    }
  }
  if (!text.includes('GANTT_TIMELINE_SOURCE') || !text.includes('GANTT_TIMELINE_CANVAS') || !text.includes('GANTT_TIMELINE_BOTTOM_PANEL') || !text.includes('GANTT_TIMELINE_FLOATING_PANEL')) {
    throw new Error('expected Gantt-timeline demo to define Canvas, BottomPanel, and FloatingPanel flow nodes')
  }
  if (/^animatic:\s*$/m.test(text) || text.includes('kgCanvas2dRenderer: "animatic"')) {
    throw new Error('expected Gantt-timeline demo to avoid stale Animatic renderer frontmatter')
  }
}

export function testAnimaticDemoRetainsReferenceSwitchContractSnippet() {
  const text = readFileSync(DEMO_DOC_PATH, 'utf8')
  const normalizedText = normalizeSpace(text)
  if (!normalizedText.includes('Canvas `2D Renderer: Gantt-timeline`, BottomPanel `Gantt-Timeline`, and FloatingPanel `Gantt-Timeline`')) {
    throw new Error('expected Gantt-timeline demo body to describe the shared synced surfaces')
  }
  for (const forbiddenSnippet of ['react-timeline-editor', 'xzdarcy/react-timeline-editor', 'fixture-only demo rows', '2D Renderer: Animatic', 'player-config']) {
    if (text.includes(forbiddenSnippet)) {
      throw new Error(`expected Gantt-timeline demo to avoid stale Animatic/vendor wording: ${forbiddenSnippet}`)
  }
}
}
