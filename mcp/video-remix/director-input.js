// Director input-validation gate for the video-remix runtime (spec task 2.5 /
// R2.1, R2.2 / Property 4). Extracted verbatim from
// `mcp/video-remix-runtime.js` (reuse-not-rebuild).

import {
  DIRECTOR_BRIEF_MAX_LENGTH,
  DIRECTOR_BUDGET_MIN_USD,
  DIRECTOR_BUDGET_MAX_USD,
  DIRECTOR_VALID_MODES,
} from "./constants.js";
import { cleanString } from "./helpers.js";

/**
 * Typed error thrown by the Director input-validation gate (spec task 2.5 /
 * R2.2 / Property 4). Carries the name of the invalid field so the McpAgent
 * boundary / Agent_Api can identify it to the caller. Thrown BEFORE any
 * Run_Manifest is built, so a rejected call performs zero paid-provider calls
 * and produces no Run_Manifest.
 *
 * Rejection mechanism choice: THROW (not a structured `{ ok:false }` return).
 * This is the mechanism `runVideoRemix` already uses for a missing `brief` and
 * a non-absolute `referenceUrl`, and it is how the Section-1 McpAgent tool
 * dispatch (`executeAgenticGraphMcpTool`) treats Director errors: the throw
 * propagates out of the Director branch and the MCP SDK marks the tool result
 * `isError: true`. Extending the same mechanism keeps the worker tests green
 * and avoids two divergent error shapes.
 */
export class DirectorInputValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "DirectorInputValidationError";
    this.field = field;
    this.code = "invalid_director_input";
  }
}

/**
 * Director input-validation gate (spec task 2.5 / R2.1, R2.2 / Property 4).
 *
 * Runs BEFORE any Run_Manifest is constructed. Rejects, by throwing a
 * `DirectorInputValidationError` naming the invalid field, when the call:
 *   - omits a required field (`referenceUrl`, `brief`),
 *   - supplies a `budgetUsd` outside [0.01, 100000.00] (only validated when
 *     PROVIDED — `budgetUsd` is optional in some call paths and on the worker's
 *     Zod schema, so an omitted budget is accepted and defaults downstream),
 *   - supplies a `mode` other than "live" / "dry-run" (an omitted/empty mode
 *     defaults to "dry-run", matching the worker schema default).
 *
 * On success returns the normalized `{ referenceUrl, brief, mode, budgetUsd }`
 * so `runVideoRemix` reuses the validated values without re-parsing.
 *
 * Conversely (Property 4, second half): a fully valid input passes the gate
 * and `runVideoRemix` proceeds to build a Run_Manifest as before.
 */
export function validateDirectorInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};

  // Required field: referenceUrl — non-empty, absolute URL.
  const referenceUrlRaw = cleanString(input.referenceUrl);
  if (!referenceUrlRaw) {
    throw new DirectorInputValidationError(
      "referenceUrl",
      "Missing required field: referenceUrl.",
    );
  }
  let referenceUrl;
  try {
    referenceUrl = new URL(referenceUrlRaw).toString();
  } catch {
    throw new DirectorInputValidationError(
      "referenceUrl",
      "Invalid field: referenceUrl must be an absolute URL.",
    );
  }

  // Required field: brief — non-empty, 1..5000 chars (R2.1).
  const brief = cleanString(input.brief);
  if (!brief) {
    throw new DirectorInputValidationError("brief", "Missing required field: brief.");
  }
  if (brief.length > DIRECTOR_BRIEF_MAX_LENGTH) {
    throw new DirectorInputValidationError(
      "brief",
      `Invalid field: brief must be 1 to ${DIRECTOR_BRIEF_MAX_LENGTH} characters.`,
    );
  }

  // Optional field: mode — omitted/empty defaults to dry-run; if explicitly
  // provided it MUST be one of live | dry-run (R2.1, R2.2).
  let mode = "dry-run";
  const modeProvided =
    input.mode !== undefined && input.mode !== null && cleanString(input.mode) !== "";
  if (modeProvided) {
    const modeValue = cleanString(input.mode);
    if (!DIRECTOR_VALID_MODES.includes(modeValue)) {
      throw new DirectorInputValidationError(
        "mode",
        `Invalid field: mode must be one of ${DIRECTOR_VALID_MODES.join(" | ")}.`,
      );
    }
    mode = modeValue;
  }

  // Optional field: budgetUsd — reject only when PROVIDED and out of range
  // [0.01, 100000.00] (R2.1, R2.2). An omitted budget is accepted and
  // normalized downstream (matches the worker's `.optional()` Zod schema and
  // existing dry-run / live-blocked call paths that omit it).
  let budgetUsd;
  const budgetProvided =
    input.budgetUsd !== undefined && input.budgetUsd !== null && input.budgetUsd !== "";
  if (budgetProvided) {
    const budgetValue = Number(input.budgetUsd);
    if (
      !Number.isFinite(budgetValue) ||
      budgetValue < DIRECTOR_BUDGET_MIN_USD ||
      budgetValue > DIRECTOR_BUDGET_MAX_USD
    ) {
      throw new DirectorInputValidationError(
        "budgetUsd",
        `Invalid field: budgetUsd must be a number between ${DIRECTOR_BUDGET_MIN_USD} and ${DIRECTOR_BUDGET_MAX_USD} inclusive.`,
      );
    }
    budgetUsd = budgetValue;
  }

  return { referenceUrl, brief, mode, budgetUsd };
}
