import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'

import { clampTimelineTransportValue, resolveTimelineTransportPlaybackRate, type TimelineTransportPlaybackRate } from './timelineTransportMath'
export * from './timelineTransportMath'

export type TimelineDocumentTransportStateUpdate = {
  position?: number
  playing?: boolean
  playbackRate?: TimelineTransportPlaybackRate
}

export type TimelineTransportSnapshot = {
  documentKey: string
  position: number
}

export type TimelineTransportSnapshotReader = () => TimelineTransportSnapshot

export type TimelineTransportStoreBinding = {
  transportDocumentKey: string
  transportPosition: number
  transportPlaying: boolean
  transportPlaybackRate: number
  setTimelineTransportState: (update: {
    documentKey?: string | null
    position?: number | null
    playing?: boolean
    playbackRate?: number | null
  }) => void
}

export type TimelineTransportTimingSyncMode = 'grouped' | 'selected'

export type TimelineTransportTimingSyncStoreBinding = {
  autoSnappingEnabled: boolean
  rippleEditingEnabled: boolean
  timingSyncMode: TimelineTransportTimingSyncMode
  setTimelineTransportAutoSnappingEnabled: (enabled: boolean) => void
  setTimelineTransportRippleEditingEnabled: (enabled: boolean) => void
  setTimelineTransportTimingSyncMode: (mode: TimelineTransportTimingSyncMode) => void
}

export type TimelineDocumentStoreBinding = {
  markdownDocumentName: string
  markdownText: string
}

export function resolveTimelineTransportSnapshot(args: {
  transportDocumentKey: unknown
  transportPosition: unknown
}): TimelineTransportSnapshot {
  return {
    documentKey: String(args.transportDocumentKey || '').trim(),
    position: Number.isFinite(args.transportPosition)
      ? Math.max(0, Number(args.transportPosition))
      : 0,
  }
}

export function useTimelineTransportSnapshotReader(args: {
  transportDocumentKey: string
  transportPosition: number
}): TimelineTransportSnapshotReader {
  const snapshot = React.useMemo(() => resolveTimelineTransportSnapshot({
    transportDocumentKey: args.transportDocumentKey,
    transportPosition: args.transportPosition,
  }), [args.transportDocumentKey, args.transportPosition])
  const snapshotRef = React.useRef(snapshot)
  snapshotRef.current = snapshot
  return React.useCallback(() => snapshotRef.current, [])
}

export function useTimelineTransportStoreBinding(): TimelineTransportStoreBinding {
  return useGraphStore(
    useShallow(state => ({
      transportDocumentKey: state.timelineTransportDocumentKey || '',
      transportPosition: state.timelineTransportPosition || 0,
      transportPlaying: state.timelineTransportPlaying === true,
      transportPlaybackRate: state.timelineTransportPlaybackRate || 1,
      setTimelineTransportState: state.setTimelineTransportState,
    })),
  )
}

export function useTimelineTransportTimingSyncStoreBinding(): TimelineTransportTimingSyncStoreBinding {
  return useGraphStore(
    useShallow(state => ({
      autoSnappingEnabled: state.timelineTransportAutoSnappingEnabled !== false,
      rippleEditingEnabled: state.timelineTransportRippleEditingEnabled === true,
      timingSyncMode: state.timelineTransportTimingSyncMode === 'selected' ? 'selected' : 'grouped',
      setTimelineTransportAutoSnappingEnabled: state.setTimelineTransportAutoSnappingEnabled,
      setTimelineTransportRippleEditingEnabled: state.setTimelineTransportRippleEditingEnabled,
      setTimelineTransportTimingSyncMode: state.setTimelineTransportTimingSyncMode,
    })),
  )
}

export function useTimelineDocumentStoreBinding(): TimelineDocumentStoreBinding {
  return useGraphStore(
    useShallow(state => ({
      markdownDocumentName: state.markdownDocumentName || '',
      markdownText: state.markdownDocumentText || '',
    })),
  )
}

export function useTimelineDocumentTransportController(args: {
  active?: boolean
  documentKey: string
  maxPosition: number
  transportDocumentKey: string
  transportPosition: number
  transportPlaying: boolean
  transportPlaybackRate: unknown
  defaultPlaybackRate?: TimelineTransportPlaybackRate
  setTimelineTransportState: (update: {
    documentKey?: string | null
    position?: number | null
    playing?: boolean
    playbackRate?: number | null
  }) => void
}) {
  const playbackPosition = React.useMemo(
    () => (
      args.transportDocumentKey === args.documentKey
        ? clampTimelineTransportValue(args.transportPosition, 0, args.maxPosition)
        : 0
    ),
    [args.documentKey, args.maxPosition, args.transportDocumentKey, args.transportPosition],
  )
  const playing = args.transportDocumentKey === args.documentKey && args.transportPlaying
  const playbackRate = resolveTimelineTransportPlaybackRate(
    args.transportPlaybackRate,
    args.defaultPlaybackRate || 1,
  )
  const updateDocumentTransportState = React.useCallback((update: TimelineDocumentTransportStateUpdate) => {
    args.setTimelineTransportState({
      documentKey: args.documentKey,
      ...update,
    })
  }, [args.documentKey, args.setTimelineTransportState])
  const setTransportPlaybackPosition = React.useCallback((nextPosition: number) => {
    updateDocumentTransportState({
      position: clampTimelineTransportValue(nextPosition, 0, Math.max(0, args.maxPosition)),
    })
  }, [args.maxPosition, updateDocumentTransportState])
  const setTransportPlaying = React.useCallback((nextPlaying: boolean) => {
    updateDocumentTransportState({ playing: nextPlaying })
  }, [updateDocumentTransportState])
  const setTransportPlaybackRate = React.useCallback((nextRate: TimelineTransportPlaybackRate) => {
    updateDocumentTransportState({ playbackRate: nextRate })
  }, [updateDocumentTransportState])

  React.useEffect(() => {
    if (args.active === false || !args.documentKey) return
    if (args.transportDocumentKey !== args.documentKey) {
      args.setTimelineTransportState({ documentKey: args.documentKey })
      return
    }
    if (args.maxPosition <= 0) {
      if (args.transportPlaying || args.transportPosition !== 0) {
        args.setTimelineTransportState({
          documentKey: args.documentKey,
          playing: false,
          position: 0,
        })
      }
      return
    }
    const clampedPosition = clampTimelineTransportValue(args.transportPosition, 0, args.maxPosition)
    if (Math.abs(clampedPosition - args.transportPosition) > 0.001) {
      args.setTimelineTransportState({
        documentKey: args.documentKey,
        position: clampedPosition,
      })
    }
  }, [
    args.active,
    args.documentKey,
    args.maxPosition,
    args.setTimelineTransportState,
    args.transportDocumentKey,
    args.transportPosition,
    args.transportPlaying,
  ])

  return {
    playbackPosition,
    playing,
    playbackRate,
    updateDocumentTransportState,
    setTransportPlaybackPosition,
    setTransportPlaying,
    setTransportPlaybackRate,
  }
}

type TimelinePlaybackState = {
  position: number
  max: number
  playbackRate: number
  unitsPerMs: number
  onPositionChange: (position: number) => void
  onPlaybackEnd: () => void
  onPlaybackFrame?: (position: number) => void
  onPlaybackStart?: (position: number, signal: AbortSignal) => Promise<void> | void
  onPlaybackComplete?: (position: number, signal: AbortSignal) => Promise<void> | void
}

/** The native Timeline RAF driver, shared by the hook and deterministic lifecycle tests. */
export function startTimelineTransportPlayback(args: {
  readState: () => TimelinePlaybackState
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (id: number) => void
  now: () => number
  isCurrent?: () => boolean
}): () => void {
  const lifetime = new AbortController()
  let frameId = 0
  let previousTimestamp: number | null = null
  let firstFrame = true
  const alive = () => {
    if (args.isCurrent?.() === false) lifetime.abort()
    return !lifetime.signal.aborted
  }
  const acknowledge = (current: TimelinePlaybackState, position: number, boundary: TimelinePlaybackState['onPlaybackStart'], next: () => void): boolean => {
    const fail = () => {
      if (!alive()) return
      lifetime.abort(); current.onPlaybackEnd()
    }
    try {
      const hold = boundary?.(position, lifetime.signal)
      if (!hold) return false
      void hold.then(() => { if (alive()) next() }, fail)
    } catch { fail() }
    return true
  }
  const tick = (timestamp: number) => {
    if (!alive()) return
    const current = args.readState()
    const elapsedMs = previousTimestamp === null ? 0 : Math.max(0, timestamp - previousTimestamp)
    previousTimestamp = timestamp
    const nextPosition = clampTimelineTransportValue(
      current.position + elapsedMs * current.unitsPerMs * current.playbackRate, 0, current.max,
    )
    current.position = nextPosition
    current.onPositionChange(nextPosition)
    if (!alive()) return
    current.onPlaybackFrame?.(nextPosition)
    if (!alive()) return
    if (nextPosition >= current.max) {
      if (!acknowledge(current, nextPosition, current.onPlaybackComplete, () => current.onPlaybackEnd()) && alive()) current.onPlaybackEnd()
      return
    }
    if (firstFrame) {
      firstFrame = false
      if (acknowledge(current, nextPosition, current.onPlaybackStart, () => {
        // Start elapsed time at the recorder acknowledgement, not the first RAF.
        previousTimestamp = args.now()
        frameId = args.requestFrame(tick)
      })) return
    }
    if (alive()) frameId = args.requestFrame(tick)
  }
  frameId = args.requestFrame(tick)
  return () => { lifetime.abort(); args.cancelFrame(frameId) }
}

export function useTimelineTransportPlayback(args: TimelinePlaybackState & {
  active: boolean
  playing: boolean
  documentKey?: string
}) {
  const stateRef = React.useRef<TimelinePlaybackState>({ ...args })
  React.useEffect(() => { stateRef.current = { ...args } }, [args])
  React.useEffect(() => {
    if (!args.active || !args.playing || args.max <= 0 || args.unitsPerMs <= 0) return
    if (typeof window === 'undefined') return
    return startTimelineTransportPlayback({
      readState: () => stateRef.current,
      requestFrame: callback => window.requestAnimationFrame(callback),
      cancelFrame: id => window.cancelAnimationFrame(id),
      now: () => performance.now(),
      isCurrent: () => {
        if (!args.documentKey) return true
        const transport = useGraphStore.getState()
        return transport.timelineTransportDocumentKey === args.documentKey && transport.timelineTransportPlaying
      },
    })
  }, [args.active, args.documentKey, args.max, args.playing, args.unitsPerMs])
}
