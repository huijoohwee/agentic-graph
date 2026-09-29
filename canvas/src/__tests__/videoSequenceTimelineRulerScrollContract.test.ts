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
