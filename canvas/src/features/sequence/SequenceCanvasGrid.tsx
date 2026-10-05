import React from 'react'
import { zoomIdentity, zoomTransform } from 'd3'
import { CanvasGridOverlaySurface } from '@/components/CanvasGridOverlaySurface'
import { useContainerDims } from '@/hooks/useContainerDims'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readCanvasGridRenderConfigFromSchema } from '@/lib/canvas/canvasGridConfig'

/** Reuse the canvas grid, including toolbar Fit/reset and SVG replacement. */
export function SequenceCanvasGrid({ rootRef, hostRef, svg }: {
  rootRef: React.RefObject<HTMLDivElement | null>
  hostRef: React.RefObject<HTMLDivElement | null>
  svg: string
}) {
  const schema = useGraphStore(state => state.schema)
  const theme = useGraphStore(state => state.resolvedThemeMode)
  const dims = useContainerDims(rootRef)
  const config = React.useMemo(() => readCanvasGridRenderConfigFromSchema(schema), [schema])
  const [revision, redraw] = React.useReducer(value => value + 1, 0)
  React.useEffect(() => {
    if (!config || !hostRef.current) return
    let frame = 0
    const observer = new MutationObserver(records => {
      // Playback changes attributes too. Only the shared zoom group's transform affects the grid.
      if (!records.some(record => record.type === 'childList' ||
        (record.target instanceof Element && record.target.hasAttribute('data-kg-svg-zoom-content')))) return
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; redraw() })
    })
    observer.observe(hostRef.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['transform'] })
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [config, hostRef, svg])
  const getTransform = React.useCallback(() => {
    const element = hostRef.current?.querySelector('svg')
    return element ? zoomTransform(element) : zoomIdentity
  }, [hostRef, svg, revision])
  const getEventTarget = React.useCallback(() => hostRef.current?.querySelector('svg') || null, [hostRef, svg])
  return <CanvasGridOverlaySurface canvasGrid={config} {...dims} getTransform={getTransform}
    getEventTarget={getEventTarget} themeSignal={theme} surfaceId="sequence" />
}
