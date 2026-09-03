import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const RECEIPT_ID = /^atrv_[0-9a-f]{32}$/;
const MAX_RECEIPT_BYTES = 32 * 1024;
const DEFAULT_TTL_MS = 15 * 60 * 1_000;
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};

export class LocalAgentTeamReviewStore {
  constructor({ rootDir, nowMs = () => Date.now() } = {}) {
    this.rootDir = path.resolve(rootDir || process.cwd());
    this.baseDir = path.join(this.rootDir, ".agentic-graph-workspace", "agent-team-review-receipts");
    this.nowMs = nowMs;
  }

  async ensureBaseDir() {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.baseDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("unsafe_review_receipt_store", "The local Agent Team review receipt store is unsafe.");
    }
  }

  receiptPath(receiptId) {
    if (!RECEIPT_ID.test(String(receiptId || ""))) {
      fail("invalid_review_receipt_id", "The local Agent Team review receipt id is invalid.");
    }
    return path.join(this.baseDir, `${receiptId}.json`);
  }

  async issue(expected, { ttlMs = DEFAULT_TTL_MS } = {}) {
    await this.ensureBaseDir();
    const receiptId = `atrv_${crypto.randomBytes(16).toString("hex")}`;
    const now = Math.max(0, Math.floor(this.nowMs()));
    const record = {
      schema: "agentic-graph.agent-team-local-review-receipt/v1",
      receiptId,
      runId: expected.runId,
      planDigest: expected.planDigest,
      checkpointId: expected.checkpointId,
      stateVersion: expected.stateVersion,
      policyId: expected.policyId,
      policyRevision: expected.policyRevision,
      decision: expected.decision,
      createdAtMs: now,
      expiresAtMs: now + Math.max(60_000, Math.min(24 * 60 * 60 * 1_000, Math.floor(ttlMs))),
    };
    const encoded = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > MAX_RECEIPT_BYTES) {
      fail("review_receipt_too_large", "The local Agent Team review receipt is too large.");
    }
    const handle = await fs.open(this.receiptPath(receiptId), "wx", 0o600);
    try {
      await handle.writeFile(encoded, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return Object.freeze({
      expectedStateVersion: expected.stateVersion,
      reviewReceipt: Object.freeze({
        policyId: expected.policyId,
        policyRevision: expected.policyRevision,
        decision: expected.decision,
        receiptId,
      }),
      expiresAtMs: record.expiresAtMs,
    });
  }

  async verify(expected) {
    await this.ensureBaseDir();
    const filePath = this.receiptPath(expected.receiptId);
    const stat = await fs.lstat(filePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_RECEIPT_BYTES) {
      fail("review_receipt_unavailable", "The local Agent Team review receipt is unavailable.");
    }
    let record;
    try {
      record = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch {
      fail("invalid_review_receipt", "The local Agent Team review receipt is invalid.");
    }
    const fields = [
      "runId", "planDigest", "checkpointId", "stateVersion",
      "policyId", "policyRevision", "decision", "receiptId",
    ];
    if (
      !isRecord(record)
      || record.schema !== "agentic-graph.agent-team-local-review-receipt/v1"
      || fields.some((field) => record[field] !== expected[field])
      || !Number.isSafeInteger(record.createdAtMs)
      || !Number.isSafeInteger(record.expiresAtMs)
      || record.expiresAtMs <= this.nowMs()
    ) fail("review_receipt_rejected", "The local Agent Team review receipt does not match the current checkpoint.");
    return { ok: true, receipt: structuredClone(expected) };
  }
}

export async function authorizeLocalAgentTeamControl(expected) {
  return { ok: true, authorization: structuredClone(expected) };
}
