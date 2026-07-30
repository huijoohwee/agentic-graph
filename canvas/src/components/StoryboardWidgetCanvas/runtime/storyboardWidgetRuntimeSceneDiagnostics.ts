export type FlowRuntimeZoomTransform = { k: number; x: number; y: number }

const STORYBOARD_WIDGET_RUNTIME_SCENE_TRACE_KEY = '__storyboardWidgetRuntimeSceneDebug'

export function hasViewportOffset(
  transform: FlowRuntimeZoomTransform | null | undefined,
): boolean {
  if (!transform) return false
  return Math.abs(transform.k - 1) > 1e-3
    || Math.abs(transform.x) > 0.5
    || Math.abs(transform.y) > 0.5
}

export function pushStoryboardWidgetRuntimeSceneTrace(entry: {
  reason: string
  sceneNodeCount: number
  positionsReady: boolean
  workspaceMutationBlocked: boolean
  viewportW: number
  viewportH: number
  transform: FlowRuntimeZoomTransform | null
}) {
  if (typeof window === 'undefined') return
  const runtimeWindow = window as Window & {
    [STORYBOARD_WIDGET_RUNTIME_SCENE_TRACE_KEY]?: {
      last: string
      history: Array<{
        ts: number
        reason: string
        sceneNodeCount: number
        positionsReady: boolean
        workspaceMutationBlocked: boolean
        viewportW: number
        viewportH: number
        transform: FlowRuntimeZoomTransform | null
      }>
    }
  }
  const signature = [
    entry.reason,
    entry.sceneNodeCount,
    entry.positionsReady ? 1 : 0,
    entry.workspaceMutationBlocked ? 1 : 0,
    `${entry.viewportW}x${entry.viewportH}`,
    entry.transform
      ? `${Math.round(entry.transform.x)}:${Math.round(entry.transform.y)}:${Math.round(entry.transform.k * 1000)}`
      : 'none',
  ].join('|')
  const current = runtimeWindow[STORYBOARD_WIDGET_RUNTIME_SCENE_TRACE_KEY] || { last: '', history: [] }
  if (current.last === signature) return
  const nextHistory = current.history.concat([{
    ts: Date.now(),
    reason: entry.reason,
    sceneNodeCount: entry.sceneNodeCount,
    positionsReady: entry.positionsReady,
    workspaceMutationBlocked: entry.workspaceMutationBlocked,
    viewportW: entry.viewportW,
    viewportH: entry.viewportH,
    transform: entry.transform,
  }])
  while (nextHistory.length > 32) nextHistory.shift()
  runtimeWindow[STORYBOARD_WIDGET_RUNTIME_SCENE_TRACE_KEY] = {
    last: signature,
    history: nextHistory,
  }
}
