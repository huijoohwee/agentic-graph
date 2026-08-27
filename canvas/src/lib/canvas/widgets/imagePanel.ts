// =============================================================================
// ImagePanel widget — distinct Image_Panel type for the canvas renderer
// agenticgraph-widget-canvas-media spec · Task 10.1
// Requirements: R1.4, R2.8, R2.9
//
// Pure TypeScript — no React, no DOM. Provides the factory, type guard, and
// render metadata for the Image_Panel widget type. All canvas renderer wiring
// uses the centralized renderer id from richMediaPanelContract.ts.
// =============================================================================

import {
  createImagePanelWidget,
  isImagePanelWidget,
  RICH_MEDIA_RENDERER_ID_IMAGE,
  RICH_MEDIA_WIDGET_KIND_IMAGE,
  type ImagePanelWidget,
  type RichMediaWidgetBase,
} from './richMediaPanelContract'

// Re-export the canonical renderer id for the canvas widget config (R1.4).
export { RICH_MEDIA_RENDERER_ID_IMAGE, RICH_MEDIA_WIDGET_KIND_IMAGE, isImagePanelWidget }

export type { ImagePanelWidget }

// -----------------------------------------------------------------------------
// Image-panel–specific render metadata (R2.8 — distinct from Video_Panel)
// -----------------------------------------------------------------------------

/**
 * Render options specific to Image_Panel. These are pure presentation hints
 * consumed by the canvas renderer; they do NOT originate in the network.
 */
export type ImagePanelRenderOptions = {
  /** Preferred CSS object-fit mode. Default "contain". */
  readonly objectFit?: 'contain' | 'cover' | 'fill'
  /** Alt text for accessibility. */
  readonly altText?: string
  /**
   * If true, the panel shows a low-resolution placeholder (e.g. CSS blur-hash
   * or a 1×1 solid) until the durable R2 URL resolves.
   */
  readonly usePlaceholder?: boolean
}

// -----------------------------------------------------------------------------
// Factory: createImagePanel
//
// Builds an ImagePanelWidget from artifact fields plus optional image-specific
// render options. Uses the shared base factory from richMediaPanelContract so
// the kind and rendererId are always correct (centralized, no per-panel drift).
// -----------------------------------------------------------------------------

export type CreateImagePanelArgs = Omit<RichMediaWidgetBase, 'kind' | 'rendererId'> & {
  renderOptions?: ImagePanelRenderOptions
}

/**
 * Create an `ImagePanelWidget` from artifact fields.
 *
 * Returns an immutable, frozen descriptor suitable for serializing to the canvas
 * widget config. The `kind` and `rendererId` are set to the canonical image-panel
 * values — they cannot be overridden by the caller (R2.8, R1.4).
 */
export function createImagePanel(args: CreateImagePanelArgs): ImagePanelWidget & {
  readonly renderOptions: ImagePanelRenderOptions
} {
  const base = createImagePanelWidget({
    durableR2Url: args.durableR2Url,
    mediaType: args.mediaType ?? null,
    runId: args.runId,
    artifactId: args.artifactId,
    provenanceJson: args.provenanceJson,
    version: args.version,
  })

  const renderOptions: ImagePanelRenderOptions = Object.freeze({
    objectFit: args.renderOptions?.objectFit ?? 'contain',
    altText: args.renderOptions?.altText ?? '',
    usePlaceholder: args.renderOptions?.usePlaceholder ?? true,
  })

  return Object.freeze({ ...base, renderOptions })
}

// -----------------------------------------------------------------------------
// Registration descriptor for the canvas widget config
// -----------------------------------------------------------------------------

/**
 * The descriptor object the canvas widget registry consumes to register the
 * Image_Panel renderer (R1.4 — centralized renderer ids). Only the ids matter
 * for registration; the rest is documentation for the registry.
 */
export const IMAGE_PANEL_WIDGET_DESCRIPTOR = Object.freeze({
  kind:       RICH_MEDIA_WIDGET_KIND_IMAGE,
  rendererId: RICH_MEDIA_RENDERER_ID_IMAGE,
  displayName: 'Image Panel',
  description: 'Renders a durable R2 image artifact in a distinct Image_Panel (R2.8).',
})
