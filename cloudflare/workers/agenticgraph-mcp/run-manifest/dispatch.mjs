// McpAgent tool-call dispatch + Director persistence (R14.6 / Property 1,
// task 1.6) plus the combined run+persist helper (`executeAndPersistDirector`).
// Extracted verbatim from `run-manifest-store.mjs` (reuse-not-rebuild). This is
// the single code path the Worker entry (`index.ts`) and the Node unit tests
// share for `tools/call`, guaranteeing the gate-enforcement invariant cannot
// drift between the two surfaces.

import { runVideoRemixAsync } from "../../../../mcp/video-remix-runtime.js";
import {
  executeKnowgrphMcpToolAsync,
  KNOWGRPH_MCP_DIRECTOR_TOOL_NAME,
} from "../tool-registry.mjs";
import {
  RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
  RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  extractRunId,
} from "./shared.mjs";
import {
  defaultPersistenceDiagnosticEmitter,
  buildPersistenceFailureResponse,
} from "./persistence-failure.mjs";
import {
  defaultStageTransitionDiagnosticEmitter,
  emitStageTransitionDiagnostics,
} from "./stage-transition.mjs";
import {
  persistRunManifestThroughNamespace,
  readRunManifestThroughNamespace,
} from "./persistence.mjs";
import {
  RUN_NOTE_TOOL_NAME,
  executeRunNoteThroughNamespace,
} from "../run-note-execution.mjs";

/**
 * Run the Director and persist the resulting Run_Manifest in one step,
 * returning both the runtime payload and the persistence record. Used by
 * the McpAgent tool handler so a state change is captured immediately
 * after the Director returns.
 *
 * Persistence is awaited inline; Cloudflare Durable Object writes inside
 * the same edge location complete in the order of milliseconds, well
 * within the 2-second deadline imposed by R14.2.
 *
 * On a persistence failure (R14.3) the most-recently-persisted state is
 * retained (atomic batch write), a structured `persistenceFailure` response
 * is returned, and an observability diagnostic is emitted through the
 * injected `emitDiagnostic` sink (defaults to the console-backed emitter).
 */
export async function executeAndPersistDirector({
  namespace,
  args,
  runtimeDeps = {},
  emitDiagnostic = defaultPersistenceDiagnosticEmitter,
}) {
  const runtimeResult = await runVideoRemixAsync(args ?? {}, runtimeDeps);
  const payload = runtimeResult.payload;
  let persistenceRecord = null;
  let persistenceError = null;
  let persistenceFailure = null;
  try {
    persistenceRecord = await persistRunManifestThroughNamespace(namespace, payload);
  } catch (err) {
    persistenceError = err;
    // Prefer the structured failure surfaced by the DO; otherwise synthesize
    // one, reading back the retained state so the response/diagnostic report
    // the most-recently-persisted state that survived the failed write.
    if (err && err.persistenceFailure) {
      persistenceFailure = err.persistenceFailure;
    } else {
      let retained = null;
      try {
        retained = await readRunManifestThroughNamespace(
          namespace,
          extractRunId(payload),
        );
      } catch {
        retained = null;
      }
      persistenceFailure = buildPersistenceFailureResponse({
        runId: extractRunId(payload),
        error: err,
        retained,
      });
    }
    if (persistenceFailure && persistenceFailure.diagnostic) {
      emitDiagnostic(persistenceFailure.diagnostic);
    }
  }
  return {
    payload,
    text: runtimeResult.text,
    persistenceRecord,
    persistenceError,
    persistenceFailure,
  };
}

// ---------------------------------------------------------------------------
// McpAgent tool-call dispatch + gated persistence (R14.6 / Property 1,
// task 1.6).
//
// This is the single code path the Worker entry (`index.ts`) and the Node
// unit tests share for `tools/call`. Centralizing it here guarantees the
// gate-enforcement invariant cannot drift between the two surfaces:
//
//   * Director runs (`knowgrph.video_remix.run`) emit stage-transition
//     diagnostics and persist the resulting Run_Manifest to the
//     `RUN_MANIFEST_STORE` namespace (R14.2 / R14.5).
//   * EVERY stage-tool invocation — including a WITHHELD (approval_required)
//     one — returns the `executeKnowgrphMcpTool` envelope WITHOUT touching the
//     `RUN_MANIFEST_STORE` namespace. A withheld stage call therefore performs
//     no Director/provider execution, leaves the persisted Run_Manifest state
//     unchanged, and surfaces "approval required" (R14.6 / Property 1).
//
// The namespace is only ever reached inside the Director branch below, so a
// stage tool can never write durable state. Tests assert this with a spy
// namespace whose `idFromName`/`get` must never be called on a withheld call.
// ---------------------------------------------------------------------------

/** Default `GET /runs/{id}` read-back path prefix (mirrors index.ts MCP_PATH). */
export const RUN_MANIFEST_READBACK_PATH_PREFIX = "/knowgrph/control-plane/mcp/runs/";

/**
 * Persist a Director Run_Manifest to the `RUN_MANIFEST_STORE` namespace keyed
 * by `runId`. On a persistence failure (R14.3) the most-recently-persisted
 * state is retained (atomic batch write), a structured persistence-failure
 * response is synthesized (reading back the retained state), and an
 * observability diagnostic is emitted through `emitDiagnostic`.
 */
async function persistDirectorManifestThroughNamespace(
  namespace,
  structured,
  emitDiagnostic = defaultPersistenceDiagnosticEmitter,
) {
  if (!namespace) {
    return {
      persisted: false,
      persistedAt: null,
      error: "RUN_MANIFEST_STORE binding is not configured.",
      failure: null,
    };
  }
  try {
    const record = await persistRunManifestThroughNamespace(namespace, structured);
    const persistedAt =
      record && typeof record.persistedAt === "string" ? record.persistedAt : null;
    return { persisted: true, persistedAt, error: null, failure: null };
  } catch (err) {
    let failure = (err && err.persistenceFailure) || null;
    if (!failure) {
      let retained = null;
      try {
        retained = await readRunManifestThroughNamespace(
          namespace,
          extractRunId(structured) ?? "",
        );
      } catch {
        retained = null;
      }
      failure = buildPersistenceFailureResponse({
        runId: extractRunId(structured),
        error: err,
        retained,
      });
    }
    if (failure && failure.diagnostic) {
      emitDiagnostic(failure.diagnostic);
    }
    return {
      persisted: false,
      persistedAt: null,
      error: err instanceof Error ? err.message : String(err),
      failure,
    };
  }
}

/**
 * Execute a registered McpAgent tool and, for Director runs only, emit
 * stage-transition diagnostics and persist the Run_Manifest. Returns the
 * `executeKnowgrphMcpTool` result shape `{ ok, structuredContent, text }`
 * with `stageTransitions` / `persistence` attached on Director runs.
 *
 * Gate-enforcement invariant (R14.6 / Property 1): a stage tool whose gate is
 * not approved is withheld by `executeKnowgrphMcpTool` (it returns an
 * `approval_required` envelope with `paidProviderCalls: 0` and
 * `runManifestStateChanged: false`) and this dispatcher NEVER reaches the
 * `RUN_MANIFEST_STORE` namespace for any stage tool, so the persisted
 * Run_Manifest state is left unchanged.
 *
 * @param {{
 *   toolName: string,
 *   args?: object,
 *   namespace?: unknown,
 *   emitStageTransitionDiagnostic?: (d: object) => void,
 *   emitPersistenceDiagnostic?: (d: object) => void,
 *   readBackPathPrefix?: string,
 *   resolveLiveArgs?: (toolName: string, args: object) => Promise<object>|object,
 *   runtimeDeps?: object,
 *   execution?: object,
 *   idempotencyHeader?: string,
 * }} options
 */
export async function dispatchKnowgrphMcpToolCall({
  toolName,
  args = {},
  namespace,
  emitStageTransitionDiagnostic = defaultStageTransitionDiagnosticEmitter,
  emitPersistenceDiagnostic = defaultPersistenceDiagnosticEmitter,
  readBackPathPrefix = RUN_MANIFEST_READBACK_PATH_PREFIX,
  resolveLiveArgs,
  runtimeDeps = {},
  execution,
  idempotencyHeader,
} = {}) {
  if (toolName === RUN_NOTE_TOOL_NAME) {
    const structuredContent = await executeRunNoteThroughNamespace(namespace, {
      args,
      execution,
      idempotencyHeader,
    });
    return {
      ok: structuredContent?.ok === true,
      structuredContent,
      text: structuredContent?.ok === true
        ? JSON.stringify(structuredContent, null, 2)
        : String(structuredContent?.error?.message ?? "Run note execution failed."),
    };
  }

  // Env-gated live/mock pre-resolution (task 12.5). Default is the identity
  // function, so behavior is UNCHANGED unless the Worker injects a resolver
  // built from `resolveStageClients(env)`. When live, the Director's `args`
  // gain `sourceCards` fetched from the live Exa client before execution; on
  // any failure the resolver returns args unchanged (never throws).
  let effectiveArgs = args ?? {};
  if (typeof resolveLiveArgs === "function") {
    try {
      effectiveArgs = (await resolveLiveArgs(toolName, effectiveArgs)) ?? effectiveArgs;
    } catch {
      effectiveArgs = args ?? {};
    }
  }

  const result = await executeKnowgrphMcpToolAsync(toolName, effectiveArgs, runtimeDeps);
  const structured = result.structuredContent;

  const isDirectorRunWithId =
    toolName === KNOWGRPH_MCP_DIRECTOR_TOOL_NAME &&
    Boolean(structured) &&
    typeof structured === "object" &&
    typeof structured.runId === "string" &&
    structured.runId.length > 0;

  // Stage tools (withheld or approved) never reach the namespace below, so a
  // withheld stage invocation leaves the persisted Run_Manifest unchanged.
  if (isDirectorRunWithId) {
    // R14.5 / Property 27: emit one diagnostic per stage transition before
    // persistence so the observability record exists even if the durable
    // write later fails.
    const stageTransitions = emitStageTransitionDiagnostics({
      manifest: structured,
      emit: emitStageTransitionDiagnostic,
    });
    structured.stageTransitions = stageTransitions;

    const persistence = await persistDirectorManifestThroughNamespace(
      namespace,
      structured,
      emitPersistenceDiagnostic,
    );
    structured.persistence = {
      persisted: persistence.persisted,
      persistedAt: persistence.persistedAt,
      readBackEndpoint: `${readBackPathPrefix}${encodeURIComponent(
        String(structured.runId),
      )}`,
      deadlineMs: RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
      error: persistence.error,
      // R14.3: surface the structured persistence-failure response so callers
      // know the durable write did not land while the prior state is retained.
      status: persistence.persisted
        ? "persisted"
        : RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
      failure: persistence.failure,
    };
    // A persistence failure means the durable-state guarantee (R14.2) was not
    // met for this state change; flag the response as an error (R14.3).
    if (!persistence.persisted) {
      result.ok = false;
    }
  }

  const text =
    typeof result.text === "string" && result.text.length > 0
      ? result.text
      : JSON.stringify(structured ?? {}, null, 2);

  return { ok: result.ok, structuredContent: structured, text };
}
