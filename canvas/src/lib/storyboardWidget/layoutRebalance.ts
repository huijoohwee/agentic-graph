export type StoryboardWidgetLayoutTargetTransform = {
  k: number
  x: number
  y: number
}

export type StoryboardWidgetLayoutRebalanceRequest = {
  type: 'balanced-spread'
  at: number
  reason?: 'zoom-preset' | 'content-materialization'
  targetTransform?: StoryboardWidgetLayoutTargetTransform
}

export type StoryboardWidgetLayoutRebalanceOptions = Pick<
  StoryboardWidgetLayoutRebalanceRequest,
  'reason' | 'targetTransform'
>

export function readStoryboardWidgetLayoutTargetTransform(
  request: StoryboardWidgetLayoutRebalanceRequest | null | undefined,
): StoryboardWidgetLayoutTargetTransform | null {
  const target = request?.targetTransform
  if (
    !target
    || !Number.isFinite(target.k)
    || target.k <= 0
    || !Number.isFinite(target.x)
    || !Number.isFinite(target.y)
  ) return null
  return { k: target.k, x: target.x, y: target.y }
}

export function isStoryboardWidgetZoomPresetRebalanceRequest(
  request: StoryboardWidgetLayoutRebalanceRequest | null | undefined,
): boolean {
  return request?.type === 'balanced-spread'
    && request.reason === 'zoom-preset'
    && readStoryboardWidgetLayoutTargetTransform(request) != null
}

export function isStoryboardWidgetContentMaterializationRebalanceRequest(
  request: StoryboardWidgetLayoutRebalanceRequest | null | undefined,
): boolean {
  return request?.type === 'balanced-spread'
    && request.reason === 'content-materialization'
}
