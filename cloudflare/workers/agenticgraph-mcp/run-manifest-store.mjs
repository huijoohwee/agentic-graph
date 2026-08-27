// Public entry for the durable Run_Manifest persistence layer of the knowgrph
// control-plane McpAgent (knowgrph-acos-mcp-connector spec).
//
// The implementation was split into cohesive, single-responsibility modules
// under `run-manifest/` (shared constants + base helpers, persistence-failure
// response/diagnostic builders, stage-transition diagnostics, the persistence
// layer + `RunManifestStore` Durable Object, and the McpAgent tool-call
// dispatch + Director persistence) so every source file stays under the
// 600-line limit. This module preserves the original public surface by
// re-exporting the same named symbols `index.ts` and the tests import, so NO
// importing file or wrangler config needs to change.
//
// `RunManifestStore` (the Durable Object class bound as `RUN_MANIFEST_STORE`)
// is re-exported here and from `index.ts` so the Worker entry keeps exporting
// the DO class unchanged.

export {
  RUN_MANIFEST_STORAGE_KEYS,
  RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
  RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  STAGE_TRANSITION_DIAGNOSTIC_TYPE,
  extractRunId,
} from "./run-manifest/shared.mjs";

export {
  defaultPersistenceDiagnosticEmitter,
  buildPersistenceFailureDiagnostic,
  buildPersistenceFailureResponse,
} from "./run-manifest/persistence-failure.mjs";

export {
  defaultStageTransitionDiagnosticEmitter,
  buildStageTransitionDiagnostic,
  deriveStageTransitionDiagnostics,
  emitStageTransitionDiagnostics,
} from "./run-manifest/stage-transition.mjs";

export {
  serializeManifestForStorage,
  buildPersistenceRecord,
  RunManifestPersistence,
  persistRunManifestThroughNamespace,
  readRunManifestThroughNamespace,
  RunManifestStore,
} from "./run-manifest/persistence.mjs";

export {
  RUN_NOTE_TOOL_NAME,
  RUN_NOTE_EXECUTION_META_KEY,
  RUN_NOTE_RECEIPT_SCHEMA,
  RUN_NOTE_TOOL_DEFINITION,
  RunNoteExecutionStore,
  executeRunNoteThroughNamespace,
} from "./run-note-execution.mjs";

export {
  executeAndPersistDirector,
  RUN_MANIFEST_READBACK_PATH_PREFIX,
  dispatchKnowgrphMcpToolCall,
} from "./run-manifest/dispatch.mjs";
