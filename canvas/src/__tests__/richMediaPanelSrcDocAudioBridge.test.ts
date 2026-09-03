import {
  normalizeRichMediaPanelInlineSrcDoc,
  shouldUseDirectRichMediaPanelSrcDocSandbox,
  shouldUseViewportRichMediaPanelSrcDocSize,
} from '@/lib/render/richMediaPanelSrcDoc'
import { buildVideoAgentSourcePlaybackUrl } from '@/features/video-agent/videoAgentSourcePlayback'

export function testRichMediaPanelSrcDocBridgeControlsVideoAgentSourcePlaybackAudio() {
  const runtime = globalThis as { window?: unknown }
  const previousWindow = runtime.window
  runtime.window = { location: { origin: 'https://app.example.test' } }
  try {
    const playbackUrl = buildVideoAgentSourcePlaybackUrl('https://youtu.be/sourceVideo01')
    if (!playbackUrl.includes('youtube-nocookie.com/embed/sourceVideo01') || !playbackUrl.includes('enablejsapi=1') || !playbackUrl.includes('origin=https%3A%2F%2Fapp.example.test')) {
      throw new Error(`expected timeline-controlled source playback URL to include YouTube JS API origin, got ${playbackUrl}`)
    }
  } finally {
    runtime.window = previousWindow
  }

  const normalized = normalizeRichMediaPanelInlineSrcDoc({
    title: 'Video Agent Source Playback',
    srcDoc: [
      '<main data-kg-video-agent-source-playback-panel="1" data-kg-rich-media-panel-size="viewport" aria-label="Video agent source playback">',
      '<section data-kg-video-agent-source-playback="1" aria-label="Audio-capable source playback">',
      '<iframe title="Audio-capable source video playback" src="https://www.youtube-nocookie.com/embed/source-video?enablejsapi=1&playsinline=1"></iframe>',
      '</section>',
      '</main>',
    ].join(''),
  })

  for (const token of [
    'data-kg-rich-media-panel-size="viewport"',
    '[data-kg-video-agent-source-playback] iframe',
    'postYouTubeCommand',
    '"seekTo"',
    '"setPlaybackRate"',
    '"playVideo"',
    '"pauseVideo"',
    'if(state.playing!==playing)return Math.abs((Number(state.timeMs)||0)-timeMs)>250;',
    'sourcePlaybackState',
    'BroadcastChannel',
    'agentic-graph:rich-media-timeline-transport',
    'function receivePayload(payload)',
    'agentic-graph:timeline-transport-ready',
    'function announceReady()',
    'data-kg-timeline-transport-frame',
    'function readFrameElement()',
    'setInterval(readFrameElement,80)',
    '__AGENTIC_OS_RICH_MEDIA_TIMELINE_TRANSPORT_FRAME__',
    'setInterval(readParentFrame,80)',
    'lastSeekNowMs',
    'lastPlayCommandNowMs',
    'commandNow-(Number(state.lastPlayCommandNowMs)||0)>1000',
    'shouldRestartNativeLoop',
    'nativeLoopActive',
    'window.__AGENTIC_OS_RENDER_TIME_MS__=timeMs',
    'if(payload.sourcePlayback!==false)syncSourcePlayback(payload,timeMs);',
    'if(payload.playing){if(shouldRestartNativeLoop(timeMs,payload.playbackRate))start(timeMs,payload.playbackRate);}',
  ]) {
    if (!normalized.includes(token)) {
      throw new Error(`expected Rich Media srcdoc bridge to expose audio playback sync token ${token}`)
    }
  }
  if (normalized.includes('lastSeekNowMs)||0)>900')) {
    throw new Error('expected source playback to avoid fixed-interval reseeking during continuous movie/audio playback')
  }
  if (normalized.includes('syncSourcePlayback({timeMs:nextTimeMs,playing:true,playbackRate:rate},nextTimeMs)')) {
    throw new Error('expected continuous annotation ticks to avoid source media resync during movie/audio playback')
  }
  if (!shouldUseViewportRichMediaPanelSrcDocSize(normalized)) {
    throw new Error('expected video-agent srcdoc to opt out of panel content-height expansion')
  }
  if (!shouldUseDirectRichMediaPanelSrcDocSandbox(normalized)) {
    throw new Error('expected timeline-aware video-agent srcdoc to use direct iframe sandbox for parent-owned transport sync')
  }
  const frameAnalysis = normalizeRichMediaPanelInlineSrcDoc({
    title: 'Video Agent Frame Analysis',
    srcDoc: '<section data-kg-video-agent-frame-analysis="1" aria-label="Timeline-synchronized frame analysis"></section>',
  })
  if (!shouldUseDirectRichMediaPanelSrcDocSandbox(frameAnalysis)) {
    throw new Error('expected frame-analysis srcdoc to use direct iframe sandbox for BottomPanel transport sync')
  }
  const transcriptPanel = normalizeRichMediaPanelInlineSrcDoc({
    title: 'Video Agent Source Transcript',
    srcDoc: '<main data-kg-video-agent-transcript-panel="1" data-kg-rich-media-panel-size="viewport" aria-label="Timeline-synchronized source transcript"></main>',
  })
  if (!shouldUseViewportRichMediaPanelSrcDocSize(transcriptPanel) || !shouldUseDirectRichMediaPanelSrcDocSandbox(transcriptPanel)) {
    throw new Error('expected transcript srcdoc to use the shared direct iframe timeline sandbox')
  }
}
