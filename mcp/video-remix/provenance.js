// =============================================================================
// Provenance recorder — mcp/video-remix/provenance.js
// agentic-graph-widget-canvas-media spec · Task 4 · Requirements R6.1, R6.6
// design.md › Components and Interfaces › 4. Provenance recorder
//
// Exports:
//   buildProvenanceChain({ goal|goalRef, brief|briefRef, plan|planRef,
//                          toolCalls?, verificationChecks? })
//     → ProvenanceChain
//   assertComplete(chain) → void | throws MissingProvenanceComponentError
//   MissingProvenanceComponentError   — named error class
//   serializeProvenanceChain(chain)   → string (JSON)
//   deserializeProvenanceChain(json)  → ProvenanceChain
//
// This module is pure and dependency-injected: it never performs I/O and never
// throws on bad input unless assertComplete is called. Platform target is
// Cloudflare only; no Vercel/AWS identifiers appear here.
// =============================================================================

import {
  validateProvenanceChain,
  buildProvenanceChain as buildProvenanceChainContract,
  PROVENANCE_REQUIRED_REFS,
} from "../../contracts/media-artifact.schema.js";

// ---------------------------------------------------------------------------
// MissingProvenanceComponentError (R6.6)
// ---------------------------------------------------------------------------

/**
 * Thrown by `assertComplete` when any required provenance component is absent
 * or empty. The `missingComponents` array lists the field names that failed
 * validation so the caller can report a descriptive error and decline to
 * persist the artifact (R6.6).
 */
export class MissingProvenanceComponentError extends Error {
  /**
   * @param {string[]} missingComponents - Field paths that failed validation.
   */
  constructor(missingComponents) {
    const list = Array.isArray(missingComponents) ? missingComponents : [];
    super(
      `Provenance_Chain is incomplete — missing or empty components: ${list.join(", ")}`,
    );
    this.name = "MissingProvenanceComponentError";
    /** @type {string[]} */
    this.missingComponents = list;
  }
}

// ---------------------------------------------------------------------------
// buildProvenanceChain (R6.1)
// ---------------------------------------------------------------------------

/**
 * Build a complete ProvenanceChain from its components.
 *
 * Accepts BOTH naming conventions for ease of use:
 *   - `{ goal, brief, plan, toolCalls?, verificationChecks? }`
 *   - `{ goalRef, briefRef, planRef, toolCalls?, verificationChecks? }`
 *
 * The two conventions are normalized to the canonical contract shape before
 * delegating to the contract factory. A `goal` value takes precedence over a
 * `goalRef` value of the same name when both are supplied.
 *
 * Missing list inputs (`toolCalls`, `verificationChecks`) default to empty
 * arrays. Call `assertComplete` after building if strict completeness is
 * required before recording the artifact.
 *
 * @param {{ goal?: string, brief?: string, plan?: string,
 *           goalRef?: string, briefRef?: string, planRef?: string,
 *           toolCalls?: Array, verificationChecks?: Array }} init
 * @returns {ProvenanceChain}
 */
export function buildProvenanceChain(init = {}) {
  const src = (init !== null && typeof init === "object" && !Array.isArray(init)) ? init : {};

  // Normalize: accept `goal`/`brief`/`plan` as aliases for the canonical
  // `goalRef`/`briefRef`/`planRef` field names.
  const normalized = {
    goalRef:  src.goal  ?? src.goalRef  ?? "",
    briefRef: src.brief ?? src.briefRef ?? "",
    planRef:  src.plan  ?? src.planRef  ?? "",
    toolCalls:          src.toolCalls,
    verificationChecks: src.verificationChecks,
  };

  // Delegate to the contract factory for field coercion + default list values.
  return buildProvenanceChainContract(normalized);
}

// ---------------------------------------------------------------------------
// assertComplete (R6.6)
// ---------------------------------------------------------------------------

/**
 * Assert that `chain` is a complete, valid ProvenanceChain. If any required
 * component is absent or empty, throws `MissingProvenanceComponentError` with
 * the failing field names listed in `missingComponents`.
 *
 * A step that calls this function and catches the error MUST:
 *   - Mark the step as failed
 *   - Report a descriptive error
 *   - NOT persist the artifact (R6.6)
 *
 * @param {ProvenanceChain} chain
 * @returns {void}
 * @throws {MissingProvenanceComponentError}
 */
export function assertComplete(chain) {
  const result = validateProvenanceChain(chain);
  if (!result.valid) {
    const missing = result.errors.map((e) => (e.path ? e.path : "(chain)"));
    throw new MissingProvenanceComponentError(missing);
  }
}

// ---------------------------------------------------------------------------
// serializeProvenanceChain / deserializeProvenanceChain (R6.5)
// ---------------------------------------------------------------------------

/**
 * Serialize a ProvenanceChain to a JSON string for storage alongside the
 * artifact record (R6.3, R6.5). The round-trip `deserialize(serialize(chain))`
 * is field-for-field identical to the original chain.
 *
 * @param {ProvenanceChain} chain
 * @returns {string}
 */
export function serializeProvenanceChain(chain) {
  if (chain === null || chain === undefined || typeof chain !== "object" || Array.isArray(chain)) {
    throw new TypeError("serializeProvenanceChain: chain must be a non-null object");
  }
  return JSON.stringify(chain);
}

/**
 * Deserialize a ProvenanceChain from a JSON string produced by
 * `serializeProvenanceChain`. The returned object is field-for-field identical
 * to the object that was serialized (R6.5).
 *
 * @param {string} json
 * @returns {ProvenanceChain}
 * @throws {SyntaxError} when `json` is not valid JSON.
 * @throws {TypeError} when `json` is not a string.
 */
export function deserializeProvenanceChain(json) {
  if (typeof json !== "string") {
    throw new TypeError("deserializeProvenanceChain: json must be a string");
  }
  return JSON.parse(json);
}
