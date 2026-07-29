import crypto from "node:crypto";

import {
  evaluateAgenticSdlcLedger,
  loadAgenticSdlcEvaluator,
  validateAgenticSdlcLedgerReceipt,
} from "./agentic-sdlc-ledger-runtime.js";
import { deepFreeze } from "./agentic-sdlc-observability-json.js";
import { projectAgenticSdlcCanvas } from "./agentic-sdlc-observability-projection.js";
import { ImplementationRunStore, stableJson } from "./implementation-run-store.js";

export const AGENTIC_SDLC_OBSERVE_TOOL_NAME =
  "knowgrph.agentic_sdlc.observe";
export const AGENTIC_SDLC_OBSERVATION_SCHEMA =
  "knowgrph-agentic-sdlc-observation/v1";

const REQUIRED_BINDINGS = Object.freeze([
  "@implementation-run",
  "@canvas",
  "@runtime-proof",
]);
const VIEWS = new Set([
  "overview",
  "plan",
  "execution",
  "evidence",
  "economics",
  "recovery",
  "receipts",
  "full",
]);
const REQUEST_KEYS = new Set([
  "invocation",
  "runId",
  "expectedRevision",
  "expectedLedgerDigest",
  "view",
  "cursor",
  "limit",
]);
const INVOCATION_KEYS = new Set(["action", "semantic", "bindings"]);
const RUN_ID = /^ir_[0-9a-f]{24}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MAX_CACHE_ENTRIES = 16;
const ZERO_ECONOMICS = Object.freeze({
  modelCalls: 0,
  networkCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  estimatedCostUsd: 0,
  providerSpendUsd: 0,
});

const errorResult = (code, message) => Object.freeze({
  schema: AGENTIC_SDLC_OBSERVATION_SCHEMA,
  ok: false,
  economics: ZERO_ECONOMICS,
  error: Object.freeze({
    code,
    message: String(message || "The local Agentic SDLC observation failed.")
      .slice(0, 2_000),
    retryable: new Set([
      "run_not_found",
      "revision_conflict",
      "canonical_ledger_unavailable",
      "stale_cursor",
    ]).has(code),
  }),
});

const exactKeys = (value, allowed) => (
  value
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.keys(value).every((key) => allowed.has(key))
);

function normalizeRequest(input) {
  if (!exactKeys(input, REQUEST_KEYS) || !exactKeys(input?.invocation, INVOCATION_KEYS)) {
    throw Object.assign(
      new Error("Observation request contains unsupported or malformed fields."),
      { code: "invalid_request" },
    );
  }
  if (
    input.invocation.action !== "/sdlc.observe"
    || input.invocation.semantic !== "#agentic-sdlc-observability"
  ) {
    throw Object.assign(
      new Error("Observation invocation must use the canonical / and # tokens."),
      { code: "invalid_request" },
    );
  }
  const bindings = input.invocation.bindings;
  if (
    !Array.isArray(bindings)
    || bindings.length !== REQUIRED_BINDINGS.length
    || bindings.some((binding, index) => binding !== REQUIRED_BINDINGS[index])
  ) {
    throw Object.assign(
      new Error("Observation invocation must include the canonical @ bindings exactly once."),
      { code: "invalid_request" },
    );
  }
  if (!RUN_ID.test(String(input.runId || ""))) {
    throw Object.assign(new Error("Observation runId is invalid."), { code: "invalid_request" });
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw Object.assign(
      new Error("Observation expectedRevision must be a positive integer."),
      { code: "invalid_request" },
    );
  }
  if (!DIGEST.test(String(input.expectedLedgerDigest || ""))) {
    throw Object.assign(
      new Error("Observation expectedLedgerDigest must be a lowercase sha256 identity."),
      { code: "invalid_request" },
    );
  }
  const view = input.view;
  if (typeof view !== "string" || !VIEWS.has(view)) {
    throw Object.assign(new Error(`Unsupported observation view: ${view}`), {
      code: "unsupported_view",
    });
  }
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw Object.assign(new Error("Observation limit must be an integer from 1 to 200."), {
      code: "invalid_request",
    });
  }
  if (
    input.cursor !== undefined
    && (
      typeof input.cursor !== "string"
      || input.cursor.length < 1
      || input.cursor.length > 4096
      || !/^[A-Za-z0-9_-]+$/.test(input.cursor)
    )
  ) {
    throw Object.assign(new Error("Observation cursor is invalid."), {
      code: "invalid_request",
    });
  }
  return Object.freeze({
    invocation: Object.freeze({
      action: input.invocation.action,
      semantic: input.invocation.semantic,
      bindings: Object.freeze([...bindings]),
    }),
    runId: input.runId,
    expectedRevision: input.expectedRevision,
    expectedLedgerDigest: input.expectedLedgerDigest,
    view,
    cursor: input.cursor ?? null,
    limit,
  });
}

function publicError(error) {
  const code = String(error?.code || "");
  const mapped = {
    ENOENT: "run_not_found",
    REVISION_CONFLICT: "revision_conflict",
    CANONICAL_LEDGER_UNAVAILABLE: "canonical_ledger_unavailable",
    LEDGER_RECEIPT_INVALID: "canonical_ledger_unavailable",
    ARTIFACT_NAME_INVALID: "ledger_schema_invalid",
    ARTIFACT_UNSAFE: "ledger_schema_invalid",
    ARTIFACT_BYTES_MISMATCH: "ledger_digest_mismatch",
    ARTIFACT_DIGEST_MISMATCH: "ledger_digest_mismatch",
    ARTIFACT_UTF8_INVALID: "ledger_schema_invalid",
    ARTIFACT_TOO_LARGE: "projection_too_large",
    LEDGER_SCHEMA_INVALID: "ledger_schema_invalid",
    LEDGER_CONFORMANCE_FAILED: "ledger_conformance_failed",
    ACOS_REVISION_MISMATCH: "acos_revision_mismatch",
    STALE_CURSOR: "stale_cursor",
    PROJECTION_TOO_LARGE: "projection_too_large",
    invalid_projection_input: "invalid_request",
    invalid_view: "unsupported_view",
    invalid_cursor: "invalid_request",
    stale_cursor: "stale_cursor",
    projection_too_large: "projection_too_large",
  }[code] || ([
    "invalid_request",
    "unsupported_view",
    "run_not_found",
    "revision_conflict",
    "canonical_ledger_unavailable",
    "ledger_digest_mismatch",
    "ledger_schema_invalid",
    "ledger_conformance_failed",
    "stale_cursor",
    "projection_too_large",
    "acos_revision_mismatch",
  ].includes(code) ? code : "internal_error");
  const safeMessages = {
    run_not_found: "The implementation run was not found.",
    revision_conflict: "The implementation run changed; read its current revision and retry.",
    canonical_ledger_unavailable: "The implementation run has no immutable canonical Agentic SDLC ledger receipt.",
    ledger_digest_mismatch: "The canonical Agentic SDLC ledger does not match its digest-bound receipt.",
    ledger_schema_invalid: "The canonical Agentic SDLC ledger is invalid for the pinned evaluator.",
    ledger_conformance_failed: "The pinned Agentic SDLC evaluator could not produce a conformance result.",
    stale_cursor: "The observation cursor does not belong to the current projection.",
    unsupported_view: "The requested observation view is unsupported.",
    projection_too_large: "The bounded Agentic SDLC projection is too large.",
    acos_revision_mismatch: "The Agentic Canvas OS evaluator does not match the ledger receipt.",
    invalid_request: "The observation request is invalid.",
    internal_error: "The local Agentic SDLC observation failed.",
  };
  return errorResult(mapped, safeMessages[mapped]);
}

function conformanceSummary(conformance) {
  const findings = Array.isArray(conformance.findings)
    ? conformance.findings
    : [];
  const controlFailures = Array.isArray(conformance.controlFailures)
    ? conformance.controlFailures
    : [];
  const findingCounts = conformance.findingCounts ?? {};
  if (
    findings.length > 200
    || controlFailures.length > 200
    || Object.keys(findingCounts).length > 200
  ) {
    throw Object.assign(
      new Error("Agentic SDLC conformance summary exceeds its public bound."),
      { code: "PROJECTION_TOO_LARGE" },
    );
  }
  const integer = (value) => (
    Number.isSafeInteger(value) && value >= 0 ? value : 0
  );
  const ratio = Number(conformance.metrics?.bridgeCoverageRatio);
  return Object.freeze({
    schema: "knowgrph-agentic-sdlc-conformance-summary/v1",
    runId: String(conformance.runId),
    valid: true,
    runtimeReady: Boolean(conformance.runtimeReady),
    admissionReady: Boolean(conformance.admissionReady),
    localReadiness: conformance.readiness?.localRung ?? "undocumented",
    deliveredReadiness:
      conformance.readiness?.deliveredRung ?? "undocumented",
    controlFailures: Object.freeze(controlFailures.map(String)),
    findingCounts: Object.freeze(Object.fromEntries(
      Object.entries(findingCounts).map(([key, value]) => [
        key,
        integer(value),
      ]),
    )),
    severityCounts: Object.freeze({
      blocker: integer(conformance.severityCounts?.blocker),
      major: integer(conformance.severityCounts?.major),
      minor: integer(conformance.severityCounts?.minor),
    }),
    findings: Object.freeze(findings.map((finding) => Object.freeze({
      findingType: String(finding.findingType),
      severity: String(finding.severity),
      guidelineAnchor: String(finding.guidelineAnchor),
      artifactReference: String(finding.artifactReference),
      evidenceExcerpt: String(finding.evidenceExcerpt),
    }))),
    metrics: Object.freeze({
      taskCount: integer(conformance.metrics?.taskCount),
      vccCount: integer(conformance.metrics?.vccCount),
      coveredVccCount: integer(conformance.metrics?.coveredVccCount),
      verifiedTaskCount: integer(conformance.metrics?.verifiedTaskCount),
      evidenceReferenceCount: integer(
        conformance.metrics?.evidenceReferenceCount,
      ),
      bridgeCoverageRatio:
        Number.isFinite(ratio) && ratio >= 0 && ratio <= 1 ? ratio : 0,
      boundaryClosed: Boolean(conformance.metrics?.boundaryClosed),
      persistenceComplete: Boolean(
        conformance.metrics?.persistenceComplete,
      ),
      humanGatesClosed: Boolean(conformance.metrics?.humanGatesClosed),
      economicsWithinEstimate: Boolean(
        conformance.metrics?.economicsWithinEstimate,
      ),
      totalTokenConsumption: integer(
        conformance.metrics?.totalTokenConsumption,
      ),
    }),
  });
}

function assertReceiptFence(state, receipt, events) {
  const event = events.find((item) =>
    item?.type === "agentic_sdlc.ledger_bound"
    && item.revision === receipt.ledgerRevision + 1);
  const data = event?.data;
  if (receipt.ledgerRevision >= state.revision
    || data?.artifact !== receipt.artifact
    || data?.digest !== receipt.digest
    || data?.bytes !== receipt.bytes
    || data?.canonicalRunId !== receipt.canonicalRunId
    || data?.ledgerRevision !== receipt.ledgerRevision
    || data?.acosRevision !== receipt.acosRevision
    || typeof data?.runtimeReady !== "boolean") {
    throw Object.assign(
      new Error("Canonical Agentic SDLC ledger receipt is not joined to its durable binding revision."),
      { code: "LEDGER_RECEIPT_INVALID" },
    );
  }
}

export function createAgenticSdlcObservabilityRuntime({
  rootDir,
  store = new ImplementationRunStore({ rootDir }),
  evaluatorLoader = loadAgenticSdlcEvaluator,
  projector = projectAgenticSdlcCanvas,
  cacheEntries = MAX_CACHE_ENTRIES,
} = {}) {
  const cache = new Map();
  const maximumCacheEntries = Math.max(
    1,
    Math.min(MAX_CACHE_ENTRIES, Number(cacheEntries) || MAX_CACHE_ENTRIES),
  );

  function cacheGet(key) {
    const value = cache.get(key);
    if (!value) return null;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(key, value) {
    cache.set(key, value);
    while (cache.size > maximumCacheEntries) cache.delete(cache.keys().next().value);
  }

  async function observe(input) {
    try {
      const request = normalizeRequest(input);
      const state = await store.read(request.runId);
      if (state.revision !== request.expectedRevision) {
        throw Object.assign(
          new Error(`Run revision is ${state.revision}, not expected ${request.expectedRevision}.`),
          { code: "REVISION_CONFLICT" },
        );
      }
      const receipt = validateAgenticSdlcLedgerReceipt(
        state.result?.agenticSdlcLedger,
      );
      assertReceiptFence(state, receipt, await store.events(state.runId));
      if (receipt.digest !== request.expectedLedgerDigest) {
        throw Object.assign(
          new Error("Requested ledger digest does not match the implementation-run receipt."),
          { code: "ARTIFACT_DIGEST_MISMATCH" },
        );
      }
      if (
        receipt.acosRevision !== state.plan?.acosRevision
        || receipt.acosRevision !== state.plan?.supportedAcosRevision
      ) {
        throw Object.assign(
          new Error("Ledger receipt evaluator revision differs from the implementation-run plan."),
          { code: "ACOS_REVISION_MISMATCH" },
        );
      }
      const artifact = await store.readArtifact(state.runId, receipt.artifact, {
        expectedDigest: receipt.digest,
        expectedBytes: receipt.bytes,
        requireUtf8: true,
      });
      let ledger;
      try {
        ledger = JSON.parse(artifact.content);
      } catch {
        throw Object.assign(
          new Error("Canonical Agentic SDLC ledger is not valid JSON."),
          { code: "LEDGER_SCHEMA_INVALID" },
        );
      }
      const evaluator = await evaluatorLoader({
        agenticCanvasOsRoot: state.spec.agenticCanvasOsRoot,
        expectedRevision: receipt.acosRevision,
        state,
      });
      const evaluated = evaluateAgenticSdlcLedger(ledger, evaluator);
      if (
        evaluated.normalizedRun.runId !== receipt.canonicalRunId
        || evaluated.normalizedRun.schema !== "agentic-sdlc-run/v1"
      ) {
        throw Object.assign(
          new Error("Canonical ledger identity differs from its immutable receipt."),
          { code: "LEDGER_SCHEMA_INVALID" },
        );
      }
      const finalState = await store.read(request.runId);
      if (finalState.revision !== request.expectedRevision
        || stableJson(finalState.result?.agenticSdlcLedger) !== stableJson(receipt)) {
        throw Object.assign(
          new Error("Implementation run changed while its canonical ledger was observed."),
          { code: "REVISION_CONFLICT" },
        );
      }

      const source = Object.freeze({
        implementationRunId: state.runId,
        implementationRunRevision: state.revision,
        implementationRunState: state.state,
        canonicalRunId: receipt.canonicalRunId,
        canonicalSchema: evaluated.normalizedRun.schema,
        ledgerArtifact: receipt.artifact,
        ledgerRevision: receipt.ledgerRevision,
        ledgerDigest: receipt.digest,
        acosRevision: receipt.acosRevision,
      });
      const cacheKey = `sha256:${crypto.createHash("sha256").update(stableJson({
        source,
        view: request.view,
        cursor: request.cursor,
        limit: request.limit,
        projection: "agentic-sdlc-canvas-projection/v1",
      })).digest("hex")}`;
      let projection = cacheGet(cacheKey);
      const cacheStatus = projection ? "hit" : "miss";
      if (!projection) {
        projection = await projector({
          normalizedRun: evaluated.normalizedRun,
          implementationRun: {
            id: state.runId,
            revision: state.revision,
            state: state.state,
          },
          source,
          conformance: evaluated.conformance,
          view: request.view,
          cursor: request.cursor,
          limit: request.limit,
        });
        projection = deepFreeze(projection);
        cacheSet(cacheKey, projection);
      }
      const publicConformance = conformanceSummary(evaluated.conformance);

      const result = {
        schema: AGENTIC_SDLC_OBSERVATION_SCHEMA,
        ok: true,
        source,
        status: {
          runtimeReady: evaluated.conformance.runtimeReady,
          localReadiness:
            evaluated.conformance.readiness?.localRung ?? "undocumented",
          verified: projection.graphData?.metadata?.status?.verified === true,
          verifiedTaskCount:
            evaluated.conformance.metrics?.verifiedTaskCount ?? 0,
          deliveryReady: state.state === "delivery_ready",
          deployed: projection.graphData?.metadata?.status?.deployed === true,
          deployBoundary: "closed",
        },
        conformance: publicConformance,
        projection,
        cache: {
          key: cacheKey,
          status: cacheStatus,
          policy: "content-addressed-lru",
        },
        economics: ZERO_ECONOMICS,
      };
      return deepFreeze(result);
    } catch (error) {
      return publicError(error);
    }
  }

  return Object.freeze({ observe, store });
}

export const isAgenticSdlcObserveToolName = (toolName) =>
  toolName === AGENTIC_SDLC_OBSERVE_TOOL_NAME;

export async function runAgenticSdlcObservabilityTool(
  toolName,
  args,
  { runtime, ...options } = {},
) {
  if (!isAgenticSdlcObserveToolName(toolName)) {
    return errorResult("invalid_request", `Unknown Agentic SDLC observation tool: ${toolName}`);
  }
  const observer = runtime || createAgenticSdlcObservabilityRuntime(options);
  return observer.observe(args);
}
