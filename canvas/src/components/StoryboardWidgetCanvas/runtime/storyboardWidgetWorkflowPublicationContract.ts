import type { ImageToThreeJsRunInput } from '@/features/image-to-threejs/imageToThreeJsContract'
import type { AnnotationRunResult } from '@/features/visual-annotation-engine'
import type { GraphNode } from '@/lib/graph/types'
import {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
} from '@/lib/render/richMediaPanelDefaults'
import {
  planStoryboardWidgetRunMaterializationPositions,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from './storyboardWidgetRunExecutionAnchor'

export const readStoryboardWidgetWorkflowPublicationString = (value: unknown): string => {
  const scalar = value && typeof value === 'object' && !Array.isArray(value) && 'value' in value
    ? (value as { value?: unknown }).value
    : value
  return typeof scalar === 'string' ? scalar.trim() : ''
}

export function createStoryboardWidgetRunMaterializationPositionResolver(
  executionAnchor: StoryboardWidgetRunExecutionAnchorSnapshot | null | undefined,
): (
  outputIndex?: number,
  outputCount?: number,
  explicit?: { x: number; y: number } | null,
) => { x: number; y: number } | null {
  return (outputIndex = 0, outputCount = outputIndex + 1, explicit) => {
    if (explicit && Number.isFinite(explicit.x) && Number.isFinite(explicit.y)) return explicit
    if (!executionAnchor) return null
    const index = Math.max(0, Math.floor(Number(outputIndex) || 0))
    const count = Math.max(index + 1, Math.floor(Number(outputCount) || 1))
    return planStoryboardWidgetRunMaterializationPositions({
      snapshot: executionAnchor,
      ...(executionAnchor.defaultFixedCardSize
        ? { sourceItem: executionAnchor.defaultFixedCardSize }
        : {}),
      items: Array.from({ length: count }, () => ({
        width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
        height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
        worldPositionMode: 'top-left' as const,
      })),
      preset: 'richMedia',
    })[index] || null
  }
}

export type StoryboardWidgetMediaRunOutputPublisher = (args: {
  anchorNode: GraphNode
  patch: Record<string, unknown>
}) => void

export type StoryboardWidgetImageToThreeJsRunOutputPublisher = (args: {
  anchorNode: GraphNode
  patch: Record<string, unknown>
}) => void

export type StoryboardWidgetImageToGlbRunOutputPublisher = (args: {
  anchorNode: GraphNode
  patch: Record<string, unknown>
}) => void

export type StoryboardWidgetImageToThreeJsInputRecovery = (anchorNode: GraphNode) => void

export type StoryboardWidgetImageToThreeJsOutputInputResolver = (
  anchorNode: GraphNode,
) => ImageToThreeJsRunInput | null

export type StoryboardWidgetAnnotationRunOutputPublisher = (args: {
  anchorNode: GraphNode
  result: AnnotationRunResult
}) => void

export function resolveMediaPatchActiveTab(args: {
  existingActiveTab: unknown
  patch: Record<string, unknown>
}): string {
  const explicitActiveTab = readStoryboardWidgetWorkflowPublicationString(args.patch.richMediaActiveTab)
  if (explicitActiveTab) return explicitActiveTab
  const existingActiveTab = readStoryboardWidgetWorkflowPublicationString(args.existingActiveTab)
  const hasImage = Boolean(readStoryboardWidgetWorkflowPublicationString(args.patch.imageUrl))
  const hasVideo = Boolean(readStoryboardWidgetWorkflowPublicationString(args.patch.videoUrl))
  const hasAudio = Boolean(readStoryboardWidgetWorkflowPublicationString(args.patch.audioUrl))
  const hasModel = Boolean(readStoryboardWidgetWorkflowPublicationString(args.patch.modelUrl))
  if (existingActiveTab === 'image' && hasImage) return 'image'
  if (existingActiveTab === 'video' && hasVideo) return 'video'
  if (existingActiveTab === 'audio' && hasAudio) return 'audio'
  if (existingActiveTab === 'model' && hasModel) return 'model'
  if (hasImage) return 'image'
  if (hasVideo) return 'video'
  if (hasAudio) return 'audio'
  if (hasModel) return 'model'
  return 'auto'
}
