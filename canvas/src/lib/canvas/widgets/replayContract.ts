// =============================================================================
// Replay-without-LLM contract — pure logic for R2 replay from durable storage
// agentic-graph-widget-canvas-media spec · Task 10.2
// Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6
//
// Pure TypeScript — no React, no DOM, no live network. All render wiring is
// handled by the canvas SPA; this module defines the pure replay contract and
// the entitlement check interface.
// =============================================================================

import type { RichMediaWidget } from './richMediaPanelContract'
import { isDurableR2Url } from '../../../../../contracts/media-artifact.schema.js'

// -----------------------------------------------------------------------------
// Entitlement contract (R4.5, R4.6)
// -----------------------------------------------------------------------------

export type ReplayEntitlementResult =
  | { entitled: true }
  | { entitled: false; reason: string }

/**
 * Check whether `requesterId` is entitled to replay artifacts from `runId`.
 * This is the injectable interface — the live implementation consults the
 * authenticated session; the offline mock always grants or denies.
 */
export type ReplayEntitlementChecker = (
  runId: string,
  requesterId: string,
) => ReplayEntitlementResult | Promise<ReplayEntitlementResult>

// -----------------------------------------------------------------------------
// Replay request / result types
// -----------------------------------------------------------------------------

export type ReplayRequest = {
  widget: RichMediaWidget
  /** Requester identity for entitlement check. */
  requesterId: string
  /** Replay method — the surface that loads the artifact (R4.1, R4.2). */
  method: 'embed' | 'iframe'
}

export type ReplayResult =
  | {
      ok: true
      /** Durable R2 URL to load into the embed/iframe surface. */
      durableR2Url: string
      /** MIME type hint for the embed. */
      mediaType: string | null
    }
  | {
      ok: false
      /** Deny: unauthorized (R4.6) */
      code: 'unauthorized'
      reason: string
    }
  | {
      ok: false
      /** Deny: invalid durable URL */
      code: 'invalid_url'
      reason: string
    }

// -----------------------------------------------------------------------------
// Core replay contract (R4.3 — zero model/gateway/provider calls)
// -----------------------------------------------------------------------------

/**
 * Validate a widget for replay and return the durable R2 URL to load.
 * Makes ZERO model, gateway, or provider calls (R4.3).
 *
 * - Returns `ok: false, code: 'invalid_url'` when the URL is not a valid
 *   durable R2 URL (protects against accidental ephemeral URL storage).
 * - Returns `ok: false, code: 'unauthorized'` when the requester is not
 *   entitled to the run (R4.6).
 * - Returns `ok: true` with the `durableR2Url` to pass to the embed surface.
 */
export async function resolveReplay(
  request: ReplayRequest,
  entitlementChecker: ReplayEntitlementChecker,
): Promise<ReplayResult> {
  const { widget, requesterId } = request

  // Validate the durable URL — must never be an ephemeral provider URL (R3.5).
  if (!isDurableR2Url(widget.durableR2Url)) {
    return {
      ok: false,
      code: 'invalid_url',
      reason: `replay rejected: '${widget.durableR2Url}' is not a valid durable R2 URL (R3.5)`,
    }
  }

  // Entitlement check (R4.5, R4.6).
  const entitlement = await entitlementChecker(widget.runId, requesterId)
  if (!entitlement.entitled) {
    const denialReason = 'reason' in entitlement ? entitlement.reason : 'replay rejected: access denied'
    return {
      ok: false,
      code: 'unauthorized',
      reason: denialReason,
    }
  }

  return {
    ok: true,
    durableR2Url: widget.durableR2Url,
    mediaType: widget.mediaType,
  }
}

// -----------------------------------------------------------------------------
// Offline entitlement checkers (for testing and default usage)
// -----------------------------------------------------------------------------

/** Always-grant entitlement checker — for offline tests. */
export const alwaysGrantEntitlement: ReplayEntitlementChecker = (_runId, _requesterId) =>
  ({ entitled: true })

/** Always-deny entitlement checker — for offline tests. */
export const alwaysDenyEntitlement: ReplayEntitlementChecker = (_runId, _requesterId) =>
  ({ entitled: false, reason: 'mock: access denied' })

/** Run-scoped entitlement checker: entitled when requesterId is in the allowed set. */
export function createRunScopedEntitlementChecker(
  allowedByRun: Record<string, string[]>,
): ReplayEntitlementChecker {
  return (runId, requesterId) => {
    const allowed = allowedByRun[runId] ?? []
    return allowed.includes(requesterId)
      ? { entitled: true }
      : { entitled: false, reason: `requester '${requesterId}' is not entitled to run '${runId}'` }
  }
}
