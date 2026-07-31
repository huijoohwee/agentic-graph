import {
  XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  XR_MOTION_REFERENCE_STAGE_PRESETS,
} from '@/features/three/xrSceneLibrary'

export function assertSingaporeEnvironmentCardSemantics(
  xrMediaLibrary: string,
): void {
  const singaporeStage = XR_MOTION_REFERENCE_STAGE_PRESETS.find(
    stage => stage.id === XR_MOTION_REFERENCE_DEFAULT_STAGE_ID,
  )
  const cardSource = xrMediaLibrary.slice(
    xrMediaLibrary.indexOf('function XrLibraryCard'),
    xrMediaLibrary.indexOf('function XrAssetRow'),
  )
  const cardOpening = cardSource.match(/<article[\s\S]*?>/)?.[0] || ''
  const environmentCards = xrMediaLibrary.slice(
    xrMediaLibrary.indexOf('visibleEnvironments.map(stage =>'),
    xrMediaLibrary.indexOf(
      '</CollapsibleSection>',
      xrMediaLibrary.indexOf('visibleEnvironments.map(stage =>'),
    ),
  )
  if (
    singaporeStage?.id !== 'singapore'
    || singaporeStage.label !== 'Singapore'
    || !cardOpening.startsWith('<article')
    || !cardOpening.includes('aria-label={`${label}. Drag onto the Canvas.`}')
    || cardOpening.includes('aria-hidden')
    || !environmentCards.includes('<XrLibraryCard')
    || !environmentCards.includes('label={stage.label}')
    || !environmentCards.includes(
      "dataAttributes={{ 'data-kg-media-xr-environment': stage.id }}",
    )
  ) {
    throw new Error(
      'expected the Singapore Environment Kit to remain a visible accessible ARTICLE named “Singapore. Drag onto the Canvas.”',
    )
  }
}
