import { formatMediaTimestampSeconds } from 'grph-shared/rich-media/providers'

export type VideoAgentTranscriptSegment = {
  durationMs: number
  endMs: number
  index: number
  startMs: number
  text: string
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const readObject = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
    } catch {
      return null
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const readNumber = (value: unknown): number | null => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const readSegments = (value: unknown): VideoAgentTranscriptSegment[] => {
  const record = readObject(value)
  const rawSegments = Array.isArray(record?.segments) ? record.segments : []
  return rawSegments.flatMap((segment, index): VideoAgentTranscriptSegment[] => {
    if (!segment || typeof segment !== 'object' || Array.isArray(segment)) return []
    const raw = segment as Record<string, unknown>
    const text = String(raw.text || '').replace(/\s+/g, ' ').trim()
    const startMs = readNumber(raw.startMs) ?? Math.max(0, Math.round((readNumber(raw.start) ?? readNumber(raw.start_seconds) ?? 0) * 1000))
    const durationMs = Math.max(1, readNumber(raw.durationMs) ?? Math.round((readNumber(raw.duration) ?? 1) * 1000))
    const endMs = Math.max(startMs + 1, readNumber(raw.endMs) ?? Math.round((readNumber(raw.end) ?? ((startMs + durationMs) / 1000)) * 1000))
    return text ? [{ durationMs: Math.max(1, endMs - startMs), endMs, index: Number.isInteger(Number(raw.index)) ? Number(raw.index) : index, startMs, text }] : []
  }).sort((left, right) => left.startMs - right.startMs || left.index - right.index)
}

const readTranscriptEmptyLabel = (value: unknown): string => {
  const record = readObject(value)
  const status = String(record?.status || '').trim().toLowerCase()
  return status === 'unavailable'
    ? 'Transcript unavailable from upstream source.'
    : 'No transcript cues available.'
}

const readFrameTranscriptSegments = (value: unknown): VideoAgentTranscriptSegment[] => {
  let candidate = value
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate)
    } catch {
      return []
    }
  }
  if (!Array.isArray(candidate)) return []
  const byIndex = new Map<number, VideoAgentTranscriptSegment>()
  for (const [fallbackIndex, item] of candidate.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const text = String(record.text || '').replace(/\s+/g, ' ').trim()
    const startMs = readNumber(record.segmentStartMs) ?? readNumber(record.timestampMs) ?? 0
    const endMs = Math.max(startMs + 1, readNumber(record.segmentEndMs) ?? startMs + 1000)
    const index = Number.isInteger(Number(record.transcriptSegmentIndex)) ? Number(record.transcriptSegmentIndex) : fallbackIndex
    if (text && !byIndex.has(index)) byIndex.set(index, { durationMs: endMs - startMs, endMs, index, startMs, text })
  }
  return [...byIndex.values()].sort((left, right) => left.startMs - right.startMs || left.index - right.index)
}

function buildSourceUrlAtTime(sourceUrl: string, timeSeconds: number): string {
  const raw = String(sourceUrl || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    url.searchParams.set('t', `${Math.max(0, Math.floor(timeSeconds))}s`)
    return url.toString()
  } catch {
    return raw
  }
}

export function buildVideoAgentTranscriptPanelSrcDoc(args: {
  frameByFrameTranscript?: unknown
  sourceTranscript?: unknown
  sourceUrl?: string
}): string {
  const sourceUrl = String(args.sourceUrl || '').trim()
  const segments = readSegments(args.sourceTranscript)
  const cues = segments.length ? segments : readFrameTranscriptSegments(args.frameByFrameTranscript)
  const emptyState = cues.length
    ? ''
    : `<p data-kg-video-agent-transcript-empty="1">${escapeHtml(readTranscriptEmptyLabel(args.sourceTranscript))}</p>`
  const cueItems = cues.map((cue, renderIndex) => {
    const timeLabel = formatMediaTimestampSeconds(cue.startMs / 1000)
    const href = buildSourceUrlAtTime(sourceUrl, cue.startMs / 1000)
    const time = `<time datetime="PT${Math.max(0, Math.round(cue.startMs / 1000))}S">${escapeHtml(timeLabel)}</time>`
    const label = href
      ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${time}</a>`
      : time
    return [
      `<li data-kg-video-agent-transcript-cue="1" data-kg-video-agent-transcript-index="${cue.index}" data-kg-video-agent-transcript-render-index="${renderIndex}" data-start-ms="${cue.startMs}" data-end-ms="${cue.endMs}"${renderIndex === 0 ? ' aria-current="true"' : ''}>`,
      '<article>',
      `<header>${label}</header>`,
      `<p>${escapeHtml(cue.text)}</p>`,
      '</article>',
      '</li>',
    ].join('')
  }).join('')
  const timing = JSON.stringify(cues.map((cue, renderIndex) => ({
    endMs: cue.endMs,
    index: cue.index,
    renderIndex,
    startMs: cue.startMs,
  }))).replace(/</g, '\\u003c')

  return [
    '<main data-kg-video-agent-transcript-panel="1" data-kg-rich-media-panel-size="viewport" aria-label="Timeline-synchronized source transcript">',
    '<header><p>Source transcript</p><h1>Timeline transcript</h1></header>',
    `<section aria-label="Transcript cues"><ol>${cueItems}</ol>${emptyState}</section>`,
    '</main>',
    '<style>',
    'main{box-sizing:border-box;display:grid;grid-template-rows:auto 1fr;gap:12px;width:100%;min-height:100%;padding:16px;background:#07111f;color:#f8fafc;font-family:Inter,system-ui,sans-serif;overflow:hidden}',
    'header p,h1,p{margin:0}main>header p{color:#5eead4;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}h1{font-size:24px}',
    'section{min-height:0;overflow:auto;border:1px solid #334155;border-radius:8px;background:#0f172a;padding:8px}ol{display:grid;gap:7px;margin:0;padding:0}li{list-style:none;border:1px solid #334155;border-radius:7px;background:#111827}li article{display:grid;gap:4px;padding:8px}li[aria-current="true"]{border-color:#5eead4;background:#083344;box-shadow:0 0 0 1px rgba(94,234,212,.24)}li header{display:flex;align-items:center;gap:8px;color:#93c5fd;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}li p{color:#e2e8f0;font-size:12px;line-height:1.45}[data-kg-video-agent-transcript-empty]{border:1px solid #334155;border-radius:7px;background:#111827;color:#cbd5e1;font-size:12px;line-height:1.45;padding:10px}a{color:inherit;text-decoration:none}a:focus-visible{outline:2px solid #5eead4;outline-offset:2px}',
    '</style>',
    '<script>',
    `(function(){var cues=${timing};var root=document.querySelector('[data-kg-video-agent-transcript-panel="1"]');if(!root||!cues.length)return;function activeCue(timeMs){var active=cues[0];for(var index=0;index<cues.length;index+=1){var cue=cues[index];if(timeMs>=cue.startMs&&timeMs<cue.endMs)return cue;if(cue.startMs<=timeMs)active=cue;else break;}return active;}function sync(rawTimeMs){var timeMs=Math.max(0,Number(rawTimeMs)||0);var cue=activeCue(timeMs);root.setAttribute('data-kg-video-agent-render-time-ms',String(timeMs));root.setAttribute('data-kg-video-agent-active-transcript-index',String(cue.index));root.querySelectorAll('[data-kg-video-agent-transcript-cue]').forEach(function(element){var active=Number(element.getAttribute('data-kg-video-agent-transcript-render-index'))===cue.renderIndex;if(active){element.setAttribute('aria-current','true');try{element.scrollIntoView({block:'nearest'});}catch(e){}}else{element.removeAttribute('aria-current');}});}window.addEventListener('agentic-graph:render-frame',function(event){sync(event&&event.detail&&event.detail.timeMs);});sync(Number(window.__AGENTIC_OS_RENDER_TIME_MS__)||0);}());`,
    '</script>',
  ].join('')
}
