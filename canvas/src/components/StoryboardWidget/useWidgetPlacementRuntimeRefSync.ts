import React from 'react'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import type { GraphSchema } from '@/lib/graph/schema'

export function useWidgetPlacementRuntimeRefSync(args: {
  node: unknown
  nodeRef: React.MutableRefObject<unknown>
  floating: boolean
  floatingRef: React.MutableRefObject<boolean>
  viewportW: number
  viewportH: number
  viewportRef: React.MutableRefObject<{ width: number; height: number }>
  canvasWindowOffset?: { left: number; top: number } | null
  canvasWindowOffsetRef: React.MutableRefObject<{ left: number; top: number }>
  schema: unknown
  schemaRef: React.MutableRefObject<GraphSchema | null>
  floatingUsesScreenAuthority: boolean
  storyboardWidgetSurfaceId?: string | null
  graphMetaKey?: string | null
  nodeId: string
  screenAuthorityZoomBaselineKRef: React.MutableRefObject<number | null>
  screenAuthorityLayoutZoomBaseRef: React.MutableRefObject<{ left: number; top: number; scale: number } | null>
  screenAuthorityHandoffPosRef: React.MutableRefObject<{ left: number; top: number; scale: number } | null>
}) {
  const {
    node,
    nodeRef,
    floating,
    floatingRef,
    viewportW,
    viewportH,
    viewportRef,
    canvasWindowOffset,
    canvasWindowOffsetRef,
    schema,
    schemaRef,
    floatingUsesScreenAuthority,
    storyboardWidgetSurfaceId,
    graphMetaKey,
    nodeId,
    screenAuthorityZoomBaselineKRef,
    screenAuthorityLayoutZoomBaseRef,
    screenAuthorityHandoffPosRef,
  } = args

  React.useEffect(() => {
    nodeRef.current = node
  }, [node, nodeRef])

  React.useEffect(() => {
    screenAuthorityZoomBaselineKRef.current = null
  }, [floatingUsesScreenAuthority, storyboardWidgetSurfaceId, graphMetaKey, nodeId, screenAuthorityZoomBaselineKRef])

  React.useEffect(() => {
    screenAuthorityLayoutZoomBaseRef.current = null
    screenAuthorityHandoffPosRef.current = null
  }, [storyboardWidgetSurfaceId, graphMetaKey, nodeId, screenAuthorityHandoffPosRef, screenAuthorityLayoutZoomBaseRef])

  React.useEffect(() => {
    viewportRef.current = { width: viewportW, height: viewportH }
  }, [viewportH, viewportRef, viewportW])

  useIsomorphicLayoutEffect(() => {
    canvasWindowOffsetRef.current = canvasWindowOffset && Number.isFinite(canvasWindowOffset.left) && Number.isFinite(canvasWindowOffset.top)
      ? { left: canvasWindowOffset.left, top: canvasWindowOffset.top }
      : { left: 0, top: 0 }
  }, [canvasWindowOffset, canvasWindowOffsetRef])

  React.useEffect(() => {
    schemaRef.current = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema as GraphSchema : null
  }, [schema, schemaRef])

  useIsomorphicLayoutEffect(() => {
    floatingRef.current = floating
  }, [floating, floatingRef])
}
