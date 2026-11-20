import type {
  MermaidGanttTimelineModel,
  MermaidGanttTimelineTaskSpan,
  MermaidGanttTimelineTick,
} from './mermaidGanttBarInteraction'

type GanttTimeParts = {
  hours: number
  minutes: number
}

const MERMAID_GANTT_POSITION_ZERO_EPSILON_MINUTES = 1 / 60

function parseGanttClockTime(value: string): GanttTimeParts | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return { hours, minutes }
}

export function readClockMinutes(value: string): number | null {
  const positionMatch = /^kgpos_(\d+(?:_\d+)?)$/i.exec(String(value || '').trim())
  const positionMinutes = positionMatch?.[1] ? Number(positionMatch[1].replace(/_/g, '.')) : NaN
  if (Number.isFinite(positionMinutes) && positionMinutes >= 0) return positionMinutes
  const time = parseGanttClockTime(value)
  return time ? time.hours * 60 + time.minutes : null
}

export function formatClockMinutes(value: number): string {
  const totalMinutes = Math.max(0, Math.round(value))
  const hours = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatFractionalMinutesToken(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0)
  return String(Number(safe.toFixed(3)))
}

export function formatPositionToken(value: number, existingToken: string): string {
  if (/^kgpos_/i.test(String(existingToken || '').trim())) {
    const positionMinutes = Math.abs(value) <= MERMAID_GANTT_POSITION_ZERO_EPSILON_MINUTES ? 0 : value
    return `kgpos_${formatFractionalMinutesToken(positionMinutes).replace(/\./g, '_')}`
  }
  return formatClockMinutes(value)
}

export function readDurationMinutes(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)m$/i.exec(String(value || '').trim())
  if (!match) return null
  const minutes = Number(match[1])
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null
}

export function formatDurationMinutes(value: number): string {
  return `${formatFractionalMinutesToken(Math.max(0.001, value))}m`
}

export function readGanttTaskLabel(line: string): string {
  const colonIndex = line.indexOf(':')
  if (colonIndex < 0) return line.trim()
  return line.slice(0, colonIndex).trim() || line.trim()
}

export function readGanttTaskTokens(line: string): string[] {
  const colonIndex = line.indexOf(':')
  if (colonIndex < 0) return []
  return line.slice(colonIndex + 1).split(',').map(token => token.trim()).filter(Boolean)
}

export function readBaseClockMinutes(lines: string[]): number | null {
  for (const line of lines) {
    const tokens = readGanttTaskTokens(String(line || '').trim())
    const clockToken = tokens.find(token => readClockMinutes(token) != null)
    const minutes = clockToken ? readClockMinutes(clockToken) : null
    if (minutes != null) return minutes
  }
  return null
}

function resolveGanttTimelineTickStep(totalMinutes: number): number {
  const targetTickCount = 6
  const rawStep = Math.max(1, totalMinutes / targetTickCount)
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 240, 480]
  return candidates.find(candidate => candidate >= rawStep) ?? Math.ceil(rawStep)
}

export function formatMermaidGanttTimelineOffset(value: number): string {
  const totalMinutes = Math.max(0, Math.round(value))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

export function buildMermaidGanttTimelineModel(code: string): MermaidGanttTimelineModel {
  const lines = String(code || '').replace(/\r/g, '').split('\n')
  const taskSpans: MermaidGanttTimelineTaskSpan[] = []
  const usesVideoSequenceZeroOrigin = lines.some(line => /^\s*title\s+Video Sequence\s*$/i.test(String(line || '').trim()))
  let baseClockMinutes: number | null = usesVideoSequenceZeroOrigin ? 0 : null
  let cursorMinutes = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = String(lines[lineIndex] || '').trim()
    if (!raw || !raw.includes(':')) continue
    if (/^(?:title|dateFormat|axisFormat|tickInterval|weekday|excludes|includes|todayMarker)\b/i.test(raw)) continue
    const tokens = readGanttTaskTokens(raw)
    const durationMinutes = readDurationMinutes(tokens[tokens.length - 1] || '')
    if (durationMinutes == null) continue
    const clockToken = tokens.find(token => readClockMinutes(token) != null)
    const clockMinutes = clockToken ? readClockMinutes(clockToken) : null
    if (baseClockMinutes == null && clockMinutes != null) baseClockMinutes = clockMinutes
    const startMinutes = Math.max(0, clockMinutes == null || baseClockMinutes == null ? cursorMinutes : clockMinutes - baseClockMinutes)
    const endMinutes = startMinutes + durationMinutes
    taskSpans.push({
      durationMinutes,
      endMinutes,
      label: readGanttTaskLabel(raw),
      lineIndex,
      raw,
      rowKey: `${lineIndex}:task:${raw}`,
      startMinutes,
    })
    cursorMinutes = Math.max(cursorMinutes, endMinutes)
  }

  const startMinutes = taskSpans.length ? Math.min(...taskSpans.map(span => span.startMinutes)) : 0
  const endMinutes = taskSpans.length ? Math.max(...taskSpans.map(span => span.endMinutes)) : 0
  const originMinutes = usesVideoSequenceZeroOrigin ? 0 : startMinutes
  return {
    durationMinutes: Math.max(0, endMinutes - originMinutes),
    endMinutes,
    startMinutes,
    taskSpans,
  }
}

export function buildMermaidGanttTimelineTicks(model: MermaidGanttTimelineModel): MermaidGanttTimelineTick[] {
  const totalMinutes = Math.max(0, model.durationMinutes)
  if (totalMinutes <= 0) return [{ label: '0:00', minutes: 0, percent: 0 }]
  const step = resolveGanttTimelineTickStep(totalMinutes)
  const ticks: MermaidGanttTimelineTick[] = []
  for (let minutes = 0; minutes < totalMinutes; minutes += step) {
    ticks.push({
      label: formatMermaidGanttTimelineOffset(minutes),
      minutes,
      percent: (minutes / totalMinutes) * 100,
    })
  }
  ticks.push({
    label: formatMermaidGanttTimelineOffset(totalMinutes),
    minutes: totalMinutes,
    percent: 100,
  })
  return ticks
}

export function resolveMermaidGanttTimelineRowKeyAtPosition(
  model: MermaidGanttTimelineModel,
  positionMinutes: number,
): string | null {
  const position = Math.max(0, Number.isFinite(positionMinutes) ? positionMinutes : 0)
  const containing = model.taskSpans.find(span => position >= span.startMinutes && position <= span.endMinutes)
  if (containing) return containing.rowKey
  const nearest = model.taskSpans
    .map(span => ({ span, distance: Math.min(Math.abs(position - span.startMinutes), Math.abs(position - span.endMinutes)) }))
    .sort((a, b) => a.distance - b.distance)[0]?.span
  return nearest?.rowKey || null
}
