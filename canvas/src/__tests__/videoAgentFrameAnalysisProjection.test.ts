import { buildVideoAgentPipeline } from '@/features/video-agent'
import { projectVideoAgentFrameAnalysisSrcDoc } from '@/features/video-agent/videoAgentFrameAnalysisProjection'
import { JSDOM } from 'jsdom'

export async function testVideoAgentFrameAnalysisProjectionUsesComponentRefinedBoxes() {
  const result = buildVideoAgentPipeline({
    sourceUrl: 'https://youtu.be/componentRefine01',
    requestedCapabilities: ['annotate', 'dataset', 'zone_count'],
  })
  if (result.ok === false) throw new Error(`expected video-agent pipeline, got ${result.reason}`)
  const frameUrl = result.pipeline.frameBoundingBoxes[0]?.frameImageUrl || ''
  const projected = projectVideoAgentFrameAnalysisSrcDoc({
    frameBoundingBoxes: result.pipeline.frameBoundingBoxes,
    srcDoc: `<main><section class="thumbnail"><img class="thumbnail-source" src="${frameUrl}" alt=""><section class="frame-boxes"></section></section></main>`,
  })
  for (const token of [
    'buildScoreMap',
    'readComponentCandidates',
    'component-refined',
    'readFrameComponents',
    'data-kg-video-agent-component-mark',
    'data-kg-video-agent-component-count',
    'data-kg-video-agent-bbox-refined',
    'data-kg-video-agent-detection-index="1"',
  ]) {
    if (!projected.includes(token)) {
      throw new Error(`expected frame-analysis projection to use component-refined multi-object boxes: ${token}`)
    }
  }
  await testVideoAgentFrameAnalysisExactSampleRuntime()
}

export async function testVideoAgentFrameAnalysisExactSampleRuntime(): Promise<void> {
  const result = buildVideoAgentPipeline({ sourceUrl: 'https://youtu.be/componentRefine01', maxFrameSamples: 16 })
  if (result.ok === false) throw new Error(result.reason)
  const boxes = result.pipeline.frameBoundingBoxes.map(box => ({
    ...box, timestampMs: box.timestampMs + (box.frameIndex === 1 ? 0.123 : 0),
  }))
  const source = `<main><p>Retained before</p><section class="thumbnail"><img class="thumbnail-source" src="${boxes[0]?.frameImageUrl || ''}" alt=""><section class="frame-boxes"></section></section><p>Retained after</p></main>`
  const projected = projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: boxes, srcDoc: source })
  const savedV2 = projected.replace(' data-kg-video-agent-frame-analysis-exact-samples="1"', '').replace('<script>', '<script>/* saved v2 */')
  const upgraded = projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: boxes, srcDoc: savedV2 })
  const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(message) }
  assert(upgraded.includes('Retained before') && upgraded.includes('Retained after') && !upgraded.includes('saved v2'), 'Owned saved-v2 upgrade lost surrounding content or kept its prior runtime')
  assert(upgraded.includes('data-kg-video-agent-frame-analysis-exact-samples="1"') && projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: boxes, srcDoc: upgraded }) === upgraded, 'Exact-sample projection was not idempotent')
  const custom = '<section data-kg-video-agent-frame-analysis="1" data-kg-video-agent-frame-analysis-version="2">Custom authored analysis</section>'
  assert(projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: boxes, srcDoc: custom }) === custom, 'Upgrade rewrote unknown custom markup')
  const dom = new JSDOM(upgraded, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost' })
  try {
    const { window } = dom
    const root = window.document.querySelector('[data-kg-video-agent-frame-analysis="1"]')
    const images = Array.from(window.document.querySelectorAll('li img')) as HTMLImageElement[]
    const completed = new Set<HTMLImageElement>()
    const requests: string[] = []
    for (const image of images) {
      Object.defineProperty(image, 'complete', { configurable: true, get: () => !image.hasAttribute('src') || completed.has(image) })
      const original = image.setAttribute.bind(image)
      image.setAttribute = (name, value) => { if (name === 'src') requests.push(value); original(name, value) }
    }
    const script = window.document.querySelector('script')?.textContent || ''
    assert(!!script && images.length >= 3, 'Runtime fixture did not retain sampled source images')
    window.eval(script)
    assert(requests.length === 1 && requests[0] === images[0].getAttribute('data-kg-video-agent-frame-src'), 'Startup did not reuse only the owned initial sample URL')
    const sampleTime = boxes.find(box => box.frameIndex === 1)?.timestampMs || 0
    const sampleUrl = images[1].getAttribute('data-kg-video-agent-frame-src') || ''
    const seek = (timeMs: number, frameSampleUrl: string): void => {
      window.dispatchEvent(new window.CustomEvent('agentic-graph:render-frame', { detail: { timeMs, frameSampleUrl } }))
    }
    seek(sampleTime, sampleUrl)
    assert(requests.length === 1 && !images[1].hasAttribute('src'), 'Pending startup image allowed a parallel sample request')
    completed.add(images[0])
    images[0].dispatchEvent(new window.Event('load'))
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    assert(requests.length === 2 && requests[1] === sampleUrl && images[1].getAttribute('src') === sampleUrl, 'Latest pending seek did not replay the exact authored sample URL')
    completed.add(images[1])
    seek(sampleTime, sampleUrl)
    seek(sampleTime + 0.01, sampleUrl)
    assert(requests.length === 2, 'Repeated or subframe seeks duplicated the sample request')
    const foreign = 'https://different-source.invalid/frame.png'
    const thirdTime = boxes.find(box => box.frameIndex === 2)?.timestampMs || 0
    seek(thirdTime, foreign)
    assert(requests.length === 3 && !requests.includes(foreign) && requests[2] === images[2].getAttribute('data-kg-video-agent-frame-src'), 'A foreign sample URL was fetched or displaced the owned source URL')
    assert(root?.getAttribute('data-kg-video-agent-frame-sample-rejected') === '1', 'Rejected sample URL lacked an observable failure marker')
  } finally { dom.window.close() }
}
