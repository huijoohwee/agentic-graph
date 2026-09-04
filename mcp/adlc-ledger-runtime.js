import {
  LEGACY_RUN_SCHEMA, LEGACY_LEDGER_EVENT, loadLegacyLedgerEvaluator, readLegacyLedgerBinding, legacyCanonicalRunId,
} from "./adlc-legacy-ledger.js";
import { deepFreeze } from "./adlc-observability-json.js";

export const ADLC_LEDGER_RECEIPT_SCHEMA = "adlc-ledger-receipt/v1";
export const ADLC_RUN_SCHEMA = "adlc-run/v1";
export const ADLC_SOURCE_SCHEMAS = Object.freeze([ADLC_RUN_SCHEMA, LEGACY_RUN_SCHEMA]);
const RECEIPT_KEYS = ["schema", "canonicalSchema", "artifact", "digest", "bytes",
  "canonicalRunId", "ledgerRevision", "acosRevision"].sort();
const fail = (code, message) => Object.assign(new Error(message), { code });
const unavailable = () => fail("ADLC_EVALUATOR_UNAVAILABLE",
  "No native ADLC canonical-run evaluator is installed. Supply an exact historical ledger and its pinned evaluator for read-only observation; do not synthesize conformance.");

export function validateAdlcLedgerReceipt(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw fail("CANONICAL_LEDGER_UNAVAILABLE", "The implementation run has no canonical ADLC ledger receipt.");
  }
  const keys = Object.keys(input).sort();
  if (keys.length !== RECEIPT_KEYS.length || keys.some((key, i) => key !== RECEIPT_KEYS[i])
    || input.schema !== ADLC_LEDGER_RECEIPT_SCHEMA
    || !ADLC_SOURCE_SCHEMAS.includes(input.canonicalSchema)
    || !/^[a-z0-9][a-z0-9._-]{0,119}$/.test(String(input.artifact || ""))
    || !/^sha256:[0-9a-f]{64}$/.test(String(input.digest || ""))
    || !Number.isSafeInteger(input.bytes) || input.bytes < 2
    || typeof input.canonicalRunId !== "string" || !input.canonicalRunId.trim()
    || !Number.isSafeInteger(input.ledgerRevision) || input.ledgerRevision < 1
    || !/^[0-9a-f]{40}$/.test(String(input.acosRevision || ""))) {
    throw fail("LEDGER_RECEIPT_INVALID", "The native ADLC ledger receipt or exact source identity is invalid.");
  }
  return Object.freeze({ ...input, canonicalRunId: input.canonicalRunId.trim() });
}

export async function loadAdlcEvaluator({ canonicalSchema = ADLC_RUN_SCHEMA, ...options } = {}) {
  if (canonicalSchema === ADLC_RUN_SCHEMA) throw unavailable();
  if (canonicalSchema !== LEGACY_RUN_SCHEMA) throw fail("LEDGER_SCHEMA_INVALID", "Unsupported canonical source schema.");
  return loadLegacyLedgerEvaluator(options);
}

export function evaluateAdlcLedger(ledger, evaluator) {
  if (ledger?.schema === ADLC_RUN_SCHEMA) throw unavailable();
  try {
    if (ledger?.schema !== LEGACY_RUN_SCHEMA) throw new Error("Unsupported canonical source schema.");
    const source = deepFreeze(structuredClone(ledger));
    const canonicalRunId = legacyCanonicalRunId(source);
    evaluator.assertCanonicalRunSchema(source);
    const normalizedRun = evaluator.normalizeCanonicalRun(source);
    const conformance = evaluator.validateExecutionRun(source);
    if (!normalizedRun || normalizedRun.schema !== source.schema || normalizedRun.runId !== canonicalRunId
      || !conformance || conformance.runId !== canonicalRunId
      || typeof conformance.runtimeReady !== "boolean") {
      throw new Error("Evaluator returned an incomplete or differently identified canonical result.");
    }
    return Object.freeze({ normalizedRun: deepFreeze(structuredClone(normalizedRun)),
      conformance: deepFreeze(structuredClone(conformance)), stableJson: evaluator.stableJson });
  } catch (error) {
    if (error?.code) throw error;
    throw fail("LEDGER_SCHEMA_INVALID", `The canonical ledger failed its exact evaluator validation: ${error.message}`);
  }
}

export function createAdlcLedgerReceipt(fields) {
  return validateAdlcLedgerReceipt({ schema: ADLC_LEDGER_RECEIPT_SCHEMA, ...fields });
}

export function readAdlcLedgerBinding(state) {
  const legacy = readLegacyLedgerBinding(state.result);
  if (legacy) return { receipt: legacy, canonicalSchema: LEGACY_RUN_SCHEMA, eventType: LEGACY_LEDGER_EVENT };
  const receipt = validateAdlcLedgerReceipt(state.result?.adlcLedger);
  return { receipt, canonicalSchema: receipt.canonicalSchema, eventType: "adlc.ledger_bound" };
}
