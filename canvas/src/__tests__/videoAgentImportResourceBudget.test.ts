import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'
import { JSDOM } from 'jsdom'
import { buildVideoAgentTranscriptPanelSrcDoc, usesWorkspaceTranscript } from '@/features/video-agent/videoAgentTranscriptProjection'
import { normalizeRichMediaPanelInlineSrcDoc } from '@/lib/render/richMediaPanelSrcDoc'
import { readWorkspaceTranscript } from '@/features/video-agent/WorkspaceSourceTranscript'
import { buildVideoAgentPipeline } from '@/features/video-agent/videoAgentPipeline'
import { buildVideoAgentFrameBoundingBoxes } from '@/features/video-agent/videoAgentFrameBoxes'
import { projectVideoAgentFrameAnalysisSrcDoc } from '@/features/video-agent/videoAgentFrameAnalysisProjection'
import { buildVideoAgentUrlImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoAgentUrlImport'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport/urlImport'
import { readVideoSequenceSourceAnnotations } from '@/components/timeline/videoSequenceSourceAnnotations'
import { buildMermaidGanttTimelineModel, buildMermaidGanttTimelineTicks } from '@/lib/mermaid/mermaidGanttTimelineModel'
import { formatMermaidGanttFrameSamplesToken } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'

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

  const cueCount = 777
  const cues = Array.from({ length: cueCount }, (_, i) => ({ start: i * 7.5, duration: 3.125, text: `Spoken passage ${i}` }))
  const duration = cues[cueCount - 1].start + cues[cueCount - 1].duration + 2
  const completeText = cues.map(cue => cue.text).join('\n\n')
  const completeFs = createMemoryWorkspaceFs()
  const imported = await importWorkspaceUrl({ fs: completeFs, urlRaw: sourceUrl, mirrorToHost: false,
    fetchUrlContent: async () => ({ normalizedUrl: sourceUrl, name: 'timed.md', sourceMediaKind: 'video',
      text: completeText, transcriptJsonText: JSON.stringify({ segments: cues, end_s: duration }) }) })
  const selected = (await completeFs.readFileText(imported.createdPaths[0])) || ''
  const projected = await readWorkspaceTranscript(completeFs, imported.createdPaths[0])
  assert(selected.includes(completeText) && selected.includes('kgVideoAgentInlineSourceText: true'), 'The selected document lost the original transcript body')
  assert(projected.cues.every((cue, i) => cue.text === cues[i].text && cue.startMs === cues[i].start * 1000)
    && projected.cues.length === cueCount, 'Workspace transcript pages lost cue order, timing, or text')
  assert(readVideoSequenceSourceAnnotations(selected)[0]?.sourceEndSeconds === duration, 'Source timeline stopped at the render job duration')
  const timelineText = await completeFs.readFileText(imported.createdPaths[0].replace(/[^/]+$/, 'timeline.json'))
  const tracks = JSON.parse(timelineText!).timelineTracks
  assert(tracks.every((t: { durationMs: number }) => t.durationMs === duration * 1000)
    && tracks[0].frameSamples.at(-1).timestampMs === duration * 1000 - 1, 'Track or final frame stopped before the last cue')

  const previewPanel = buildVideoAgentTranscriptPanelSrcDoc({ sourceTranscript: { preview: true } })
  const wrap = (srcDoc: string) => normalizeRichMediaPanelInlineSrcDoc({ srcDoc, title: 'Transcript', scrollOwner: 'media' })
  assert(usesWorkspaceTranscript(previewPanel) && usesWorkspaceTranscript(wrap(previewPanel)), 'Wrapped storyboard transcript lost the workspace reader')
  assert(!usesWorkspaceTranscript(wrap(buildVideoAgentTranscriptPanelSrcDoc({}))), 'An inline transcript incorrectly requested workspace files')

  const longTimeline = buildMermaidGanttTimelineModel('gantt\nsection Video\nSource video : source, 00:00, 100000m')
  assert(buildMermaidGanttTimelineTicks(longTimeline).length <= 8, 'Timeline ruler grew with source duration')

  const longCue = '引🌍'.repeat(80_000)
  const rawText = '# Source transcript\n\n' + longCue + '\r\n'
  const transcriptJsonText = JSON.stringify({ segments: [{ start: 0, duration: 600, text: longCue }] })
  const fs = createMemoryWorkspaceFs()
  const fetchUrlContent = async () => ({ normalizedUrl: sourceUrl, name: 'large.md', text: rawText,
    sourceMediaKind: 'video' as const, transcriptJsonText })
  const result = await importWorkspaceUrl({ fs, urlRaw: sourceUrl, fetchUrlContent, mirrorToHost: false })
  const path = result.createdPaths[0]
  const folder = path.slice(0, path.lastIndexOf('/') + 1)
  const read = async (name: string) => {
    const content = await fs.readFileText(folder + name)
    if (content === null) throw new Error(`Missing source file ${name}`)
    return content
  }
  const preview = await fs.readFileText(path) || ''
  assert(result.createdPaths.length === 1 && preview.includes('[Full source text](./transcript.md)'), 'Large import did not focus a preview linking to its complete transcript')
  const largeGraph = await loadGraphDataFromTextViaParser(path, preview, { applyToStore: false })
  assert(largeGraph?.graphData?.nodes?.length === expectedIds.length, 'Large import lost graph panels')
  const files = (await fs.listEntries()).filter(entry => entry.kind === 'file' && entry.path.startsWith(folder))
  assert(files.every(entry => new TextEncoder().encode(entry.text).length < 500_000), 'An imported file exceeded the byte budget')
  const manifest = JSON.parse(await read('source.json'))
  const sourceIndex = await read(manifest.sourceTextPath)
  const sourceParts = [...sourceIndex.matchAll(/\(\.\/([^)]*)\)/g)].map(match => match[1])
  assert((await Promise.all(sourceParts.map(read))).join('') === rawText, 'Markdown parts changed original source bytes')
  const readJson = async (name: string) => {
    const text = await read(name)
    const index = JSON.parse(text)
    return index.schemaVersion === 'workspace-text-parts/v1' ? (await Promise.all(index.parts.map(read))).join('') : text
  }
  assert(await readJson(manifest.sourceTranscriptJsonPath) === transcriptJsonText, 'Structured transcript changed during import')
  assert(JSON.parse(await readJson('parse.json')).sourceTranscript.segments[0].text === longCue, 'Parsed transcript lost the full cue')
  assert((await readWorkspaceTranscript(fs, path)).cues[0].text === longCue, 'The transcript viewer lost multipart source text')
  const repeated = await importWorkspaceUrl({ fs, urlRaw: sourceUrl,
    fetchUrlContent: async () => { throw new Error('Bounded preview should be reusable offline') } })
  assert(repeated.createdPaths[0] === path, 'Repeated import created a duplicate')
  assert(await fs.readFileText('/large.md') === null, 'Import left a duplicate intake document')
  await fs.deleteEntry(folder + sourceParts[0])
  const repaired = await importWorkspaceUrl({ fs, urlRaw: sourceUrl, fetchUrlContent, mirrorToHost: false })
  assert(repaired.createdPaths[0] === path && await fs.readFileText(path) === preview && !!await read(sourceParts[0]), 'Repair did not restore the missing part in place')

  const longUrl = new URL(sourceUrl)
  longUrl.searchParams.set('context', 'x'.repeat(4096))
  const wide = await importWorkspaceUrl({ fs, urlRaw: longUrl.href, documentSemanticMode: 'document',
    fetchUrlContent: async () => ({ ...await fetchUrlContent(), normalizedUrl: longUrl.href }), mirrorToHost: false })
  const widePath = wide.createdPaths[0]
  const graphIndex = await fs.readFileText(widePath.replace(/[^/]+$/, 'graph.md'))
  assert(wide.applyToGraph === false && graphIndex?.includes('graph.md.part-1.md'), 'Oversized graph metadata blocked source import or produced a partial graph')
  const graphParts = [...(graphIndex || '').matchAll(/\(\.\/([^)]*)\)/g)].map(match => match[1])
  const storedGraph = (await Promise.all(graphParts.map(name => fs.readFileText(widePath.replace(/[^/]+$/, name))))).join('')
  assert(storedGraph.includes(longUrl.href) && storedGraph.includes('kgVideoAgentImport: true'), 'Stored graph did not preserve the source URL and graph data')

  const failedFs = createMemoryWorkspaceFs()
  const failWrite = { ...failedFs, createFile: (args: Parameters<typeof fs.createFile>[0]) => {
    if (args.name === 'parse.json') throw new Error('Storage unavailable')
    return failedFs.createFile(args)
  } }
  let writeFailure = ''
  try { await importWorkspaceUrl({ fs: failWrite, urlRaw: sourceUrl, fetchUrlContent, mirrorToHost: false }) }
  catch (error) { writeFailure = (error as Error).message }
  assert(writeFailure === 'Storage unavailable', 'Import concealed a persistence failure')
  assert(!(await failedFs.listEntries()).some(entry => entry.name === 'large.md' || /^\d{8}T\d{6}Z/.test(entry.name)),
    'Interrupted import left a partial bundle or intake document')
}

async function verifySavedImportUpgrade(): Promise<void> {
  const url = ['https://youtu.be/', 'CacheVideo1'].join('')
  const sourceText = '# Retained source transcript\n\nBeginning and ending remain visible.\n'
  const transcriptJsonText = JSON.stringify({ video_id: 'CacheVideo1', source_url: url,
    segments: [{ start: 0, duration: 52.375, text: 'Beginning and ending remain visible.' }] })
  const current = buildVideoAgentUrlImportMarkdown({ sourceUrl: url, sourceText, sourceTranscriptJsonText: transcriptJsonText })
  const frameSrcDoc = current.match(/    - id: "video_agent_frame_analysis_panel"[\s\S]*?(\n        srcDoc: \|-\n(?:          [^\n]*\n)+)/)?.[1] || ''
  assert(frameSrcDoc.includes('data-kg-video-agent-frame-analysis="1"'), 'Frame content fault fixture did not find the owned panel srcDoc')
  const missing = current.replace(/kgVideoSequenceAnnotations:\n[\s\S]*?(?=videoAgentRuntimeContract:)/, '')
  const frameToken = formatMermaidGanttFrameSamplesToken(Array.from({ length: 17 }, (_, index) => ({
    timestampSeconds: index, url: `/__video_frame?sample=${index}`,
  })))
  const stale = [current + 'x'.repeat(1_000_000), missing,
    current.replace('schema: "source-annotations/v1"', 'schema: "invalid"'),
    current + '漢'.repeat(Math.ceil((500_001 - new TextEncoder().encode(current).byteLength) / 3)),
    current.replace(/(annotationTrackId: )[^\n]+/, '$1"missing_annotation"'),
    current.replace(/(frameAnalysisNodeId: )[^\n]+/, '$1"missing_panel"'),
    current.replace('kind: "video-agent-frame-analysis"', 'kind: "other-panel"'),
    current.replaceAll(url, 'https://youtu.be/OtherVideo1'),
    current.replace(/kgframes_[A-Za-z0-9_-]+/g, frameToken), '# Previously cached YouTube transcript without a VideoAgent preview',
    current.replace(frameSrcDoc, ''), current.replace(frameSrcDoc, '\n        srcDoc: "<main>Unusable frame preview</main>"\n'),
    current.replace(frameSrcDoc, frameSrcDoc.replace(/<script>[\s\S]*?<\/script>/g, ''))]
  assert(stale[3].length < 500_000 && new TextEncoder().encode(stale[3]).byteLength > 500_000, 'UTF8 budget fixture did not cross the byte-only boundary')
  stale.push(current.replace(/^kgVideoAgentSourceDurationMs:.*\n/m, ''))
  const oldPaths = stale.map((_, index) => `/docs_/20200101T00000${index}Z/old.video-agent.md`)
  const currentPath = websiteSourceBundlePath(url) + '/current.video-agent.md'
  const makeFs = (includeCurrent: boolean) => createMemoryWorkspaceFs({ initialEntries: [
    ...oldPaths.map((path, index) => ({ path, parentPath: path.slice(0, path.lastIndexOf('/')), kind: 'file' as const,
      name: 'old.video-agent.md', text: stale[index], updatedAtMs: 1 })),
    ...(includeCurrent ? [{ path: currentPath, parentPath: websiteSourceBundlePath(url), kind: 'file' as const,
      name: 'current.video-agent.md', text: current, updatedAtMs: 2 }] : []),
  ] })
  for (const path of [...oldPaths, currentPath]) setWorkspaceEntrySource(path, { kind: 'url', url,
    importState: { identity: `url:${url}`, outputDigest: '0'.repeat(64), checkedAt: 1, status: 'imported' } })
  const existingFs = makeFs(true)
  const reused = await importWorkspaceUrl({ fs: existingFs, urlRaw: url,
    fetchUrlContent: async () => { throw new Error('eligible saved preview must not fetch') } })
  assert(reused.createdPaths[0] === currentPath, 'Stale first match hid the later eligible saved preview')
  assert((await existingFs.listEntries()).filter(entry => entry.kind === 'file').length === stale.length + 1, 'Saved preview reuse created or removed files')
  for (let index = 0; index < oldPaths.length; index++) assert(await existingFs.readFileText(oldPaths[index]) === stale[index], 'Saved preview selection changed a historical source')

  const freshFs = makeFs(false)
  let fetches = 0
  const fetchUrlContent = async () => {
    fetches += 1
    return { normalizedUrl: url, name: 'cache-source.md', text: sourceText, transcriptJsonText,
      sourceMediaKind: 'video' as const, sourceMimeHint: 'text/markdown' }
  }
  const fresh = await importWorkspaceUrl({ fs: freshFs, urlRaw: url, fetchUrlContent, mirrorToHost: false })
  const path = fresh.createdPaths[0], text = await freshFs.readFileText(path)
  assert(fetches === 1 && !!text && !oldPaths.includes(path) && path.startsWith(websiteSourceBundlePath(url) + '/'), 'Default import did not use the source bundle')
  assert(new TextEncoder().encode(text || '').byteLength < 500_000 && readVideoSequenceSourceAnnotations(text || '').length === 1, 'Fresh preview lacks bounded current source annotations')
  assert((text || '').includes(sourceText.trim()), 'Fresh preview lost the retained transcript')
  const parsed = await loadGraphDataFromTextViaParser('cache-preview.video-agent.md', text || '', { applyToStore: false })
  assert(parsed?.graphData?.nodes.length === 8, 'Fresh cache upgrade lost VideoAgent panels')
  const repeated = await importWorkspaceUrl({ fs: freshFs, urlRaw: url, fetchUrlContent })
  assert(fetches === 1 && repeated.createdPaths[0] === path, 'Repeated default import fetched again or selected the stale source')
  for (let index = 0; index < oldPaths.length; index++) assert(await freshFs.readFileText(oldPaths[index]) === stale[index], 'Fresh import overwrote an edited historical source')
}

export async function testVideoAgentImportResourceBudget(): Promise<void> {
  verifyFrameSampleLimits()
  verifyDeferredFrameImageRequests()
  await verifyImportDocumentBudget()
  await verifySavedImportUpgrade()
}
