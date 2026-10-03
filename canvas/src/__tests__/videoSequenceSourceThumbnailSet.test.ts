import { resolveVideoSequenceSourceThumbnailSet } from '@/components/timeline/videoSequenceSourceThumbnailSet'
import { resolveVideoSequenceClipThumbnails } from '@/components/timeline/videoSequenceClipThumbnailSelection'
import type { VideoSequenceTimelineSourceThumbnailSet } from '@/components/timeline/VideoSequenceTimelineRuler'
import { buildMermaidGanttTimelineModel, type MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { formatMermaidGanttFrameSamplesToken, formatMermaidGanttFrameThumbnailToken } from '@/lib/mermaid/mermaidGanttFrameThumbnailToken'

const buildAuthoredSamples = (count: number) => Array.from({ length: count }, (_, index) => ({
  timestampSeconds: index,
  url: `/__video_frame?source=fixture&time=${index}&format=png`,
}))

const buildSourceSpan = (tokens: string, label = 'Source video', position = 0): MermaidGanttTimelineTaskSpan => (
  buildMermaidGanttTimelineModel(`gantt\n  dateFormat HH:mm\n  section Source video\n  ${label} : clip_source, ${tokens}, kgpos_${position}, 1m`).taskSpans[0]!
)

const buildPendingSourceSet = (): VideoSequenceTimelineSourceThumbnailSet => ({
  kind: 'video', label: 'Source video', sourceId: 'clip_source', sourceUrl: '/media/source.mp4',
  sourceAudioWaveformSamples: [0.2, 0.4], sourceThumbnailWindows: [], sourceThumbnails: [],
})

export function testVideoSequenceSourceThumbnailSetMatchesPendingVideoSourceById() {
  const span = {
    label: 'flower.mp4',
    raw: 'flower.mp4 : clip_flower, kgsrc_0_1, kgpos_0_44, 1m',
  } as MermaidGanttTimelineTaskSpan
  const matched = resolveVideoSequenceSourceThumbnailSet({
    lane: 'video',
    sets: [{
      kind: 'video',
      label: 'flower.mp4',
      sourceAudioWaveformSamples: [],
      sourceId: 'clip_flower',
      sourceThumbnailWindows: [],
      sourceThumbnails: [],
      sourceUrl: '/media/flower.mp4',
    }],
    span,
  })
  if (matched?.sourceUrl !== '/media/flower.mp4') {
    throw new Error(`expected pending video source without thumbnails to match by source id, got ${JSON.stringify(matched)}`)
  }
}

export function testVideoSequenceSourceThumbnailSetMatchesSplitSourceByBaseId() {
  const span = {
    label: '港岛仿生局.mp4 split right',
    raw: '港岛仿生局.mp4 split right : clip_harbor_split_right, kgsrc_0_72_0_84, kgpos_0_72, 0.12m',
  } as MermaidGanttTimelineTaskSpan
  const matched = resolveVideoSequenceSourceThumbnailSet({
    lane: 'video',
    sets: [{
      kind: 'video',
      label: '港岛仿生局.mp4',
      sourceAudioWaveformSamples: [],
      sourceId: 'clip_harbor',
      sourceThumbnailWindows: [],
      sourceThumbnails: [],
      sourceUrl: '/media/harbor.mp4',
    }],
    span,
  })
  if (matched?.sourceUrl !== '/media/harbor.mp4') {
    throw new Error(`expected split-right video source to resolve through its base source id, got ${JSON.stringify(matched)}`)
  }
}

export function testVideoSequenceSourceThumbnailSetKeepsBlankGenericSourcePlaceholderEmpty() {
  const span = {
    label: 'Source video',
    raw: 'Source video : operator_source_video, kgpos_0, 0.86m',
  } as MermaidGanttTimelineTaskSpan
  const matched = resolveVideoSequenceSourceThumbnailSet({
    lane: 'video',
    sets: [{
      kind: 'video',
      label: 'Source video',
      sourceAudioWaveformSamples: [],
      sourceId: 'operator_source_video',
      sourceThumbnailWindows: [],
      sourceThumbnails: [],
      sourceUrl: '/media/stale-source.mp4',
    }],
    span,
  })
  if (matched) {
    throw new Error(`expected blank generic Source video placeholder without kgsrc to stay empty, got ${JSON.stringify(matched)}`)
  }
}

export function testVideoSequenceSourceThumbnailSetKeepsGenericSourcePlaceholderEmptyWithSourceRange() {
  const span = {
    label: 'Source video',
    raw: 'Source video : operator_source_video, kgsrc_0_0_86, kgpos_0, 0.86m',
  } as MermaidGanttTimelineTaskSpan
  const matched = resolveVideoSequenceSourceThumbnailSet({
    lane: 'video',
    sets: [{
      kind: 'video',
      label: 'Source video',
      sourceAudioWaveformSamples: [],
      sourceId: 'operator_source_video',
      sourceThumbnailWindows: [],
      sourceThumbnails: [],
      sourceUrl: '/media/source-backed.mp4',
    }],
    span,
  })
  if (matched) {
    throw new Error(`expected generic Source video scaffold label with kgsrc to stay empty, got ${JSON.stringify(matched)}`)
  }
}

export function testVideoSequenceSourceThumbnailSetResolvesAuthoredVideoFrames() {
  const samples = buildAuthoredSamples(16)
  const span = buildSourceSpan(formatMermaidGanttFrameSamplesToken(samples))
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span })
  const window = matched?.sourceThumbnailWindows[0]
  const visible = resolveVideoSequenceClipThumbnails({ sourceThumbnails: matched?.sourceThumbnails || [], sourceWindow: window || null })
  if (!matched || visible.length !== 16 || visible.some((thumbnail, index) => thumbnail.dataUrl !== samples[index]?.url)
    || window?.sourceStartSeconds !== 0 || window.sourceEndSeconds !== 60) {
    throw new Error('expected all 16 authored provider frames to resolve through the full source-time window')
  }
  const movedSpan = { ...buildSourceSpan(formatMermaidGanttFrameSamplesToken(samples), 'Source video', 5), startMinutes: 5, endMinutes: 6 }
  const moved = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span: movedSpan })
  if (moved?.sourceThumbnailWindows[0]?.timelineStartMinutes !== 5
    || moved.sourceThumbnailWindows[0]?.sourceStartSeconds !== 0 || moved.sourceThumbnailWindows[0]?.sourceEndSeconds !== 60) {
    throw new Error('expected a moved authored source row to retain its original source-time window')
  }
}

export function testVideoSequenceSourceThumbnailSetBoundsLegacyAuthoredFrames() {
  const samples = buildAuthoredSamples(80).reverse()
  const span = buildSourceSpan(formatMermaidGanttFrameSamplesToken(samples))
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span })
  const thumbnails = matched?.sourceThumbnails || []
  if (thumbnails.length !== 16 || thumbnails[0]?.timestampSeconds !== 0 || thumbnails[15]?.timestampSeconds !== 79
    || new Set(thumbnails.map(thumbnail => thumbnail.dataUrl)).size !== 16
    || thumbnails.some((thumbnail, index) => index > 0 && thumbnail.timestampSeconds - thumbnails[index - 1]!.timestampSeconds > 6)) {
    throw new Error('expected legacy authored payload to select 16 distinct samples across the complete timestamp range')
  }
  const visible = resolveVideoSequenceClipThumbnails({ sourceThumbnails: thumbnails, sourceWindow: matched?.sourceThumbnailWindows[0] || null })
  if (visible.length !== 16) throw new Error('expected bounded legacy source frames to remain visible through the authored window')
}

export function testVideoSequenceSourceThumbnailSetPreservesNativePrecedence() {
  const span = buildSourceSpan(formatMermaidGanttFrameSamplesToken(buildAuthoredSamples(16)))
  const nativeSet = buildPendingSourceSet()
  const authored = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span })!
  nativeSet.sourceThumbnails = [{ ...authored.sourceThumbnails[0]!, dataUrl: '/media/native-frame.png', rasterDataUrl: '/media/native-frame.png' }]
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [nativeSet], span })
  if (matched !== nativeSet || matched.sourceThumbnails[0]?.dataUrl !== '/media/native-frame.png') {
    throw new Error('expected actual native thumbnails to keep precedence and source-set identity over authored fallback')
  }
  const producerSpan = { ...span, raw: span.raw.replace('clip_source', 'video_agent_source_video') }
  const producerSet = { ...nativeSet, sourceId: 'video_agent_source' }
  if (resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [producerSet], span: producerSpan }) !== producerSet) {
    throw new Error('expected video-agent VIDEO track suffix to normalize to its native source ID and preserve native object identity')
  }
  const sparseSpan = buildSourceSpan(`${formatMermaidGanttFrameSamplesToken(buildAuthoredSamples(4).filter(sample => sample.timestampSeconds === 0 || sample.timestampSeconds === 3))}, kgsrc_1_2`)
  const sparseProducerSpan = { ...sparseSpan, raw: sparseSpan.raw.replace('clip_source', 'video_agent_source_video') }
  if (resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [producerSet], span: sparseProducerSpan }) !== producerSet) {
    throw new Error('expected ready native thumbnails to win when valid authored media evidence has no sampled frame inside a sparse trim')
  }
  if (resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [producerSet], span: { ...producerSpan, raw: 'Source video : video_agent_source_video, kgframes_bm90LWpzb24, kgthumb_!!!!, kgsrc_1_2, kgpos_0, 1m' } })) {
    throw new Error('expected malformed generic media evidence to remain empty even when a matching native set is ready')
  }
}

export function testVideoSequenceSourceThumbnailSetFiltersTrimBeforeBoundingLegacyFrames() {
  const samples = buildAuthoredSamples(80)
  const token = formatMermaidGanttFrameSamplesToken(samples)
  const span = buildSourceSpan(`${token}, kgsrc_10_20`)
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span })
  const visible = resolveVideoSequenceClipThumbnails({ sourceThumbnails: matched?.sourceThumbnails || [], sourceWindow: matched?.sourceThumbnailWindows[0] || null })
  if (visible.length !== 11 || visible.some(thumbnail => thumbnail.timestampSeconds < 10 || thumbnail.timestampSeconds > 20)
    || visible[0]?.timestampSeconds !== 10 || visible[10]?.timestampSeconds !== 20) {
    throw new Error('expected all 11 legacy frames inside the explicit trim to survive before bounding, without requests outside that trim')
  }
  const pendingSet = buildPendingSourceSet()
  pendingSet.sourceThumbnailWindows = [{ sourceStartSeconds: 10, sourceEndSeconds: 20, timelineStartMinutes: 0, timelineEndMinutes: 1 }]
  const windowed = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [pendingSet], span: buildSourceSpan(token) })
  if (windowed?.sourceThumbnails.length !== 11 || windowed.sourceThumbnails.some(thumbnail => thumbnail.timestampSeconds < 10 || thumbnail.timestampSeconds > 20)) {
    throw new Error('expected a matching native source window to constrain authored fallback before its 16-frame selection')
  }
  const sparse = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span: buildSourceSpan(`${token}, kgsrc_10_11`) })
  const sparseVisible = resolveVideoSequenceClipThumbnails({ sourceThumbnails: sparse?.sourceThumbnails || [], sourceWindow: sparse?.sourceThumbnailWindows[0] || null })
  if (sparseVisible.length !== 2 || sparseVisible.some(thumbnail => thumbnail.timestampSeconds < 10 || thumbnail.timestampSeconds > 11)) {
    throw new Error('expected nearest-reel minimum to stay within a sparse explicit trim')
  }
}

export function testVideoSequenceSourceThumbnailSetPreservesPendingSourceAndTrimWindow() {
  const url = '/__video_frame?source=fixture&time=37.5&format=png'
  const span = buildSourceSpan(`${formatMermaidGanttFrameThumbnailToken(url)}, kgsrc_30_45`)
  const pendingSet = buildPendingSourceSet()
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [pendingSet], span })
  if (matched?.sourceUrl !== pendingSet.sourceUrl || matched.sourceAudioWaveformSamples !== pendingSet.sourceAudioWaveformSamples
    || matched.sourceThumbnails.length !== 1 || matched.sourceThumbnails[0]?.dataUrl !== url
    || matched.sourceThumbnails[0]?.timestampSeconds !== 37.5
    || matched.sourceThumbnailWindows[0]?.sourceStartSeconds !== 30 || matched.sourceThumbnailWindows[0]?.sourceEndSeconds !== 45
    || pendingSet.sourceThumbnails.length) {
    throw new Error('expected authored kgthumb fallback to preserve the playable source, waveform and explicit trim without mutating its pending set')
  }
  const windowSet = buildPendingSourceSet()
  windowSet.sourceThumbnailWindows = [{ sourceStartSeconds: 10, sourceEndSeconds: 20, timelineStartMinutes: 0, timelineEndMinutes: 1 }]
  const fromWindow = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [windowSet], span: buildSourceSpan(formatMermaidGanttFrameThumbnailToken(url)) })
  if (fromWindow?.sourceThumbnails[0]?.timestampSeconds !== 15 || fromWindow.sourceThumbnailWindows[0]?.sourceStartSeconds !== 10) {
    throw new Error('expected authored thumbnail fallback to reuse an exact matching source-set window')
  }
}

export function testVideoSequenceSourceThumbnailSetRejectsInvalidAuthoredFramesAndKeepsAudio() {
  const invalid = buildSourceSpan('kgframes_bm90LWpzb24, kgthumb_!!!!')
  if (resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [buildPendingSourceSet()], span: invalid })) {
    throw new Error('expected malformed authored tokens to leave the generic VIDEO placeholder empty')
  }
  const validThumbnail = '/media/authored-thumbnail.png'
  const mixed = buildSourceSpan(`kgframes_bm90LWpzb24, ${formatMermaidGanttFrameThumbnailToken(validThumbnail)}`)
  const mixedSet = resolveVideoSequenceSourceThumbnailSet({ lane: 'video', sets: [], span: mixed })
  if (mixedSet?.sourceThumbnails[0]?.dataUrl !== validThumbnail || mixedSet.sourceThumbnails[0]?.timestampSeconds !== 30
    || mixedSet.sourceThumbnailWindows[0]?.sourceStartSeconds !== 0 || mixedSet.sourceThumbnailWindows[0]?.sourceEndSeconds !== 60) {
    throw new Error('expected an invalid frame-sample token to preserve the valid single-thumbnail source window')
  }
  const audioSpan = buildSourceSpan(formatMermaidGanttFrameSamplesToken(buildAuthoredSamples(16)), 'Source audio waveform')
  const audioSet = buildPendingSourceSet()
  const matched = resolveVideoSequenceSourceThumbnailSet({ lane: 'audio', sets: [audioSet], span: audioSpan })
  if (matched !== audioSet || matched.sourceThumbnails.length) throw new Error('expected authored VIDEO fallback to leave AUDIO source resolution unchanged')
}

export async function testVideoSequenceSourceThumbnailSetRendersLazyAuthoredVideoReel() {
  const [{ createElement }, { renderToStaticMarkup }, { VideoSequenceTimelineRuler }] = await Promise.all([
    import('react'), import('react-dom/server'), import('@/components/timeline/VideoSequenceTimelineRuler'),
  ])
  const render = (span: MermaidGanttTimelineTaskSpan) => renderToStaticMarkup(createElement(VideoSequenceTimelineRuler, {
    contentRef: { current: null }, viewportRef: { current: null }, displayTicks: [], dragPreview: null,
    draggingMode: null, draggingRowKey: '', maxMinutes: span.endMinutes, playheadPercent: 0,
    selectedRowKey: '', taskSpans: [span], timelineZoom: 1,
    onRulerPointerDown() {}, onSelectRowKey() {}, onSelectRowPosition() {}, onDropMedia() { return false }, onTrackPointerStart() {},
  }))
  const samples = buildAuthoredSamples(16)
  const authoredMarkup = render(buildSourceSpan(formatMermaidGanttFrameSamplesToken(samples)))
  if (!authoredMarkup.includes('data-kg-video-sequence-clip-thumbnail-count="16"')
    || authoredMarkup.includes('data-kg-compact-source-placeholder="1"')
    || (authoredMarkup.match(/loading="lazy"/g) || []).length !== 16
    || samples.some(sample => !authoredMarkup.includes(sample.url.replace(/&/g, '&amp;')))) {
    throw new Error('expected the VIDEO bar to render exactly 16 original provider URLs through the existing lazy thumbnail strip')
  }
  const emptyMarkup = render(buildSourceSpan('kgsrc_0_60'))
  if (!emptyMarkup.includes('data-kg-compact-source-placeholder="1"') || emptyMarkup.includes('<img')
    || emptyMarkup.includes('data-kg-video-sequence-clip-thumbnail-strip="1"')) {
    throw new Error('expected an unauthored generic VIDEO bar to retain its empty placeholder without synthetic thumbnails')
  }
  const fbfMarkup = render(buildSourceSpan(formatMermaidGanttFrameSamplesToken(samples), 'Frame-by-frame annotation samples (16)'))
  if (!fbfMarkup.includes('data-kg-video-sequence-frame-sample-count="16"') || fbfMarkup.includes('<img')
    || fbfMarkup.includes('data-kg-video-sequence-clip-thumbnail-strip="1"')) {
    throw new Error('expected compact FBF authored samples to keep their existing semantic rail without a source VIDEO reel')
  }
}
