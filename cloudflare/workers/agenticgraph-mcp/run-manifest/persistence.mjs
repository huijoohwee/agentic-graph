// Durable Run_Manifest persistence layer (R14.2 / Property 25). Extracted
// verbatim from `run-manifest-store.mjs` (reuse-not-rebuild): the pure
// `RunManifestPersistence` helper, the record/serialization builders, the
// namespace put/get brokers, and the `RunManifestStore` Durable Object class
// bound as `RUN_MANIFEST_STORE` and re-exported from `index.ts`.

import {
  RUN_MANIFEST_STORAGE_KEYS,
  RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  extractRunId,
} from "./shared.mjs";
import {
  defaultPersistenceDiagnosticEmitter,
  buildPersistenceFailureResponse,
} from "./persistence-failure.mjs";
import {
  RunNoteExecutionStore,
  handleRunNoteExecutionRequest,
} from "../run-note-execution.mjs";

/**
 * Strip transient/circular fields and produce a JSON-serializable copy of
 * the Run_Manifest suitable for Durable Object storage. The runtime in
 * `mcp/video-remix-runtime.js` already returns a plain JSON tree, so a
 * round-trip through `JSON.parse(JSON.stringify(...))` is sufficient.
 */
export function serializeManifestForStorage(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

/**
 * Build the full persistence record written by `RunManifestPersistence.put`.
 * Throws if the manifest does not carry a usable runId so the McpAgent
 * boundary surfaces a typed error rather than silently dropping state.
 */
export function buildPersistenceRecord(manifest, persistedAtMs) {
  const runId = extractRunId(manifest);
  if (!runId) {
    throw new Error(
      "Run_Manifest persistence requires a non-empty `runId`. Refusing to persist.",
    );
  }
  const ts = Number.isFinite(persistedAtMs) ? persistedAtMs : Date.now();
  return {
    runId,
    persistedAt: new Date(ts).toISOString(),
    contractVersion: manifest.contractVersion ?? null,
    manifest: serializeManifestForStorage(manifest),
  };
}

/**
 * Pure persistence layer that operates against any object exposing
 * async `get(key)` and `put(key, value)` (compatible with
 * `DurableObjectStorage`). Factored out so unit tests can run under Node
 * with an in-memory storage shim.
 */
export class RunManifestPersistence {
  constructor({ storage, now = () => Date.now() } = {}) {
    if (!storage || typeof storage.get !== "function" || typeof storage.put !== "function") {
      throw new Error(
        "RunManifestPersistence requires a storage object with async get(key) and put(key, value).",
      );
    }
    this.storage = storage;
    this._now = typeof now === "function" ? now : () => Date.now();
  }

  /**
   * Persist a Run_Manifest. Returns the full persistence record so callers
   * can echo the persisted timestamp without re-reading the store.
   *
   * All storage keys are committed through a single atomic `storage.put({...})`
   * batch so a failed write cannot leave a torn/partial record: either every
   * key is updated or none is, and the most-recently-persisted state remains
   * intact and readable (R14.3). `buildPersistenceRecord` additionally
   * validates the manifest carries a usable `runId` *before* any write is
   * attempted, so an invalid manifest never mutates stored state.
   */
  async put(manifest) {
    const record = buildPersistenceRecord(manifest, this._now());
    await this.storage.put({
      [RUN_MANIFEST_STORAGE_KEYS.manifest]: record.manifest,
      [RUN_MANIFEST_STORAGE_KEYS.persistedAt]: record.persistedAt,
      [RUN_MANIFEST_STORAGE_KEYS.runId]: record.runId,
      [RUN_MANIFEST_STORAGE_KEYS.contractVersion]: record.contractVersion,
    });
    return record;
  }

  /**
   * Read the latest persisted Run_Manifest record, or `null` when no
   * manifest has been persisted to this DO instance.
   */
  async get() {
    const [manifest, persistedAt, runId, contractVersion] = await Promise.all([
      this.storage.get(RUN_MANIFEST_STORAGE_KEYS.manifest),
      this.storage.get(RUN_MANIFEST_STORAGE_KEYS.persistedAt),
      this.storage.get(RUN_MANIFEST_STORAGE_KEYS.runId),
      this.storage.get(RUN_MANIFEST_STORAGE_KEYS.contractVersion),
    ]);
    if (manifest === undefined || manifest === null) return null;
    return {
      runId: typeof runId === "string" && runId.length > 0 ? runId : extractRunId(manifest),
      persistedAt: typeof persistedAt === "string" ? persistedAt : null,
      contractVersion:
        typeof contractVersion === "string" && contractVersion.length > 0
          ? contractVersion
          : manifest?.contractVersion ?? null,
      manifest,
    };
  }
}

/**
 * Persist the Run_Manifest carried by a Director payload to the
 * `RUN_MANIFEST_STORE` Durable Object namespace, keyed by `runId`. Returns
 * the persistence record on success and throws on persistence failure so
 * the caller can surface a diagnostic.
 */
export async function persistRunManifestThroughNamespace(namespace, manifest) {
  if (!namespace || typeof namespace.idFromName !== "function") {
    throw new Error(
      "persistRunManifestThroughNamespace requires a DurableObjectNamespace.",
    );
  }
  const runId = extractRunId(manifest);
  if (!runId) {
    throw new Error("Cannot persist Run_Manifest without a runId.");
  }
  const id = namespace.idFromName(runId);
  const stub = namespace.get(id);
  const response = await stub.fetch(
    new Request("https://run-manifest-store.internal/manifest", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
    }),
  );
  if (!response.ok) {
    let failureBody = null;
    try {
      failureBody = await response.json();
    } catch {
      failureBody = null;
    }
    const message =
      failureBody && typeof failureBody.error === "object" && failureBody.error
        ? String(failureBody.error.message ?? "unknown")
        : failureBody && typeof failureBody.message === "string"
          ? failureBody.message
          : "unknown";
    const error = new Error(
      `Run_Manifest persistence failed with status ${response.status}: ${message}`,
    );
    // Attach the structured persistence-failure response (R14.3) so callers
    // can surface the retained-state pointer and diagnostic without re-deriving
    // them from the thrown error string.
    error.persistenceFailure =
      failureBody && failureBody.status === RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS
        ? failureBody
        : null;
    error.httpStatus = response.status;
    throw error;
  }
  return response.json();
}

/**
 * Read the latest persisted Run_Manifest for `runId`, or `null` if no
 * manifest has been persisted to that DO instance yet.
 */
export async function readRunManifestThroughNamespace(namespace, runId) {
  if (!namespace || typeof namespace.idFromName !== "function") {
    throw new Error(
      "readRunManifestThroughNamespace requires a DurableObjectNamespace.",
    );
  }
  const trimmed = String(runId ?? "").trim();
  if (!trimmed) return null;
  const id = namespace.idFromName(trimmed);
  const stub = namespace.get(id);
  const response = await stub.fetch(
    new Request("https://run-manifest-store.internal/manifest", { method: "GET" }),
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Run_Manifest read failed with status ${response.status}: ${text || "unknown"}`,
    );
  }
  return response.json();
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Durable Object class implementing the per-run manifest store. Bound as
 * `RUN_MANIFEST_STORE` in `wrangler.toml` and exported from `index.ts`.
 *
 * Internal HTTP surface (not exposed publicly):
 *   - PUT  /manifest  body: Run_Manifest JSON   -> 200 + persistence record
 *   - GET  /manifest                            -> 200 + persistence record
 *                                              or 404 if nothing persisted
 *
 * The Worker entry brokers public access via the dispatch handler
 * (`persistRunManifestThroughNamespace`) and the
 * `GET /knowgrph/control-plane/mcp/runs/{id}` route (`readRunManifestThroughNamespace`).
 */
export class RunManifestStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.persistence = new RunManifestPersistence({ storage: state.storage });
    // Persistence-failure diagnostics (R14.3) are emitted through an injectable
    // sink so tests can capture them; defaults to the console-backed emitter.
    this.emitDiagnostic =
      env && typeof env.emitPersistenceDiagnostic === "function"
        ? env.emitPersistenceDiagnostic
        : defaultPersistenceDiagnosticEmitter;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (pathname === "/run-note" && method === "POST") {
      const store = new RunNoteExecutionStore({ storage: this.state.storage });
      const result = await handleRunNoteExecutionRequest(store, request);
      return jsonResponse(result.body, result.status);
    }

    if (pathname === "/manifest" && method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return jsonResponse(
          { error: "invalid_json", message: String(err?.message ?? err) },
          400,
        );
      }
      try {
        const record = await this.persistence.put(body);
        return jsonResponse(record, 200);
      } catch (err) {
        // R14.3: the atomic batch write means the prior record (if any) is
        // still intact. Read it back so the persistence-failure response and
        // diagnostic can report the most-recently-persisted state that was
        // retained, then emit the observability diagnostic.
        let retained = null;
        try {
          retained = await this.persistence.get();
        } catch {
          retained = null;
        }
        const failure = buildPersistenceFailureResponse({
          runId: extractRunId(body) ?? (retained && retained.runId) ?? null,
          error: err,
          retained,
        });
        this.emitDiagnostic(failure.diagnostic);
        return jsonResponse(failure, 500);
      }
    }

    if (pathname === "/manifest" && method === "GET") {
      const record = await this.persistence.get();
      if (!record) return jsonResponse({ error: "not_found" }, 404);
      return jsonResponse(record, 200);
    }

    return jsonResponse(
      { error: "not_found", message: `Unknown route ${method} ${pathname}` },
      404,
    );
  }
}
