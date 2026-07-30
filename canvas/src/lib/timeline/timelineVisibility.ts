export const TIMELINE_ENABLED_DEFAULT = true

export function resolveTimelineEnabled(value: unknown, fallback = TIMELINE_ENABLED_DEFAULT): boolean {
  if (value === true || value === 'true' || value === '1') return true
  if (value === false || value === 'false' || value === '0') return false
  return fallback
}

export function getTimelineViewModeTitle(enabled: boolean): string {
  return enabled ? 'Timeline: On' : 'Timeline: Off'
}

export function shouldRenderTimelineSurface(args: {
  activeSurface: '2d' | '3d' | 'geo' | 'geo-xr'
  documentSwitchPending?: boolean
  geospatialOverlayOwnsViewport?: boolean
  timelineEnabled: unknown
}): boolean {
  return (
    resolveTimelineEnabled(args.timelineEnabled) &&
    args.activeSurface === '2d' &&
    args.documentSwitchPending !== true &&
    args.geospatialOverlayOwnsViewport !== true
  )
}
