import {
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS,
} from '@/lib/chatEndpoint'
export {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
} from '@/lib/storyboardWidget/richMediaPanelConfig'
export {
  IMAGE_TO_THREEJS_SKILL_FORM_ID,
  IMAGE_TO_THREEJS_SKILL_NODE_LABEL,
  IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID,
  IMAGE_TO_THREEJS_SKILL_WIDGET_TYPE_ID,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import type { JSONValue } from '@/lib/graph/types'

export type StoryboardWidgetSmartNodeModel = string

export const FLOW_WIDGET_BUNDLE_KIND = 'kg:flow:widgetBundle' as const
export const FLOW_WIDGET_BUNDLE_VERSION = 1 as const

export const FLOW_WIDGET_REGISTRY_METADATA_KEY = 'flow:widgetRegistry' as const

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readWidgetRegistryMetadataEntries<T extends Record<string, unknown> = Record<string, unknown>>(
  metadata: unknown,
): T[] {
  if (!isMetadataRecord(metadata)) return []
  const raw = metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is T => isMetadataRecord(entry))
}

export function writeWidgetRegistryMetadata(
  metadata: Record<string, JSONValue> | null | undefined,
  entries: ReadonlyArray<JSONValue>,
): Record<string, JSONValue> {
  const next = isMetadataRecord(metadata) ? { ...metadata } : {}
  if (entries.length > 0) {
    next[FLOW_WIDGET_REGISTRY_METADATA_KEY] = entries as unknown as JSONValue
    return next as Record<string, JSONValue>
  }
  delete next[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  return next as Record<string, JSONValue>
}

export const FLOW_WIDGET_DRAG_KIND = 'kg:flow:widgetDrag' as const
export const FLOW_WIDGET_DRAG_VERSION = 1 as const
export const FLOW_WIDGET_DRAG_MIME = 'application/x-kg-flow-widget' as const

export const FLOW_IMAGE_GENERATION_NODE_TYPE_ID = 'ImageGeneration' as const
export const FLOW_IMAGE_GENERATION_NODE_LABEL = 'BytePlus Image Widget' as const

export const FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID = 'VideoTranscriber' as const
export const FLOW_VIDEO_TRANSCRIBER_NODE_LABEL = 'Video Transcriber Widget' as const
export const FLOW_VIDEO_TRANSCRIBER_WIDGET_TYPE_ID = 'default' as const
export const FLOW_VIDEO_TRANSCRIBER_FORM_ID = 'videoTranscriber' as const
export const FLOW_TEXT_GENERATION_NODE_TYPE_ID = 'TextGeneration' as const
export const FLOW_TEXT_GENERATION_NODE_LABEL = 'Widget Card' as const
export const FLOW_VIDEO_GENERATION_NODE_TYPE_ID = 'VideoGeneration' as const
export const FLOW_VIDEO_GENERATION_NODE_LABEL = 'BytePlus Video Widget' as const
export const FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID = 'HtmlVideoRenderer' as const
export const FLOW_HTML_VIDEO_RENDERER_NODE_LABEL = 'HTML Video Renderer Widget' as const
export const FLOW_HTML_VIDEO_RENDERER_WIDGET_TYPE_ID = 'default' as const
export const FLOW_HTML_VIDEO_RENDERER_FORM_ID = 'htmlVideoRenderer' as const
export const FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID = 'AnnotationEngine' as const
export const FLOW_ANNOTATION_ENGINE_NODE_LABEL = 'Annotation Engine' as const
export const FLOW_ANNOTATION_ENGINE_WIDGET_TYPE_ID = 'default' as const
export const FLOW_ANNOTATION_ENGINE_FORM_ID = 'annotationEngine' as const
export const FLOW_SWARM_PREDICTION_NODE_TYPE_ID = 'SwarmPrediction' as const
export const FLOW_SWARM_PREDICTION_NODE_LABEL = 'Swarm Prediction Engine' as const
export const FLOW_SWARM_PREDICTION_WIDGET_TYPE_ID = 'default' as const
export const FLOW_SWARM_PREDICTION_FORM_ID = 'swarmPrediction' as const
export const FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID = 'StoryboardElement' as const
export const FLOW_STORYBOARD_ELEMENT_NODE_LABEL = 'Storyboard Element Widget' as const
export const FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID = 'default' as const
export const FLOW_STORYBOARD_ELEMENT_FORM_ID = 'storyboardElement' as const

export const FLOW_VIDEO_SCRIPT_FORM_ID = 'videoScript' as const
export const FLOW_VIDEO_SCRIPT_WIDGET_LABEL = 'BytePlus Video Script Widget' as const
export const FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID = 'videoScript.openai' as const
export const FLOW_OPENAI_VIDEO_SCRIPT_WIDGET_LABEL = 'OpenAI Video Script Widget' as const

const FLOW_TEXT_GENERATION_SEED_PROMPT_DEFAULT = 'Generate a text response for the active request.'
const FLOW_VIDEO_SCRIPT_SEED_PROMPT_DEFAULT =
  'Generate a complete markdown document for a minimal Text → Image → Video workflow. Include YAML frontmatter with $schema="agentic-os-pipeline/v1", an editable inputs block (vibe, duration, theme, location, script, model IDs), plus matching flow and mermaid blocks. Do not reference file paths.'

export function getFlowTextGenerationSeedPrompt(formId?: unknown): string {
  const normalized = String(formId || '').trim()
  if (normalized === FLOW_VIDEO_SCRIPT_FORM_ID || normalized === FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID) {
    return FLOW_VIDEO_SCRIPT_SEED_PROMPT_DEFAULT
  }
  return FLOW_TEXT_GENERATION_SEED_PROMPT_DEFAULT
}

export function isFlowVideoScriptFormId(formId?: unknown): boolean {
  const normalized = String(formId || '').trim()
  return normalized === FLOW_VIDEO_SCRIPT_FORM_ID || normalized === FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID
}

export const STORYBOARD_WIDGET_IMAGE_MODEL_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetSmartNodeModel; label: string }> = [
  ...CHAT_BYTEPLUS_IMAGE_MODEL_OPTIONS.map((value, index) => ({
    value,
    label: index === 0 ? `${value} (Default)` : value,
  })),
]

export type StoryboardWidgetImageSize = '1K' | '2K' | '3K' | '4K'

export const STORYBOARD_WIDGET_IMAGE_SIZE_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetImageSize; label: string }> = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '3K', label: '3K' },
  { value: '4K', label: '4K' },
]

export type StoryboardWidgetImageOutputFormat = 'jpeg' | 'png'

export const STORYBOARD_WIDGET_IMAGE_OUTPUT_FORMAT_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetImageOutputFormat; label: string }> = [
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
]

export const STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetSmartNodeModel; label: string }> = [
  ...CHAT_BYTEPLUS_VIDEO_MODEL_OPTIONS.map((value, index) => ({
    value,
    label: index === 0 ? `${value} (Default)` : value,
  })),
]

export const STORYBOARD_WIDGET_SMART_NODE_MODEL_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetSmartNodeModel; label: string }> = [
  ...STORYBOARD_WIDGET_IMAGE_MODEL_OPTIONS,
  ...STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS,
]

export function getStoryboardWidgetSmartNodeModelOptions(mode?: 'image' | 'video' | null): ReadonlyArray<{ value: StoryboardWidgetSmartNodeModel; label: string }> {
  if (mode === 'image') return STORYBOARD_WIDGET_IMAGE_MODEL_OPTIONS
  if (mode === 'video') return STORYBOARD_WIDGET_VIDEO_MODEL_OPTIONS
  return STORYBOARD_WIDGET_SMART_NODE_MODEL_OPTIONS
}

export function getStoryboardWidgetSmartWidgetLabel(args: {
  mode?: 'image' | 'video' | null
  model?: unknown
}): string {
  const mode = args.mode === 'image' ? 'image' : args.mode === 'video' ? 'video' : null
  if (mode === 'image') {
    return FLOW_IMAGE_GENERATION_NODE_LABEL
  }
  if (mode === 'video') {
    return FLOW_VIDEO_GENERATION_NODE_LABEL
  }
  return FLOW_TEXT_GENERATION_NODE_LABEL
}

export type StoryboardWidgetAspectRatio = 'landscape' | 'portrait' | 'square'

export const STORYBOARD_WIDGET_ASPECT_RATIO_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetAspectRatio; label: string }> = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'square', label: 'Square' },
]

export type StoryboardWidgetResolution = '720p' | '1080p'

export const STORYBOARD_WIDGET_RESOLUTION_OPTIONS: ReadonlyArray<{ value: StoryboardWidgetResolution; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

export const STORYBOARD_WIDGET_DURATION_SECONDS_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 2, label: '2s' },
  { value: 4, label: '4s' },
  { value: 6, label: '6s' },
  { value: 8, label: '8s' },
]

export type StoryboardWidgetSmartNodeProperties = {
  model?: StoryboardWidgetSmartNodeModel
  prompt?: string
  content_json?: string
  size?: StoryboardWidgetImageSize
  output_format?: StoryboardWidgetImageOutputFormat
  seed?: number
  guidance_scale?: number
  aspect_ratio?: StoryboardWidgetAspectRatio
  duration?: number
  resolution?: StoryboardWidgetResolution
  generate_audio?: boolean
  fast?: boolean
  watermark?: boolean
  reference_image?: string
}

export const STORYBOARD_WIDGET_LOOP_NODE_TYPE = 'Loop'
export const STORYBOARD_WIDGET_NODE_KIND_PROPERTY_KEY = 'workflow:kind' as const
export const STORYBOARD_WIDGET_NODE_KIND_LOOP_VALUE = 'loop' as const

export const STORYBOARD_WIDGET_SMART_NODE_REQUIRED_FIELDS: ReadonlyArray<keyof StoryboardWidgetSmartNodeProperties> = [
  'model',
  'prompt',
  'aspect_ratio',
  'duration',
  'resolution',
]
