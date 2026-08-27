// =============================================================================
// Rich Media Panel widget type contracts — shared base and kind registry
// agenticgraph-widget-canvas-media spec · Task 10.1
// Requirements: R1.4, R2.8, R2.9
//
// Pure TypeScript contracts — no React, no DOM, no live network.
// Importable by both the canvas SPA and offline Node tests.
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical widget kind identifiers (R2.8 — distinct Image_Panel and Video_Panel)
// -----------------------------------------------------------------------------

export const RICH_MEDIA_WIDGET_KIND_IMAGE = 'media-image' as const
export const RICH_MEDIA_WIDGET_KIND_VIDEO = 'media-video' as const
export const RICH_MEDIA_WIDGET_KIND_TEXT  = 'media-text'  as const

export type RichMediaWidgetKind =
  | typeof RICH_MEDIA_WIDGET_KIND_IMAGE
  | typeof RICH_MEDIA_WIDGET_KIND_VIDEO
  | typeof RICH_MEDIA_WIDGET_KIND_TEXT

/** All canonical rich-media widget kinds, ordered (for deterministic iteration). */
export const RICH_MEDIA_WIDGET_KINDS: readonly RichMediaWidgetKind[] = [
  RICH_MEDIA_WIDGET_KIND_IMAGE,
  RICH_MEDIA_WIDGET_KIND_VIDEO,
  RICH_MEDIA_WIDGET_KIND_TEXT,
] as const

// -----------------------------------------------------------------------------
// Renderer IDs — each panel type gets its own centralized renderer id (R1.4)
// -----------------------------------------------------------------------------

export const RICH_MEDIA_RENDERER_ID_IMAGE = 'agenticgraph.rich-media.image' as const
export const RICH_MEDIA_RENDERER_ID_VIDEO = 'agenticgraph.rich-media.video' as const
export const RICH_MEDIA_RENDERER_ID_TEXT  = 'agenticgraph.rich-media.text'  as const

export type RichMediaRendererId =
  | typeof RICH_MEDIA_RENDERER_ID_IMAGE
  | typeof RICH_MEDIA_RENDERER_ID_VIDEO
  | typeof RICH_MEDIA_RENDERER_ID_TEXT

export const RICH_MEDIA_RENDERER_ID_BY_KIND: Readonly<Record<RichMediaWidgetKind, RichMediaRendererId>> = {
  [RICH_MEDIA_WIDGET_KIND_IMAGE]: RICH_MEDIA_RENDERER_ID_IMAGE,
  [RICH_MEDIA_WIDGET_KIND_VIDEO]: RICH_MEDIA_RENDERER_ID_VIDEO,
  [RICH_MEDIA_WIDGET_KIND_TEXT]:  RICH_MEDIA_RENDERER_ID_TEXT,
} as const

// -----------------------------------------------------------------------------
// Base widget descriptor (shared across Image_Panel and Video_Panel)
// -----------------------------------------------------------------------------

export type RichMediaWidgetBase = {
  /** Widget kind — drives routing to the correct panel renderer. */
  readonly kind: RichMediaWidgetKind
  /** Durable R2 replay URL (never an ephemeral provider URL, R3.4/R3.5). */
  readonly durableR2Url: string
  /** Content type for MIME-level embed decisions. */
  readonly mediaType: string | null
  /** Run id that produced this artifact — for entitlement checks (R4.5). */
  readonly runId: string
  /** stageId:shotId — composite artifact identifier within the run. */
  readonly artifactId: string
  /** Provenance chain reference (serialized JSON string, R6.3). */
  readonly provenanceJson: string
  /** Monotonic version for latest-result ownership (R5.7). */
  readonly version: number
  /** Renderer id — centralized, used by the canvas widget config. */
  readonly rendererId: RichMediaRendererId
}

// -----------------------------------------------------------------------------
// Typed widget descriptors — Image_Panel and Video_Panel are DISTINCT (R2.8)
// -----------------------------------------------------------------------------

export type ImagePanelWidget = RichMediaWidgetBase & {
  readonly kind: typeof RICH_MEDIA_WIDGET_KIND_IMAGE
  readonly rendererId: typeof RICH_MEDIA_RENDERER_ID_IMAGE
}

export type VideoPanelWidget = RichMediaWidgetBase & {
  readonly kind: typeof RICH_MEDIA_WIDGET_KIND_VIDEO
  readonly rendererId: typeof RICH_MEDIA_RENDERER_ID_VIDEO
}

export type TextWidget = RichMediaWidgetBase & {
  readonly kind: typeof RICH_MEDIA_WIDGET_KIND_TEXT
  readonly rendererId: typeof RICH_MEDIA_RENDERER_ID_TEXT
}

export type RichMediaWidget = ImagePanelWidget | VideoPanelWidget | TextWidget

// -----------------------------------------------------------------------------
// Widget factories — build typed widget descriptors from artifact records
// -----------------------------------------------------------------------------

function buildBase(
  kind: RichMediaWidgetKind,
  args: Omit<RichMediaWidgetBase, 'kind' | 'rendererId'>,
): Omit<RichMediaWidgetBase, 'kind' | 'rendererId'> {
  return {
    durableR2Url: args.durableR2Url,
    mediaType:    args.mediaType ?? null,
    runId:        args.runId,
    artifactId:   args.artifactId,
    provenanceJson: args.provenanceJson,
    version:      args.version,
  }
}

/** Create an ImagePanelWidget from artifact fields (R2.8). */
export function createImagePanelWidget(
  args: Omit<RichMediaWidgetBase, 'kind' | 'rendererId'>,
): ImagePanelWidget {
  return Object.freeze({
    ...buildBase(RICH_MEDIA_WIDGET_KIND_IMAGE, args),
    kind: RICH_MEDIA_WIDGET_KIND_IMAGE,
    rendererId: RICH_MEDIA_RENDERER_ID_IMAGE,
  })
}

/** Create a VideoPanelWidget from artifact fields (R2.8). */
export function createVideoPanelWidget(
  args: Omit<RichMediaWidgetBase, 'kind' | 'rendererId'>,
): VideoPanelWidget {
  return Object.freeze({
    ...buildBase(RICH_MEDIA_WIDGET_KIND_VIDEO, args),
    kind: RICH_MEDIA_WIDGET_KIND_VIDEO,
    rendererId: RICH_MEDIA_RENDERER_ID_VIDEO,
  })
}

/** Create a TextWidget from artifact fields. */
export function createTextWidget(
  args: Omit<RichMediaWidgetBase, 'kind' | 'rendererId'>,
): TextWidget {
  return Object.freeze({
    ...buildBase(RICH_MEDIA_WIDGET_KIND_TEXT, args),
    kind: RICH_MEDIA_WIDGET_KIND_TEXT,
    rendererId: RICH_MEDIA_RENDERER_ID_TEXT,
  })
}

// -----------------------------------------------------------------------------
// Kind routing helpers
// -----------------------------------------------------------------------------

export function isImagePanelWidget(w: RichMediaWidget): w is ImagePanelWidget {
  return w.kind === RICH_MEDIA_WIDGET_KIND_IMAGE
}

export function isVideoPanelWidget(w: RichMediaWidget): w is VideoPanelWidget {
  return w.kind === RICH_MEDIA_WIDGET_KIND_VIDEO
}

/** Route an artifact kind string to the widget factory (R2.8 — distinct by kind). */
export function createWidgetFromArtifactKind(
  artifactKind: string,
  args: Omit<RichMediaWidgetBase, 'kind' | 'rendererId'>,
): RichMediaWidget {
  if (artifactKind === 'image') return createImagePanelWidget(args)
  if (artifactKind === 'video') return createVideoPanelWidget(args)
  return createTextWidget(args)
}
