import assert from 'node:assert/strict'
import { resolveWorkflowTimelineLanes, resolveWorkflowTimelineLaneId } from '../components/timeline/videoSequenceTimelineRulerGeometry'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}

function readRuleBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`missing CSS rule: ${selector}`)
  const bodyStart = source.indexOf('{', start)
  const bodyEnd = source.indexOf('}', bodyStart)
  return source.slice(bodyStart + 1, bodyEnd)
}

export function testVideoSequenceTimelineRulerUsesSingleScrollOwner() {
  const controlsCssText = ['TimelineTransportControls.css', 'TimelineTransportPlayer.css', 'TimelineTransportControlsMermaidGantt.css'].map(file => readSource('components', 'timeline', file)).join('\n')
  const mermaidCssText = readSource('components', 'timeline', 'TimelineTransportControlsMermaidGantt.css')
  const rulerText = readSource('components', 'timeline', 'VideoSequenceTimelineRuler.tsx')
  const scrollRule = readRuleBlock(controlsCssText, '.timeline-video-sequence-ruler-scroll')
  const contentRule = readRuleBlock(controlsCssText, '.timeline-video-sequence-ruler-content')
  if (
    !scrollRule.includes('overflow: auto;') ||
    scrollRule.includes('overflow-y: hidden') ||
    !contentRule.includes('overflow: visible;') ||
    contentRule.includes('overflow-y: auto') ||
    !rulerText.includes('const rulerScrollRef = React.useRef<HTMLElement | null>(null)') ||
    !rulerText.includes('const scroller = rulerScrollRef.current') ||
    !rulerText.includes('ref={setRulerScrollElement}') ||
    mermaidCssText.includes('.timeline-video-sequence-ruler-scroll-content,\n.timeline-transport-chrome--mermaid-gantt .timeline-video-sequence-ruler-content') ||
    mermaidCssText.includes('.timeline-video-sequence-ruler-content {\n  height: 100%;')
  ) {
    throw new Error('expected video sequence ruler rail to own both horizontal and vertical scroll without nested lane-body overflow')
  }
}

export function testWorkflowTimelineRowsUseDistinctStableLanesWithoutChangingLegacyProjection() {
  const rows = [{ rowKey: 'option-a:one', label: 'First activity' }, { rowKey: 'option-a:two', label: 'Second activity' }]
  assert.deepEqual(resolveWorkflowTimelineLanes(rows), [{ id: 'workflow', label: 'Workflow', semanticId: 'video' }])
  const lanes = resolveWorkflowTimelineLanes(rows, true)
  assert.deepEqual(lanes.map(lane => lane.label), rows.map(row => row.label))
  assert.deepEqual(lanes.map(lane => lane.id), rows.map(row => resolveWorkflowTimelineLaneId(row.rowKey, true)))
  assert.equal(new Set(lanes.map(lane => lane.id)).size, 2)
  assert.deepEqual(resolveWorkflowTimelineLanes([], true), [])
  assert.throws(() => resolveWorkflowTimelineLanes([rows[0], rows[0]], true), /row_identity_invalid/)
  assert.throws(() => resolveWorkflowTimelineLanes([{ rowKey: '', label: 'Unknown' }], true), /row_identity_invalid/)
}
