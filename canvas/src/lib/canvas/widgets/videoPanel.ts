// =============================================================================
// VideoPanel widget — distinct Video_Panel type for the canvas renderer
// agenticgraph-widget-canvas-media spec · Task 10.1
// Requirements: R1.4, R2.8, R2.9
//
// Pure TypeScript — no React, no DOM. Provides the factory, type guard, and
// render metadata for the Video_Panel widget type. All canvas renderer wiring
// uses the centralized renderer id from richMediaPanelContract.ts.
// =============================================================================

import {
  createVideoPanelWidget,
  isVideoPanelWidget,
  RICH_MEDIA_RENDERER_ID_VIDEO,
  RICH_MEDIA_WIDGET_KIND_VIDEO,
  type VideoPanelWidget,
  type RichMediaWidgetBase,
} from './richMediaPanelContract'

// Re-export the canonical renderer id for the canvas widget config (R1.4).
export { RICH_MEDIA_RENDERER_ID_VIDEO, RICH_MEDIA_WIDGET_KIND_VIDEO, isVideoPanelWidget }

export type { VideoPanelWidget }

// -----------------------------------------------------------------------------
// Video-panel–specific render metadata (R2.8 — distinct from Image_Panel)
// -----------------------------------------------------------------------------

/**
 * Render options specific to Video_Panel. These are pure presentation hints
 * consumed by the canvas renderer; they do NOT originate in the network.
 */
export type VideoPanelRenderOptions = {
  /** Whether the video should autoplay on panel open (default false, R4.3). */
  readonly autoPlay?: boolean
  /** Whether the video loops. Default false. */
  readonly loop?: boolean
  /** Whether controls are shown. Default true. */
  readonly controls?: boolean
  /**
   * Poster image URL (static thumbnail shown before playback begins).
   * Must be a durable R2 URL if specified (R3.5). Optional.
   */
  readonly posterDurableR2Url?: string | null
}

// -----------------------------------------------------------------------------
// Factory: createVideoPanel
//
// Builds a VideoPanelWidget from artifact fields plus optional video-specific
// render options. Uses the shared base factory from richMediaPanelContract so
// the kind and rendererId are always correct (centralized, no per-panel drift).
// -----------------------------------------------------------------------------

export type CreateVideoPanelArgs = Omit<RichMediaWidgetBase, 'kind' | 'rendererId'> & {
  renderOptions?: VideoPanelRenderOptions
}

/**
 * Create a `VideoPanelWidget` from artifact fields.
 *
 * Returns an immutable, frozen descriptor suitable for serializing to the canvas
 * widget config. The `kind` and `rendererId` are set to the canonical video-panel
 * values — they cannot be overridden by the caller (R2.8, R1.4).
 */
export function createVideoPanel(args: CreateVideoPanelArgs): VideoPanelWidget & {
  readonly renderOptions: VideoPanelRenderOptions
} {
  const base = createVideoPanelWidget({
    durableR2Url: args.durableR2Url,
    mediaType: args.mediaType ?? null,
    runId: args.runId,
    artifactId: args.artifactId,
    provenanceJson: args.provenanceJson,
    version: args.version,
  })

  const renderOptions: VideoPanelRenderOptions = Object.freeze({
    autoPlay:           args.renderOptions?.autoPlay           ?? false,
    loop:               args.renderOptions?.loop               ?? false,
    controls:           args.renderOptions?.controls           ?? true,
    posterDurableR2Url: args.renderOptions?.posterDurableR2Url ?? null,
  })

  return Object.freeze({ ...base, renderOptions })
}

// -----------------------------------------------------------------------------
// Registration descriptor for the canvas widget config
// -----------------------------------------------------------------------------

/**
 * The descriptor object the canvas widget registry consumes to register the
 * Video_Panel renderer (R1.4 — centralized renderer ids). Only the ids matter
 * for registration; the rest is documentation for the registry.
 */
export const VIDEO_PANEL_WIDGET_DESCRIPTOR = Object.freeze({
  kind:       RICH_MEDIA_WIDGET_KIND_VIDEO,
  rendererId: RICH_MEDIA_RENDERER_ID_VIDEO,
  displayName: 'Video Panel',
  description: 'Renders a durable R2 video artifact in a distinct Video_Panel (R2.8).',
})
