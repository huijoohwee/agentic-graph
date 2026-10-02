import { JSDOM } from 'jsdom'
import { buildVideoAgentPipeline } from '@/features/video-agent/videoAgentPipeline'
import { buildVideoAgentFrameBoundingBoxes } from '@/features/video-agent/videoAgentFrameBoxes'
import { projectVideoAgentFrameAnalysisSrcDoc } from '@/features/video-agent/videoAgentFrameAnalysisProjection'
import { buildVideoAgentUrlImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoAgentUrlImport'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'

const sourceUrl = ['https://', 'youtu.be/', 'BudgetFrame01'].join('')

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

function verifyFrameSampleLimits(): void {
  const cases: Array<[unknown, number]> = [
    [undefined, 120], [16, 16], [16.9, 16], [0, 10], [-10, 10],
    [1000, 120], [Number.NaN, 120], [Number.POSITIVE_INFINITY, 120], ['16', 120],
  ]
  for (const [limit, expected] of cases) {
    const frames = buildVideoAgentFrameBoundingBoxes(600_000, sourceUrl, limit as number)
    assert(frames.length === expected, `Expected sample limit ${String(limit)} to produce ${expected} frames, got ${frames.length}`)
  }
  const defaultPipeline = buildVideoAgentPipeline({ sourceUrl, durationMs: 600_000 })
  if (defaultPipeline.ok === false) throw new Error(defaultPipeline.reason)
  assert(defaultPipeline.pipeline.frameBoundingBoxes.length === 120, 'Default video pipeline sample budget changed')
  const cappedPipeline = buildVideoAgentPipeline({ sourceUrl, durationMs: 600_000, maxFrameSamples: 16 })
  if (cappedPipeline.ok === false) throw new Error(cappedPipeline.reason)
  assert(cappedPipeline.pipeline.frameBoundingBoxes.length === 16, 'Pipeline did not forward the preview sample cap')
  assert(cappedPipeline.pipeline.renderSpec.durationMs === 600_000, 'Preview sample cap changed source duration')
}

function verifyDeferredFrameImageRequests(): void {
  const result = buildVideoAgentPipeline({ sourceUrl, durationMs: 600_000, maxFrameSamples: 16 })
  if (result.ok === false) throw new Error(result.reason)
  const frames = result.pipeline.frameBoundingBoxes
  const firstFrameUrl = frames[0]?.frameImageUrl || ''
  const currentProjection = projectVideoAgentFrameAnalysisSrcDoc({
    frameBoundingBoxes: frames,
    srcDoc: `<main><p>Before retained content</p><section class="thumbnail"><img class="thumbnail-source" src="${firstFrameUrl}" alt=""><section class="frame-boxes"></section></section><p>After retained content</p></main>`,
  })
  const legacyProjection = currentProjection
    .replace(' data-kg-video-agent-frame-analysis-version="2"', '')
    .replace(/data-kg-video-agent-frame-src=/g, 'src=')
    .replace('<script>', '<script>/* legacy startup */')
  const upgradedProjection = projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: frames, srcDoc: legacyProjection })
  assert(upgradedProjection.includes('data-kg-video-agent-frame-analysis-version="2"') && !upgradedProjection.includes('legacy startup'), 'Recognized saved preview retained its legacy startup script')
  assert(projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: frames, srcDoc: upgradedProjection }) === upgradedProjection, 'Version 2 projection was not idempotent')
  const unknownProjection = `<section data-kg-video-agent-frame-analysis="1">Custom panel<img src="${firstFrameUrl}"></section>`
  assert(projectVideoAgentFrameAnalysisSrcDoc({ frameBoundingBoxes: frames, srcDoc: unknownProjection }) === unknownProjection, 'Projection rewrote unknown saved markup')
  for (const projected of [currentProjection, upgradedProjection]) {
    const dom = new JSDOM(projected, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost' })
    try {
      const { window } = dom
      assert(window.document.querySelectorAll('[data-kg-video-agent-frame-analysis="1"]').length === 1 && window.document.querySelectorAll('script').length === 1, 'Upgrade duplicated the frame-analysis panel or runtime script')
      assert(projected.includes('Before retained content') && projected.includes('After retained content') && projected.includes(firstFrameUrl), 'Upgrade lost surrounding source content')
      const root = window.document.querySelector('[data-kg-video-agent-frame-analysis="1"]')
      if (!root) throw new Error('Generated frame-analysis panel missing')
      assert(root.querySelectorAll('mark[data-kg-video-agent-frame]').length === frames.length * 2 && root.textContent?.includes('tracked subject'), 'Upgrade lost frame annotation data')
      const images = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]
      assert(images.length === 16, 'Generated preview lost sampled frame rows')
      assert(images.every(image => !image.hasAttribute('src')), 'Inactive frame rows started with eager image sources')
      const completedImages = new Set<HTMLImageElement>()
      let requests = 0
      for (const image of images) {
        Object.defineProperty(image, 'complete', {
          configurable: true,
          get: () => !image.hasAttribute('src') || completedImages.has(image),
        })
        const setAttribute = image.setAttribute.bind(image)
        image.setAttribute = (name: string, value: string): void => {
          if (name === 'src') requests += 1
          setAttribute(name, value)
        }
      }
      const scripts = Array.from(window.document.querySelectorAll('script')) as HTMLScriptElement[]
      const script = scripts[scripts.length - 1]?.textContent || ''
      assert(!!script, 'Generated frame-analysis script missing')
      window.eval(script)
      assert(requests === 1, `Initial frame preview started ${requests} image requests`)
      assert(images[0].hasAttribute('src') && images.slice(1).every(image => !image.hasAttribute('src')), 'Initial preview fetched inactive frames')

      const seek = (timeMs: number): void => {
        window.dispatchEvent(new window.CustomEvent('agentic-graph:render-frame', { detail: { timeMs } }))
      }
      const secondFrameTimeMs = frames[1]?.timestampMs || 0
      seek(secondFrameTimeMs)
      assert(requests === 1 && !images[1].hasAttribute('src'), 'Seek started another extraction while the first image was pending')
      completedImages.add(images[0])
      seek(secondFrameTimeMs)
      assert(requests === 2 && images[1].hasAttribute('src'), 'Seek did not load the next active sample after completion')
      assert(images.slice(2).every(image => !image.hasAttribute('src')), 'Seek eagerly fetched later samples')
      completedImages.add(images[1])
      seek(secondFrameTimeMs + 100)
      assert(requests === 2, 'Subframe timeline movement started another extraction')
    } finally {
      dom.window.close()
    }
  }
}

async function verifyImportDocumentBudget(): Promise<void> {
  const transcript = {
    video_id: 'BudgetFrame01',
    source_url: sourceUrl,
    segments: [
      { start: 0, duration: 2, text: 'Beginning of the source transcript.' },
      { start: 599, duration: 1, text: 'Ending of the source transcript.' },
    ],
  }
  const markdown = buildVideoAgentUrlImportMarkdown({
    sourceUrl,
    sourceName: 'resource-budget.md',
    sourceText: '# Source transcript\n\nBeginning of the source transcript.\n\nEnding of the source transcript.\n',
    sourceTranscriptJsonText: JSON.stringify(transcript),
  })
  const bytes = new TextEncoder().encode(markdown).byteLength
  assert(bytes < 500_000, `Ten-minute URL preview exceeded the 500000-byte document budget: ${bytes}`)
  const parsed = await loadGraphDataFromTextViaParser('resource-budget.video-agent.md', markdown, { applyToStore: false })
  const nodes = parsed?.graphData?.nodes || []
  const expectedIds = [
    'html_video_source_spec', 'html_video_renderer_node', 'html_video_stream_panel',
    'video_agent_source_playback_panel', 'video_agent_transcript_panel',
    'video_agent_frame_analysis_panel', 'video_agent_multi_dimensional_table_panel', 'video_agent_dataset_panel',
  ]
  assert(nodes.length === expectedIds.length && expectedIds.every(id => nodes.some(node => node.id === id)), 'Bounded URL preview lost source, renderer, or rich-media panels')
  assert(markdown.includes('Beginning of the source transcript.') && markdown.includes('Ending of the source transcript.'), 'Bounded preview lost source transcript content')

  let rejected = false
  try {
    buildVideoAgentUrlImportMarkdown({
      sourceUrl,
      sourceText: 'Large transcript',
      sourceTranscriptJsonText: JSON.stringify({
        ...transcript,
        segments: [{ start: 0, duration: 600, text: '漢'.repeat(180_000) }],
      }),
    })
  } catch (error) {
    assert(String((error as Error)?.message || error).includes('500 KB'), 'Oversized transcript did not report its explicit preview document limit')
    rejected = true
  }
  assert(rejected, 'Oversized transcript produced a silently truncated preview instead of failing')
}

export async function testVideoAgentImportResourceBudget(): Promise<void> {
  verifyFrameSampleLimits()
  verifyDeferredFrameImageRequests()
  await verifyImportDocumentBudget()
}
