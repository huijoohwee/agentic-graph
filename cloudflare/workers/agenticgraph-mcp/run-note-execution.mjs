import { RUN_MANIFEST_STORAGE_KEYS, extractRunId } from "./run-manifest/shared.mjs";

export const RUN_NOTE_TOOL_NAME = "knowgrph.run_manifest.note.update";
export const RUN_NOTE_EXECUTION_META_KEY = "io.agentic-canvas-os/execution";
export const RUN_NOTE_RECEIPT_SCHEMA = "knowgrph-tool-execution-receipt/v1";

const EXECUTION_SCHEMA = "function-execution-receipt/v1";
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECEIPTS_PER_RUN = 32;
const SHA256_HEX = /^[a-f0-9]{64}$/u;

const receiptSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "idempotencyKey", "requestDigest", "status"],
  properties: {
    schema: { type: "string", const: RUN_NOTE_RECEIPT_SCHEMA },
    idempotencyKey: { type: "string", pattern: "^[a-f0-9]{64}$" },
    requestDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
    status: { type: "string", enum: ["applied", "replayed"] },
  },
});

export const RUN_NOTE_TOOL_DEFINITION = Object.freeze({
  name: RUN_NOTE_TOOL_NAME,
  title: "Update a persisted run note",
  description:
    "Replace the operator-reviewed note on one persisted Run_Manifest. Requires execution metadata and returns durable idempotency evidence.",
  inputSchema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["run_id", "note"],
    properties: {
      run_id: { type: "string", minLength: 1, maxLength: 128 },
      note: { type: "string", minLength: 1, maxLength: 2000 },
    },
  }),
  outputSchema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["ok", "run_id", "note", "revision", "execution_receipt"],
    properties: {
      ok: { type: "boolean", const: true },
      run_id: { type: "string" },
      note: { type: "string" },
      revision: { type: "integer", minimum: 1 },
      execution_receipt: receiptSchema,
    },
  }),
  annotations: Object.freeze({
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  }),
});

class RunNoteExecutionError extends Error {
  constructor(code, message, { status = 400, retryable = false } = {}) {
    super(message);
    this.name = "RunNoteExecutionError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function normalizeArguments(value) {
  if (!exactKeys(value, ["run_id", "note"])) {
    throw new RunNoteExecutionError(
      "invalid_arguments",
      "Run note arguments must contain only `run_id` and `note`.",
    );
  }
  const runId = typeof value.run_id === "string" ? value.run_id.trim() : "";
  const note = typeof value.note === "string" ? value.note.trim() : "";
  if (!runId || runId.length > 128) {
    throw new RunNoteExecutionError("invalid_run_id", "`run_id` must contain 1 to 128 characters.");
  }
  if (!note || note.length > 2000) {
    throw new RunNoteExecutionError("invalid_note", "`note` must contain 1 to 2000 characters.");
  }
  return Object.freeze({ run_id: runId, note });
}

function normalizeExecution(value, idempotencyHeader) {
  if (!exactKeys(value, ["schema", "receiptId", "idempotencyKey", "requestDigest"])) {
    throw new RunNoteExecutionError(
      "execution_metadata_required",
      `MCP request metadata \`${RUN_NOTE_EXECUTION_META_KEY}\` is required.`,
    );
  }
  const receiptId = typeof value.receiptId === "string" ? value.receiptId.trim() : "";
  if (value.schema !== EXECUTION_SCHEMA || !receiptId || receiptId.length > 512
    || !SHA256_HEX.test(value.idempotencyKey) || !SHA256_HEX.test(value.requestDigest)) {
    throw new RunNoteExecutionError("invalid_execution_metadata", "Execution metadata is invalid.");
  }
  if (idempotencyHeader !== value.idempotencyKey) {
    throw new RunNoteExecutionError(
      "idempotency_header_mismatch",
      "The `idempotency-key` header must match execution metadata.",
    );
  }
  return Object.freeze({
    schema: value.schema,
    receiptId,
    idempotencyKey: value.idempotencyKey,
    requestDigest: value.requestDigest,
  });
}

function failure(error) {
  const known = error instanceof RunNoteExecutionError;
  return {
    status: known ? error.status : 500,
    body: {
      ok: false,
      error: {
        code: known ? error.code : "run_note_execution_failed",
        message: error instanceof Error ? error.message : String(error),
        retryable: known ? error.retryable : true,
      },
    },
  };
}

function decorateOutput(output, execution, status) {
  return {
    ...output,
    execution_receipt: {
      schema: RUN_NOTE_RECEIPT_SCHEMA,
      idempotencyKey: execution.idempotencyKey,
      requestDigest: execution.requestDigest,
      status,
    },
  };
}

export class RunNoteExecutionStore {
  constructor({ storage, now = () => Date.now() } = {}) {
    if (!storage || typeof storage.transaction !== "function") {
      throw new TypeError("RunNoteExecutionStore requires transactional Durable Object storage.");
    }
    this.storage = storage;
    this.now = now;
  }

  async execute({ args: rawArgs, execution: rawExecution, idempotencyHeader } = {}) {
    const args = normalizeArguments(rawArgs);
    const execution = normalizeExecution(rawExecution, idempotencyHeader);
    const canonicalArguments = JSON.stringify(args);
    const timestamp = this.now();
    const result = await this.storage.transaction(async (transaction) => {
      const storedReceipts = await transaction.get(RUN_MANIFEST_STORAGE_KEYS.runNoteReceipts);
      const receipts = storedReceipts && typeof storedReceipts === "object"
        ? { ...storedReceipts }
        : {};
      for (const [key, record] of Object.entries(receipts)) {
        if (!Number.isFinite(record?.expiresAt) || record.expiresAt <= timestamp) delete receipts[key];
      }

      const previous = receipts[execution.idempotencyKey];
      if (previous) {
        if (previous.requestDigest !== execution.requestDigest
          || previous.receiptId !== execution.receiptId
          || previous.canonicalArguments !== canonicalArguments) {
          throw new RunNoteExecutionError(
            "idempotency_conflict",
            "The idempotency key is already bound to a different run-note execution.",
            { status: 409 },
          );
        }
        return { output: previous.output, replayed: true };
      }

      if (Object.keys(receipts).length >= MAX_RECEIPTS_PER_RUN) {
        throw new RunNoteExecutionError(
          "receipt_capacity_reached",
          "This run has reached its active execution-receipt limit.",
          { status: 503, retryable: true },
        );
      }

      const manifest = await transaction.get(RUN_MANIFEST_STORAGE_KEYS.manifest);
      if (!manifest || extractRunId(manifest) !== args.run_id) {
        throw new RunNoteExecutionError("run_not_found", "No persisted Run_Manifest matches `run_id`.", { status: 404 });
      }
      const previousRevision = Number.isInteger(manifest.operatorNote?.revision)
        ? manifest.operatorNote.revision
        : 0;
      const revision = previousRevision + 1;
      const updatedAt = new Date(timestamp).toISOString();
      const updatedManifest = JSON.parse(JSON.stringify(manifest));
      updatedManifest.operatorNote = { text: args.note, revision, updatedAt };
      const output = { ok: true, run_id: args.run_id, note: args.note, revision };
      receipts[execution.idempotencyKey] = {
        receiptId: execution.receiptId,
        requestDigest: execution.requestDigest,
        canonicalArguments,
        output,
        createdAt: timestamp,
        expiresAt: timestamp + RECEIPT_TTL_MS,
      };
      await transaction.put({
        [RUN_MANIFEST_STORAGE_KEYS.manifest]: updatedManifest,
        [RUN_MANIFEST_STORAGE_KEYS.persistedAt]: updatedAt,
        [RUN_MANIFEST_STORAGE_KEYS.runNoteReceipts]: receipts,
      });
      return { output, replayed: false };
    });
    return decorateOutput(result.output, execution, result.replayed ? "replayed" : "applied");
  }
}

export async function executeRunNoteThroughNamespace(
  namespace,
  { args, execution, idempotencyHeader } = {},
) {
  if (!namespace || typeof namespace.idFromName !== "function") {
    return failure(new RunNoteExecutionError(
      "run_manifest_store_unavailable",
      "RUN_MANIFEST_STORE binding is not configured.",
      { status: 503, retryable: true },
    )).body;
  }
  let normalizedArgs;
  try {
    normalizedArgs = normalizeArguments(args);
  } catch (error) {
    return failure(error).body;
  }
  const stub = namespace.get(namespace.idFromName(normalizedArgs.run_id));
  const response = await stub.fetch(new Request("https://run-manifest-store.internal/run-note", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyHeader ? { "idempotency-key": idempotencyHeader } : {}),
    },
    body: JSON.stringify({ args, execution }),
  }));
  const body = await response.json().catch(() => ({
    ok: false,
    error: { code: "invalid_run_note_response", message: "Run note store returned invalid JSON.", retryable: true },
  }));
  return body;
}

export async function handleRunNoteExecutionRequest(store, request) {
  try {
    const body = await request.json();
    const output = await store.execute({
      args: body?.args,
      execution: body?.execution,
      idempotencyHeader: request.headers.get("idempotency-key") ?? "",
    });
    return { status: 200, body: output };
  } catch (error) {
    return failure(error);
  }
}
