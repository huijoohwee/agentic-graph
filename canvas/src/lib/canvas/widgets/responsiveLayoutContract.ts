// =============================================================================
// Responsive layout metadata contract — shared layout derivation (Task 11)
// agenticgraph-widget-canvas-media spec · Task 11
// Requirements: R1.1, R1.2, R1.3, R1.5, R1.6, R1.7, R1.9, R1.10
//
// Pure TypeScript — no React, no DOM. Derives widget placement for all 5
// responsive proof classes from one 1920x1080 logical frame using shared
// layout metadata. Validates overlap, proportional sizing, and edge routing.
// =============================================================================

import {
  RESPONSIVE_PROOF_CLASSES,
  MEDIA_LOGICAL_FRAME,
  validateResponsiveLayoutMetadata,
} from '../../../../../contracts/media-artifact.schema.js'
import type { RichMediaWidgetKind } from './richMediaPanelContract'

// Re-export canonical constants for consumers.
export { RESPONSIVE_PROOF_CLASSES, MEDIA_LOGICAL_FRAME }

// -----------------------------------------------------------------------------
// Responsive proof class types (R1.2)
// -----------------------------------------------------------------------------

export type ResponsiveProofClass = readonly [number, number]

/** The viewport width threshold below which mobile rules apply (R1.3). */
export const MOBILE_VIEWPORT_THRESHOLD = 768

// -----------------------------------------------------------------------------
// Widget placement (logical coordinates, derived from shared metadata)
// -----------------------------------------------------------------------------

export type WidgetPlacement = {
  readonly id: string
  readonly kind: RichMediaWidgetKind
  /** Logical x in the 1920x1080 frame. */
  readonly x: number
  /** Logical y in the 1920x1080 frame. */
  readonly y: number
  /** z-index for layering. */
  readonly z: number
  /** Width as percentage of logical frame width (0–100). */
  readonly wPct: number
  /** Height as percentage of logical frame height (0–100). */
  readonly hPct: number
}

// -----------------------------------------------------------------------------
// Edge placement (for routing validation, R1.6)
// -----------------------------------------------------------------------------

export type EdgePlacement = {
  readonly id: string
  readonly from: string
  readonly to: string
}

// -----------------------------------------------------------------------------
// Layout metadata (single source of truth for responsive derivation, R1.9)
// -----------------------------------------------------------------------------

export type CanvasLayoutMetadata = {
  readonly frame: { readonly w: number; readonly h: number }
  readonly widgets: readonly WidgetPlacement[]
  readonly edges: readonly EdgePlacement[]
}

// -----------------------------------------------------------------------------
// Layout derivation — scale from logical frame to a given proof class (R1.2)
// -----------------------------------------------------------------------------

/**
 * Derive the widget placements for a given responsive proof class by scaling
 * the logical 1920x1080 coordinates proportionally. This is the SINGLE shared
 * derivation — no per-viewport hardcoded coordinates (R1.2).
 *
 * Returns `null` with a reason when metadata is missing or invalid (R1.10).
 */
export function deriveLayoutForProofClass(
  metadata: CanvasLayoutMetadata | null | undefined,
  proofClass: ResponsiveProofClass,
): { placements: WidgetPlacement[]; error: null } | { placements: null; error: string } {
  if (!metadata) {
    return { placements: null, error: 'layout metadata is missing (R1.10)' }
  }

  const validation = validateResponsiveLayoutMetadata(metadata)
  if (!validation.valid) {
    const reasons = validation.errors.map((e) => `${e.path}: ${e.reason}`).join('; ')
    return { placements: null, error: `layout metadata failed validation: ${reasons} (R1.10)` }
  }

  const [vpW, vpH] = proofClass
  const scaleX = vpW / MEDIA_LOGICAL_FRAME.w
  const scaleY = vpH / MEDIA_LOGICAL_FRAME.h

  const placements: WidgetPlacement[] = metadata.widgets.map((w) => ({
    ...w,
    x: Math.round(w.x * scaleX),
    y: Math.round(w.y * scaleY),
    // wPct and hPct are frame-relative — they stay proportional; pixel sizes
    // are derived on demand by the renderer.
  }))

  return { placements, error: null }
}

// -----------------------------------------------------------------------------
// Overlap detection (R1.5 — zero overlapping pixel area at same z-index)
// -----------------------------------------------------------------------------

type Rect = { x: number; y: number; wPct: number; hPct: number; z: number }

function toPixelRect(r: Rect, frameW: number, frameH: number) {
  return {
    left:   r.x,
    top:    r.y,
    right:  r.x + r.wPct / 100 * frameW,
    bottom: r.y + r.hPct / 100 * frameH,
    z: r.z,
  }
}

/**
 * Return all overlapping pairs at the same z-index (R1.5 — must be zero).
 * Each returned pair is `[idA, idB]`.
 */
export function findOverlappingWidgets(
  placements: readonly WidgetPlacement[],
  frameW = MEDIA_LOGICAL_FRAME.w,
  frameH = MEDIA_LOGICAL_FRAME.h,
): Array<[string, string]> {
  const overlaps: Array<[string, string]> = []
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = toPixelRect(placements[i], frameW, frameH)
      const b = toPixelRect(placements[j], frameW, frameH)
      if (a.z !== b.z) continue // different layers — no conflict
      const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (overlapW > 0 && overlapH > 0) {
        overlaps.push([placements[i].id, placements[j].id])
      }
    }
  }
  return overlaps
}

// -----------------------------------------------------------------------------
// Edge center-avoidance check (R1.6, R1.7)
// -----------------------------------------------------------------------------

/**
 * Given a widget placement, return the "center 50% exclusion zone" rectangle
 * that edges must not pass through (R1.6).
 */
export function widgetCenterExclusionZone(
  w: WidgetPlacement,
  frameW = MEDIA_LOGICAL_FRAME.w,
  frameH = MEDIA_LOGICAL_FRAME.h,
) {
  const pixW = w.wPct / 100 * frameW
  const pixH = w.hPct / 100 * frameH
  const marginX = pixW * 0.25 // 25% each side → center 50%
  const marginY = pixH * 0.25
  return {
    left:   w.x + marginX,
    top:    w.y + marginY,
    right:  w.x + pixW - marginX,
    bottom: w.y + pixH - marginY,
  }
}

type Point = { x: number; y: number }

/** True when line segment from `a` to `b` passes through `rect`. */
export function segmentIntersectsRect(
  a: Point,
  b: Point,
  rect: { left: number; top: number; right: number; bottom: number },
): boolean {
  // Liang-Barsky parametric line-clipping.
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0 // parallel — outside if q < 0
    const r = q / p
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r }
    else        { if (r < t0) return false; if (r < t1) t1 = r }
    return true
  }
  if (!clip(-dx, a.x - rect.left))   return false
  if (!clip( dx, rect.right - a.x))  return false
  if (!clip(-dy, a.y - rect.top))    return false
  if (!clip( dy, rect.bottom - a.y)) return false
  return t0 <= t1
}

/**
 * Check whether a direct edge from `fromWidget` to `toWidget` passes through
 * the center exclusion zone of any other widget (R1.6). Returns the ids of
 * obstructed widgets when an unavoidable crossing exists.
 */
export function edgeCenterObstructions(
  fromW: WidgetPlacement,
  toW: WidgetPlacement,
  allWidgets: readonly WidgetPlacement[],
  frameW = MEDIA_LOGICAL_FRAME.w,
  frameH = MEDIA_LOGICAL_FRAME.h,
): string[] {
  // Use the centroid of each widget as the edge anchor point.
  const fromPt: Point = {
    x: fromW.x + fromW.wPct / 100 * frameW / 2,
    y: fromW.y + fromW.hPct / 100 * frameH / 2,
  }
  const toPt: Point = {
    x: toW.x + toW.wPct / 100 * frameW / 2,
    y: toW.y + toW.hPct / 100 * frameH / 2,
  }
  return allWidgets
    .filter((w) => w.id !== fromW.id && w.id !== toW.id)
    .filter((w) => segmentIntersectsRect(fromPt, toPt, widgetCenterExclusionZone(w, frameW, frameH)))
    .map((w) => w.id)
}

// -----------------------------------------------------------------------------
// Mobile single-surface check (R1.3)
// -----------------------------------------------------------------------------

/**
 * True when the given viewport width is below the mobile threshold (R1.3).
 * Below this threshold, exactly one primary task surface should be visible.
 */
export function isMobileViewport(viewportWidth: number): boolean {
  return viewportWidth < MOBILE_VIEWPORT_THRESHOLD
}

// -----------------------------------------------------------------------------
// Proportional sizing tolerance check (R1.5: ±2%)
// -----------------------------------------------------------------------------

/**
 * True when all widget rendered sizes are within ±2% of their
 * layout-metadata-defined proportional size (R1.5).
 */
export function allWidgetSizesWithinTolerance(
  placements: readonly WidgetPlacement[],
  renderedSizes: Record<string, { wPct: number; hPct: number }>,
  tolerancePct = 2,
): { ok: boolean; violations: Array<{ id: string; axis: 'w' | 'h'; expected: number; actual: number }> } {
  const violations = []
  for (const p of placements) {
    const rendered = renderedSizes[p.id]
    if (!rendered) continue
    if (Math.abs(rendered.wPct - p.wPct) > tolerancePct) {
      violations.push({ id: p.id, axis: 'w' as const, expected: p.wPct, actual: rendered.wPct })
    }
    if (Math.abs(rendered.hPct - p.hPct) > tolerancePct) {
      violations.push({ id: p.id, axis: 'h' as const, expected: p.hPct, actual: rendered.hPct })
    }
  }
  return { ok: violations.length === 0, violations }
}
