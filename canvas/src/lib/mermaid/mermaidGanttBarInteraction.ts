import {
  buildMermaidGanttTimelineModel,
  formatClockMinutes,
  formatDurationMinutes,
  formatPositionToken,
  readBaseClockMinutes,
  readClockMinutes,
  readDurationMinutes,
  readGanttTaskLabel,
  readGanttTaskTokens,
} from './mermaidGanttTimelineModel'
import {
  isMermaidGanttSourceRangeToken,
  readMermaidGanttLineSourceRange,
  resolveMermaidGanttSourceRangeSplitSeconds,
  type MermaidGanttSourceRangeSeconds,
  upsertMermaidGanttSourceRangeToken,
} from './mermaidGanttSourceRangeToken'

export type MermaidGanttBarDragMode = 'move' | 'resize-start' | 'resize-end'

export type MermaidGanttBarDragPreview = {
  deltaPx: number
  offsetPx: number
  widthDeltaPx: number
}

export type MermaidGanttTimelineTaskSpan = {
  durationMinutes: number
  endMinutes: number
  label: string
  lineIndex: number
  raw: string
  rowKey: string
  startMinutes: number
}

export type { MermaidGanttSourceRangeSeconds } from './mermaidGanttSourceRangeToken'

export type MermaidGanttTimelineDragPreview = {
  durationMinutes: number
  rowKey: string
  startMinutes: number
}

export type MermaidGanttVideoSequenceOperation = 'mask' | 'grade' | 'speed' | 'adjustment' | 'transition' | 'keyframe' | 'filter' | 'effect'

export type MermaidGanttTimelineModel = {
  durationMinutes: number
  endMinutes: number
  startMinutes: number
  taskSpans: MermaidGanttTimelineTaskSpan[]
}

export type MermaidGanttTimelineTick = {
  label: string
  minutes: number
  percent: number
}

export {
  MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX,
  MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_STEP_PX,
  MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX,
  MERMAID_GANTT_BAR_MIN_INTERACTION_HEIGHT_PX,
  MERMAID_GANTT_BAR_MIN_INTERACTION_WIDTH_PX,
  isMermaidGanttBarDragMode,
  resolveMermaidGanttBarDragCommitted,
  resolveMermaidGanttBarDragPreview,
  resolveMermaidGanttTimelineDragEffectiveDelta,
  resolveMermaidGanttTimelineDragPreviewSpan,
  shouldExposeMermaidGanttBarInteraction,
} from './mermaidGanttDragInteraction'

export {
  buildMermaidGanttTimelineModel,
  buildMermaidGanttTimelineTicks,
  formatMermaidGanttTimelineOffset,
  resolveMermaidGanttTimelineRowKeyAtPosition,
} from './mermaidGanttTimelineModel'

function isMermaidGanttStatusToken(token: string): boolean {
  return /^(?:active|done|crit|milestone|vert)$/i.test(String(token || '').trim())
}

function isLegacyVideoSequenceLaneToken(token: string): boolean {
  return /^(?:video|image|scene|mask|grade|effect|adjustment|transition|keyframe|filter|audio|speed|splice)$/i.test(String(token || '').trim())
}

export function readMermaidGanttTaskSourceRangeSeconds(line: string): MermaidGanttSourceRangeSeconds | null {
  return readMermaidGanttLineSourceRange(line)
}

function readGanttLineIndent(line: string): string {
  return line.match(/^(\s*)/)?.[1] || ''
}

function readSpanAbsoluteStartMinutes(args: {
  code: string
  line: string
  span: MermaidGanttTimelineTaskSpan
}): number | null {
  const explicitClock = readGanttTaskTokens(args.line).find(token => readClockMinutes(token) != null)
  const explicitMinutes = explicitClock ? readClockMinutes(explicitClock) : null
  if (explicitMinutes != null) return explicitMinutes
  const baseClockMinutes = readBaseClockMinutes(String(args.code || '').split('\n'))
  if (baseClockMinutes == null) return null
  return baseClockMinutes + args.span.startMinutes
}

function readGanttTimingMetaTokens(tokens: readonly string[]): string[] {
  return tokens.filter(token =>
    readClockMinutes(token) == null
    && readDurationMinutes(token) == null
    && !isLegacyVideoSequenceLaneToken(token),
  )
}

function appendGanttTaskIdSuffix(metaTokens: readonly string[], suffix: string): string[] {
  const next = metaTokens.map(token => String(token || '').trim()).filter(Boolean)
  const suffixPart = String(suffix || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
  if (!suffixPart) return next
  const taskIdIndex = next.findIndex(token =>
    !isMermaidGanttStatusToken(token)
    && !isMermaidGanttSourceRangeToken(token)
    && !/^after\b/i.test(token)
    && !/^until\b/i.test(token),
  )
  if (taskIdIndex < 0) return next
  next[taskIdIndex] = `${next[taskIdIndex]}_${suffixPart}`
  return next
}

function readGanttTaskStableId(line: string): string {
  const tokens = readGanttTimingMetaTokens(readGanttTaskTokens(line))
  return String(tokens.find(token =>
    !isMermaidGanttStatusToken(token)
    && !isMermaidGanttSourceRangeToken(token)
    && !/^after\b/i.test(token)
    && !/^until\b/i.test(token),
  ) || '').trim()
}

function shouldWriteVideoSequenceSourceRange(args: {
  code: string
  line: string
}): boolean {
  if (String(args.code || '').split('\n').some(line => /^\s*title\s+Video Sequence\s*$/i.test(String(line || '').trim()))) return true
  const label = readGanttTaskLabel(args.line)
  const stableId = readGanttTaskStableId(args.line)
  return /\.(?:mp4|mov|webm|m4v|mp3|wav|m4a|aac)\b/i.test(label)
    || /^clip[_-]/i.test(stableId)
    || readVideoSequenceOperationFromLine(args.line) !== ''
}

function normalizeVideoSequenceClipGroupId(value: string): string {
  return String(value || '')
    .trim()
    .replace(/_(?:image|scene|mask|grade|effect|adjustment|transition|keyframe|filter|audio|speed)(?=(?:_splice)*$|$)/gi, '')
}

function resolveVideoSequenceClipGroupKey(line: string): string {
  const stableId = readGanttTaskStableId(line)
  if (stableId) return normalizeVideoSequenceClipGroupId(stableId)
  return readGanttTaskLabel(line).replace(/\s+(?:image|scene|mask|grade|effect|adjustment|transition|keyframe|filter|audio|speed|splice)\b.*$/i, '').trim().toLowerCase()
}

function readVideoSequenceOperationFromLine(line: string): MermaidGanttVideoSequenceOperation | '' {
  const signature = `${readGanttTaskLabel(line)} ${readGanttTaskStableId(line)}`.toLowerCase()
  if (/\bkeyframe|key\b/.test(signature) || /_keyframe\b/.test(signature)) return 'keyframe'
  if (/\btransition|dissolve|wipe|fade\b/.test(signature) || /_transition\b/.test(signature)) return 'transition'
  if (/\badjust|adjustment|layer\b/.test(signature) || /_adjustment\b/.test(signature)) return 'adjustment'
  if (/\bfilter|blur|sharpen|denoise\b/.test(signature) || /_filter\b/.test(signature)) return 'filter'
  if (/\beffect|fx\b/.test(signature) || /_effect\b/.test(signature)) return 'effect'
  if (/\bspeed|retime|ramp\b/.test(signature) || /_speed\b/.test(signature)) return 'speed'
  if (/\bgrade|color|lut|exposure|contrast\b/.test(signature) || /_grade\b/.test(signature)) return 'grade'
  if (/\bmask|matte|roto|alpha\b/.test(signature) || /_mask\b/.test(signature)) return 'mask'
  return ''
}

function readVideoSequenceClipGroupLineIndexes(args: {
  code: string
  rowLineIndex: number
}): number[] {
  const lines = String(args.code || '').split('\n')
  const selectedLine = lines[args.rowLineIndex]
  if (typeof selectedLine !== 'string' || !selectedLine.includes(':')) return []
  const selectedGroupKey = resolveVideoSequenceClipGroupKey(selectedLine)
  if (!selectedGroupKey) return [args.rowLineIndex]
  const model = buildMermaidGanttTimelineModel(args.code)
  return model.taskSpans
    .filter(span => {
      const line = lines[span.lineIndex]
      return typeof line === 'string' && resolveVideoSequenceClipGroupKey(line) === selectedGroupKey
    })
    .map(span => span.lineIndex)
    .sort((a, b) => a - b)
}

function buildGanttTaskLine(args: {
  absoluteStartMinutes: number
  durationMinutes: number
  indent: string
  label: string
  metaTokens: readonly string[]
  positionToken?: string
}): string {
  const timingTokens = [
    ...args.metaTokens,
    formatPositionToken(args.absoluteStartMinutes, args.positionToken || ''),
    formatDurationMinutes(args.durationMinutes),
  ]
  return `${args.indent}${args.label} : ${timingTokens.join(', ')}`
}

export function updateMermaidGanttCodeRowTiming(args: {
  code: string
  rowLineIndex: number
  mode: MermaidGanttBarDragMode
  deltaMinutes: number
}): string | null {
  const lines = String(args.code || '').split('\n')
  const line = lines[args.rowLineIndex]
  if (typeof line !== 'string' || !line.includes(':')) return null
  const preserveFractionalTiming = /\b(?:kgpos_|kgsrc_|\d+\.\d+m\b)/i.test(line)
  const deltaMinutes = preserveFractionalTiming
    ? Number(Number(args.deltaMinutes).toFixed(3))
    : Math.round(args.deltaMinutes)
  if (deltaMinutes === 0) return null
  const colonIndex = line.indexOf(':')
  const prefix = line.slice(0, colonIndex + 1)
  const tokenText = line.slice(colonIndex + 1)
  const tokens = tokenText.split(',').map(token => token.trim())
  const timeTokenIndex = tokens.findIndex(token => readClockMinutes(token) != null)
  const durationTokenIndex = tokens.length - 1
  const explicitStartMinutes = timeTokenIndex >= 0 ? readClockMinutes(tokens[timeTokenIndex] || '') : null
  const timelineSpan = buildMermaidGanttTimelineModel(args.code).taskSpans.find(span => span.lineIndex === args.rowLineIndex)
  const baseClockMinutes = readBaseClockMinutes(lines)
  const startMinutes = explicitStartMinutes == null && timelineSpan && baseClockMinutes != null
    ? baseClockMinutes + timelineSpan.startMinutes
    : explicitStartMinutes
  const durationMinutes = readDurationMinutes(tokens[durationTokenIndex] || '')
  if (startMinutes == null || durationMinutes == null) return null
  const shouldWriteSourceRange = shouldWriteVideoSequenceSourceRange({ code: args.code, line })
  const initialSourceRange = readMermaidGanttLineSourceRange(line) || {
    endSeconds: (timelineSpan?.startMinutes ?? 0) + durationMinutes,
    startSeconds: timelineSpan?.startMinutes ?? 0,
  }
  let nextStartMinutes = startMinutes
  let nextDurationMinutes = durationMinutes
  if (args.mode === 'move') {
    nextStartMinutes = startMinutes + deltaMinutes
  } else if (args.mode === 'resize-start') {
    nextStartMinutes = startMinutes + deltaMinutes
    nextDurationMinutes = durationMinutes - deltaMinutes
  } else {
    nextDurationMinutes = durationMinutes + deltaMinutes
  }
  const minimumDurationMinutes = preserveFractionalTiming ? 0.001 : 1
  if (nextDurationMinutes < minimumDurationMinutes) {
    const durationFloorDelta = nextDurationMinutes - minimumDurationMinutes
    nextDurationMinutes = minimumDurationMinutes
    if (args.mode === 'resize-start') nextStartMinutes += durationFloorDelta
  }
  if (shouldWriteSourceRange && args.mode !== 'move') {
    const sourceDurationSeconds = Math.max(0.0001, initialSourceRange.endSeconds - initialSourceRange.startSeconds)
    const timelineDurationMinutes = Math.max(0.0001, durationMinutes)
    const nextSourceRange = args.mode === 'resize-start'
      ? {
        endSeconds: initialSourceRange.endSeconds,
        startSeconds: Math.max(0, initialSourceRange.startSeconds + sourceDurationSeconds * ((nextStartMinutes - startMinutes) / timelineDurationMinutes)),
      }
      : {
        endSeconds: Math.max(
          initialSourceRange.startSeconds + 0.0001,
          initialSourceRange.endSeconds + sourceDurationSeconds * ((nextDurationMinutes - durationMinutes) / timelineDurationMinutes),
        ),
        startSeconds: Math.max(0, initialSourceRange.startSeconds),
      }
    const nextMetaTokens = upsertMermaidGanttSourceRangeToken(
      readGanttTimingMetaTokens(tokens),
      nextSourceRange,
    )
    const nonTimingTokenCount = readGanttTimingMetaTokens(tokens).length
    if (nonTimingTokenCount > 0) {
      tokens.splice(0, nonTimingTokenCount, ...nextMetaTokens)
    } else {
      tokens.splice(0, 0, ...nextMetaTokens)
    }
  }
  if (timeTokenIndex >= 0) {
    const nextTimeTokenIndex = tokens.findIndex(token => readClockMinutes(token) != null)
    tokens[nextTimeTokenIndex] = formatPositionToken(nextStartMinutes, tokens[nextTimeTokenIndex] || '')
  } else if (args.mode === 'resize-end') {
    tokens[tokens.length - 1] = formatDurationMinutes(nextDurationMinutes)
    lines[args.rowLineIndex] = `${prefix} ${tokens.join(', ')}`
    return lines.join('\n')
  } else {
    tokens.splice(tokens.length - 1, 0, formatClockMinutes(nextStartMinutes))
  }
  tokens[tokens.length - 1] = formatDurationMinutes(nextDurationMinutes)
  lines[args.rowLineIndex] = `${prefix} ${tokens.join(', ')}`
  return lines.join('\n')
}

function updateMermaidGanttCodeRowToTiming(args: {
  absoluteStartMinutes: number
  code: string
  durationMinutes: number
  rowLineIndex: number
  sourceRange: MermaidGanttSourceRangeSeconds | null
}): string | null {
  const lines = String(args.code || '').split('\n')
  const line = lines[args.rowLineIndex]
  if (typeof line !== 'string' || !line.includes(':')) return null
  const metaTokens = readGanttTimingMetaTokens(readGanttTaskTokens(line))
  const shouldWriteSourceRange = !!args.sourceRange && shouldWriteVideoSequenceSourceRange({ code: args.code, line })
  lines[args.rowLineIndex] = buildGanttTaskLine({
    absoluteStartMinutes: args.absoluteStartMinutes,
    durationMinutes: args.durationMinutes,
    indent: readGanttLineIndent(line),
    label: readGanttTaskLabel(line),
    metaTokens: shouldWriteSourceRange
      ? upsertMermaidGanttSourceRangeToken(metaTokens, args.sourceRange as MermaidGanttSourceRangeSeconds)
      : metaTokens,
    positionToken: readGanttTaskTokens(line).find(token => readClockMinutes(token) != null),
  })
  return lines.join('\n')
}

export function updateMermaidGanttVideoSequenceClipGroupTiming(args: {
  code: string
  rowLineIndex: number
  mode: MermaidGanttBarDragMode
  deltaMinutes: number
}): string | null {
  const initialSelectedLine = String(args.code || '').split('\n')[args.rowLineIndex]
  const initialSelectedSpan = buildMermaidGanttTimelineModel(args.code).taskSpans.find(span => span.lineIndex === args.rowLineIndex)
  const initialSourceRange = typeof initialSelectedLine === 'string' && initialSelectedSpan
    ? readMermaidGanttLineSourceRange(initialSelectedLine) || { endSeconds: initialSelectedSpan.startMinutes + initialSelectedSpan.durationMinutes, startSeconds: initialSelectedSpan.startMinutes }
    : null
  const nextCode = updateMermaidGanttCodeRowTiming(args)
  if (!nextCode) return null
  const groupLineIndexes = readVideoSequenceClipGroupLineIndexes(args)
  if (groupLineIndexes.length <= 1) return nextCode
  const selectedLine = String(nextCode || '').split('\n')[args.rowLineIndex]
  const selectedSpan = buildMermaidGanttTimelineModel(nextCode).taskSpans.find(span => span.lineIndex === args.rowLineIndex)
  if (typeof selectedLine !== 'string' || !selectedSpan) return nextCode
  const selectedAbsoluteStartMinutes = readSpanAbsoluteStartMinutes({
    code: nextCode,
    line: selectedLine,
    span: selectedSpan,
  })
  if (selectedAbsoluteStartMinutes == null) return nextCode
  const selectedSourceRange = readMermaidGanttLineSourceRange(selectedLine) || initialSourceRange || {
    endSeconds: selectedSpan.startMinutes + selectedSpan.durationMinutes,
    startSeconds: selectedSpan.startMinutes,
  }
  let syncedCode = nextCode
  for (const lineIndex of groupLineIndexes) {
    if (lineIndex === args.rowLineIndex) continue
    syncedCode = updateMermaidGanttCodeRowToTiming({
      absoluteStartMinutes: selectedAbsoluteStartMinutes,
      code: syncedCode,
      durationMinutes: selectedSpan.durationMinutes,
      rowLineIndex: lineIndex,
      sourceRange: selectedSourceRange,
    }) || syncedCode
  }
  return syncedCode === args.code ? null : syncedCode
}

export type MermaidGanttVideoSequenceTimingSyncMode = 'grouped' | 'selected'

export function updateMermaidGanttVideoSequenceClipTiming(args: {
  code: string
  rowLineIndex: number
  mode: MermaidGanttBarDragMode
  deltaMinutes: number
  syncMode: MermaidGanttVideoSequenceTimingSyncMode
}): string | null {
  if (args.syncMode === 'grouped') {
    return updateMermaidGanttVideoSequenceClipGroupTiming(args)
  }
  return updateMermaidGanttCodeRowTiming(args)
}

function readMermaidGanttSectionRangeForLine(lines: readonly string[], rowLineIndex: number): { endIndex: number; startIndex: number } | null {
  if (rowLineIndex < 0 || rowLineIndex >= lines.length) return null
  let startIndex = rowLineIndex
  while (startIndex >= 0 && !/^\s*section\s+/i.test(lines[startIndex] || '')) startIndex -= 1
  if (startIndex < 0) return null
  let endIndex = startIndex + 1
  while (endIndex < lines.length && !/^\s*section\s+/i.test(lines[endIndex] || '')) endIndex += 1
  return rowLineIndex > startIndex && rowLineIndex < endIndex ? { endIndex, startIndex } : null
}

export function reorderMermaidGanttVideoSequenceClipDisplayLane(args: {
  code: string
  displayLaneDelta: number
  rowLineIndex: number
}): { code: string; lineIndex: number } | null {
  const lines = String(args.code || '').split('\n')
  const line = lines[args.rowLineIndex]
  if (typeof line !== 'string' || !line.includes(':')) return null
  const displayLaneDelta = Math.trunc(Number(args.displayLaneDelta) || 0)
  if (!displayLaneDelta) return null
  const sectionRange = readMermaidGanttSectionRangeForLine(lines, args.rowLineIndex)
  if (!sectionRange) return null
  const model = buildMermaidGanttTimelineModel(args.code)
  const sectionLineIndexes = model.taskSpans
    .map(span => span.lineIndex)
    .filter(lineIndex => lineIndex > sectionRange.startIndex && lineIndex < sectionRange.endIndex)
    .sort((left, right) => left - right)
  const currentOrderIndex = sectionLineIndexes.indexOf(args.rowLineIndex)
  if (currentOrderIndex < 0) return null
  const targetOrderIndex = Math.max(0, Math.min(sectionLineIndexes.length - 1, currentOrderIndex + displayLaneDelta))
  if (targetOrderIndex === currentOrderIndex) return null
  const [movedLine] = lines.splice(args.rowLineIndex, 1)
  const targetLineIndexBeforeRemoval = sectionLineIndexes[targetOrderIndex]
  const insertIndex = targetLineIndexBeforeRemoval
  lines.splice(insertIndex, 0, movedLine as string)
  return {
    code: lines.join('\n'),
    lineIndex: insertIndex,
  }
}

export function splitMermaidGanttCodeRowAtOffset(args: {
  code: string
  rowLineIndex: number
  splitOffsetMinutes: number
}): string | null {
  const lines = String(args.code || '').split('\n')
  const line = lines[args.rowLineIndex]
  if (typeof line !== 'string' || !line.includes(':')) return null
  const span = buildMermaidGanttTimelineModel(args.code).taskSpans.find(item => item.lineIndex === args.rowLineIndex)
  if (!span) return null
  const splitOffsetMinutes = Number(Number(args.splitOffsetMinutes).toFixed(3))
  if (splitOffsetMinutes <= 0 || splitOffsetMinutes >= span.durationMinutes) return null
  const absoluteStartMinutes = readSpanAbsoluteStartMinutes({ code: args.code, line, span })
  if (absoluteStartMinutes == null) return null
  const label = readGanttTaskLabel(line)
  const tokens = readGanttTaskTokens(line)
  const positionToken = tokens.find(token => readClockMinutes(token) != null) || ''
  const metaTokens = readGanttTimingMetaTokens(tokens)
  const shouldWriteSourceRange = shouldWriteVideoSequenceSourceRange({ code: args.code, line })
  const sourceRange = readMermaidGanttLineSourceRange(line) || {
    endSeconds: span.startMinutes + span.durationMinutes,
    startSeconds: span.startMinutes,
  }
  const indent = readGanttLineIndent(line)
  const firstLine = buildGanttTaskLine({
    absoluteStartMinutes,
    durationMinutes: splitOffsetMinutes,
    indent,
    label,
    metaTokens: shouldWriteSourceRange
      ? upsertMermaidGanttSourceRangeToken(metaTokens, resolveMermaidGanttSourceRangeSplitSeconds({
        side: 'left',
        sourceRange,
        timelineDurationMinutes: span.durationMinutes,
        timelineOffsetMinutes: splitOffsetMinutes,
      }))
      : metaTokens,
    positionToken,
  })
  const secondLine = buildGanttTaskLine({
    absoluteStartMinutes: absoluteStartMinutes + splitOffsetMinutes,
    durationMinutes: span.durationMinutes - splitOffsetMinutes,
    indent,
    label: `${label} splice`,
    metaTokens: shouldWriteSourceRange
      ? upsertMermaidGanttSourceRangeToken(appendGanttTaskIdSuffix(metaTokens, 'splice'), resolveMermaidGanttSourceRangeSplitSeconds({
        side: 'right',
        sourceRange,
        timelineDurationMinutes: span.durationMinutes,
        timelineOffsetMinutes: splitOffsetMinutes,
      }))
      : appendGanttTaskIdSuffix(metaTokens, 'splice'),
    positionToken,
  })
  lines.splice(args.rowLineIndex, 1, firstLine, secondLine)
  return lines.join('\n')
}

export function splitMermaidGanttVideoSequenceClipGroupAtOffset(args: {
  code: string
  rowLineIndex: number
  splitOffsetMinutes: number
}): string | null {
  const groupLineIndexes = readVideoSequenceClipGroupLineIndexes(args)
  if (groupLineIndexes.length <= 1) return splitMermaidGanttCodeRowAtOffset(args)
  let nextCode = String(args.code || '')
  for (const lineIndex of groupLineIndexes.slice().sort((a, b) => b - a)) {
    const updated = splitMermaidGanttCodeRowAtOffset({
      code: nextCode,
      rowLineIndex: lineIndex,
      splitOffsetMinutes: args.splitOffsetMinutes,
    })
    if (updated) nextCode = updated
  }
  return nextCode === args.code ? null : nextCode
}

export function splitMermaidGanttVideoSequenceClipAtOffset(args: {
  code: string
  rowLineIndex: number
  splitOffsetMinutes: number
  syncMode: MermaidGanttVideoSequenceTimingSyncMode
}): string | null {
  if (args.syncMode === 'grouped') {
    return splitMermaidGanttVideoSequenceClipGroupAtOffset(args)
  }
  return splitMermaidGanttCodeRowAtOffset(args)
}

export function insertMermaidGanttVideoSequenceOperationRow(args: {
  code: string
  rowLineIndex: number
  operation: MermaidGanttVideoSequenceOperation
}): string | null {
  const lines = String(args.code || '').split('\n')
  const line = lines[args.rowLineIndex]
  if (typeof line !== 'string' || !line.includes(':')) return null
  const groupKey = resolveVideoSequenceClipGroupKey(line)
  if (groupKey) {
    const existingLineIndex = buildMermaidGanttTimelineModel(args.code).taskSpans.find(span => {
      const candidateLine = lines[span.lineIndex]
      return (
        typeof candidateLine === 'string' &&
        resolveVideoSequenceClipGroupKey(candidateLine) === groupKey &&
        readVideoSequenceOperationFromLine(candidateLine) === args.operation
      )
    })?.lineIndex
    if (typeof existingLineIndex === 'number') return args.code
  }
  const span = buildMermaidGanttTimelineModel(args.code).taskSpans.find(item => item.lineIndex === args.rowLineIndex)
  if (!span) return null
  const absoluteStartMinutes = readSpanAbsoluteStartMinutes({ code: args.code, line, span })
  if (absoluteStartMinutes == null) return null
  const shouldWriteSourceRange = shouldWriteVideoSequenceSourceRange({ code: args.code, line })
  const sourceRange = readMermaidGanttLineSourceRange(line) || {
    endSeconds: span.startMinutes + span.durationMinutes,
    startSeconds: span.startMinutes,
  }
  const label = `${readGanttTaskLabel(line)} ${args.operation}`
  const operationLine = buildGanttTaskLine({
    absoluteStartMinutes,
    durationMinutes: Math.max(1, span.durationMinutes),
    indent: readGanttLineIndent(line),
    label,
    metaTokens: shouldWriteSourceRange
      ? upsertMermaidGanttSourceRangeToken(
        appendGanttTaskIdSuffix(readGanttTimingMetaTokens(readGanttTaskTokens(line)), args.operation),
        sourceRange,
      )
      : appendGanttTaskIdSuffix(readGanttTimingMetaTokens(readGanttTaskTokens(line)), args.operation),
  })
  lines.splice(args.rowLineIndex + 1, 0, operationLine)
  return lines.join('\n')
}

export function replaceFirstMermaidGanttFrontmatterCode(markdownText: string, nextCode: string): string | null {
  const lines = String(markdownText || '').split('\n')
  if (lines[0]?.trim() !== '---') return null
  const frontmatterEndIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (frontmatterEndIndex <= 0) return null
  const typeIndex = lines.findIndex((line, index) => index > 0 && index < frontmatterEndIndex && /^\s*type\s*:\s*(?:mermaid_gantt|'mermaid_gantt'|"mermaid_gantt")(?:\s+#.*)?\s*$/.test(line))
  if (typeIndex <= 0) return null
  const valueIndex = lines.findIndex((line, index) => {
    if (index <= typeIndex || index >= frontmatterEndIndex) return false
    return /^(\s*)value\s*:\s*\|[-+]?/.test(line)
  })
  if (valueIndex <= typeIndex) return null
  const valueIndent = (lines[valueIndex]?.match(/^(\s*)/)?.[1] || '').length
  let codeStartIndex = valueIndex + 1
  while (codeStartIndex < frontmatterEndIndex && lines[codeStartIndex]?.trim() === '') codeStartIndex += 1
  if (codeStartIndex >= frontmatterEndIndex) return null
  const codeIndentText = lines[codeStartIndex]?.match(/^(\s*)/)?.[1] || '  '.repeat(Math.ceil((valueIndent + 2) / 2))
  let codeEndIndex = codeStartIndex
  while (codeEndIndex < frontmatterEndIndex) {
    const line = lines[codeEndIndex] || ''
    const indent = (line.match(/^(\s*)/)?.[1] || '').length
    if (line.trim() !== '' && indent <= valueIndent) break
    codeEndIndex += 1
  }
  const nextCodeLines = String(nextCode || '').split('\n').map(line => `${codeIndentText}${line}`)
  return [
    ...lines.slice(0, codeStartIndex),
    ...nextCodeLines,
    ...lines.slice(codeEndIndex),
  ].join('\n')
}
