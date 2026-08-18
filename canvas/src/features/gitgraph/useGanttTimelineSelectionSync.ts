import React from 'react'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'

function readTimelineRowKeyLineIndex(rowKey: string): number | null {
  const lineIndex = Number(/^(\d+):task:/.exec(String(rowKey || '').trim())?.[1])
  return Number.isInteger(lineIndex) && lineIndex >= 0 ? lineIndex : null
}

export function shouldSyncTimelineSelectionPlayback(args: {
  playing: boolean
  previousSelectedRowKey: string
  selectedRowKey: string
}): boolean {
  if (!args.selectedRowKey || args.playing) return false
  return readTimelineRowKeyLineIndex(args.previousSelectedRowKey) !== readTimelineRowKeyLineIndex(args.selectedRowKey)
}

export function useGanttTimelineSelectionSync(args: {
  playing: boolean
  positionMinutes: number
  resolveRowKeyAtPosition: (position: number) => string | null
  selectedRowKey: string
  setSelectedRowKey: (rowKey: string) => void
  setTransportPlaybackPosition: (position: number) => void
  positionOnlySelectedRowKeys?: ReadonlySet<string>
  taskSpans: readonly MermaidGanttTimelineTaskSpan[]
}) {
  const previousSelectedRowKeyRef = React.useRef(args.selectedRowKey)
  const skipNextPositionSelectionSyncRef = React.useRef(false)

  React.useEffect(() => {
    const previousSelectedRowKey = previousSelectedRowKeyRef.current
    if (previousSelectedRowKey === args.selectedRowKey) return
    previousSelectedRowKeyRef.current = args.selectedRowKey
    skipNextPositionSelectionSyncRef.current = true
    if (args.positionOnlySelectedRowKeys?.has(args.selectedRowKey)) return
    if (!shouldSyncTimelineSelectionPlayback({
      playing: args.playing,
      previousSelectedRowKey,
      selectedRowKey: args.selectedRowKey,
    })) return
    const selectedSpan = args.taskSpans.find(span => span.rowKey === args.selectedRowKey)
    if (!selectedSpan) return
    if (args.positionMinutes >= selectedSpan.startMinutes && args.positionMinutes <= selectedSpan.endMinutes) return
    args.setTransportPlaybackPosition(selectedSpan.startMinutes)
  }, [args])

  React.useEffect(() => {
    if (skipNextPositionSelectionSyncRef.current) {
      skipNextPositionSelectionSyncRef.current = false
      return
    }
    if (args.positionOnlySelectedRowKeys?.has(args.selectedRowKey)) return
    const selectedSpan = args.taskSpans.find(span => span.rowKey === args.selectedRowKey)
    if (selectedSpan && args.positionMinutes >= selectedSpan.startMinutes && args.positionMinutes <= selectedSpan.endMinutes) return
    const rowKey = args.resolveRowKeyAtPosition(args.positionMinutes)
    if (!rowKey || rowKey === args.selectedRowKey) return
    previousSelectedRowKeyRef.current = rowKey
    args.setSelectedRowKey(rowKey)
  }, [args])
}
