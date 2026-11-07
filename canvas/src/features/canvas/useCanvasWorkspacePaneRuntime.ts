import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  WORKSPACE_EDITOR_CANVAS_GUTTER_PX,
  resolveWorkspaceEditorPaneMinWidthPx,
  resolveWorkspaceEditorPaneDefaultWidthPx,
  resolveWorkspacePaneMaxWidthPx,
} from '@/features/workspace-table/workspaceViewCanvasDefaults'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'

type CanvasWorkspacePaneResizeHandleRuntimeModule = {
  bindCanvasWorkspacePaneResizeHandleRuntime: (args: {
    resizeHandleEl: HTMLHRElement
    readCurrentWidthPx: () => number
    setWorkspacePreviewWidthPx: (next: number) => void
    commitWorkspacePreviewWidthPx: (next: number) => void
    resolveWorkspacePreviewWidthFromPointerDrag: (input: {
      startWidthPx: number
      startClientX: number
      currentClientX: number
    }) => number
  }) => () => void
}

let canvasWorkspacePaneResizeHandleRuntimePromise: Promise<CanvasWorkspacePaneResizeHandleRuntimeModule> | null = null

const loadCanvasWorkspacePaneResizeHandleRuntime = (): Promise<CanvasWorkspacePaneResizeHandleRuntimeModule> => {
  if (!canvasWorkspacePaneResizeHandleRuntimePromise) {
    canvasWorkspacePaneResizeHandleRuntimePromise = import('@/features/canvas/canvasWorkspacePaneResizeHandleRuntime')
      .then(mod => mod as CanvasWorkspacePaneResizeHandleRuntimeModule)
      .catch(err => {
        canvasWorkspacePaneResizeHandleRuntimePromise = null
        throw err
      })
  }
  return canvasWorkspacePaneResizeHandleRuntimePromise
}

function resolveWorkspacePreviewWidthBounds() {
  const minPx = resolveWorkspaceEditorPaneMinWidthPx()
  const maxPx = resolveWorkspacePaneMaxWidthPx({
    minPx,
    rightGutterPx: WORKSPACE_EDITOR_CANVAS_GUTTER_PX,
  })
  return { minPx, maxPx }
}

function clampWorkspacePreviewWidthPx(widthPx: number): number {
  const bounds = resolveWorkspacePreviewWidthBounds()
  return Math.max(bounds.minPx, Math.min(bounds.maxPx, widthPx))
}

function resolveWorkspacePreviewDefaultWidthPx(): number {
  const bounds = resolveWorkspacePreviewWidthBounds()
  return clampWorkspacePreviewWidthPx(
    resolveWorkspaceEditorPaneDefaultWidthPx({
      minPx: bounds.minPx,
      maxPx: bounds.maxPx,
    }),
  )
}

export function resolveWorkspacePreviewWidthFromPointerDrag(args: {
  startWidthPx: number
  startClientX: number
  currentClientX: number
}): number {
  const dx = args.currentClientX - args.startClientX
  return clampWorkspacePreviewWidthPx(Math.round(args.startWidthPx + dx))
}

export function useCanvasWorkspacePaneRuntime(options: { compactForOverview?: boolean } = {}): {
  workspacePreviewWidthPx: number
  setResizeHandleEl: React.Dispatch<React.SetStateAction<HTMLHRElement | null>>
} {
  const workspaceEditorOverlayOpen = useGraphStore(s => isWorkspaceEditorOverlayOpen(s))
  const [workspacePreviewWidthPx, setWorkspacePreviewWidthPx] = React.useState(() => resolveWorkspacePreviewDefaultWidthPx())
  const workspacePreviewWidthPxRef = React.useRef(workspacePreviewWidthPx)
  workspacePreviewWidthPxRef.current = workspacePreviewWidthPx
  const previousCompactWidthRef = React.useRef<number | null>(null)
  const compactForOverviewRef = React.useRef(false)
  const [resizeHandleEl, setResizeHandleEl] = React.useState<HTMLHRElement | null>(null)

  React.useEffect(() => {
    if (options.compactForOverview && !compactForOverviewRef.current) {
      compactForOverviewRef.current = true
      previousCompactWidthRef.current = workspacePreviewWidthPxRef.current
      setWorkspacePreviewWidthPx(clampWorkspacePreviewWidthPx(360))
      return
    }
    if (!options.compactForOverview && compactForOverviewRef.current) {
      compactForOverviewRef.current = false
      const previousWidth = previousCompactWidthRef.current
      previousCompactWidthRef.current = null
      if (previousWidth !== null) setWorkspacePreviewWidthPx(clampWorkspacePreviewWidthPx(previousWidth))
    }
  }, [options.compactForOverview])

  const wasEditorOverlayOpenRef = React.useRef<boolean>(workspaceEditorOverlayOpen)
  React.useEffect(() => {
    const wasOpen = wasEditorOverlayOpenRef.current
    wasEditorOverlayOpenRef.current = workspaceEditorOverlayOpen
    if (!workspaceEditorOverlayOpen || wasOpen) return
    const next = resolveWorkspacePreviewDefaultWidthPx()
    if (next === workspacePreviewWidthPxRef.current) return
    setWorkspacePreviewWidthPx(next)
  }, [workspaceEditorOverlayOpen])

  React.useEffect(() => {
    const bounds = resolveWorkspacePreviewWidthBounds()
    if (!Number.isFinite(workspacePreviewWidthPx) || workspacePreviewWidthPx < bounds.minPx || workspacePreviewWidthPx > bounds.maxPx) {
      const next = clampWorkspacePreviewWidthPx(
        Number.isFinite(workspacePreviewWidthPx)
          ? workspacePreviewWidthPx
          : resolveWorkspacePreviewDefaultWidthPx(),
      )
      setWorkspacePreviewWidthPx(next)
    }
  }, [workspacePreviewWidthPx])

  React.useEffect(() => {
    const el = resizeHandleEl
    if (!el) return
    let cancelled = false
    let cleanup: (() => void) | null = null
    const commitWorkspacePreviewWidthPx = (next: number) => {
      workspacePreviewWidthPxRef.current = clampWorkspacePreviewWidthPx(next)
    }
    void loadCanvasWorkspacePaneResizeHandleRuntime()
      .then(mod => {
        if (cancelled) return
        cleanup = mod.bindCanvasWorkspacePaneResizeHandleRuntime({
          resizeHandleEl: el,
          readCurrentWidthPx: () => workspacePreviewWidthPxRef.current,
          setWorkspacePreviewWidthPx,
          commitWorkspacePreviewWidthPx,
          resolveWorkspacePreviewWidthFromPointerDrag,
        })
      })
      .catch(() => {
        if (cancelled) return
      })
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [resizeHandleEl])

  return {
    workspacePreviewWidthPx,
    setResizeHandleEl,
  }
}
