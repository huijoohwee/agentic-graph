import fs from "node:fs/promises";
import path from "node:path";

const EFFECT_ID = /^ate_[0-9a-f]{24}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const MAX_EFFECT_BYTES = 256 * 1024;
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};

const parseRecord = (text, effectId, inputDigest) => {
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    fail("invalid_effect_receipt", "The local Agent Team effect receipt is invalid.");
  }
  if (
    !isRecord(record)
    || record.schema !== "agenticgraph.agent-team-local-effect/v1"
    || record.effectId !== effectId
    || record.inputDigest !== inputDigest
    || !["pending", "completed"].includes(record.status)
    || (
      record.status === "completed"
      && (!isRecord(record.result) || record.result.ok !== true)
    )
  ) fail("effect_receipt_fence_mismatch", "The local Agent Team effect receipt does not match this execution.");
  return record;
};

export class LocalAgentTeamEffectStore {
  constructor({ rootDir } = {}) {
    this.rootDir = path.resolve(rootDir || process.cwd());
    this.baseDir = path.join(this.rootDir, ".agenticgraph-workspace", "agent-team-effects");
  }

  effectPath(effectId) {
    if (!EFFECT_ID.test(String(effectId || ""))) fail("invalid_effect_id", "Invalid local Agent Team effect id.");
    return path.join(this.baseDir, `${effectId}.json`);
  }

  async ensureBaseDir() {
    await fs.mkdir(this.baseDir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.baseDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail("unsafe_effect_store", "The local Agent Team effect store is unsafe.");
    }
  }

  async read(effectId, inputDigest) {
    if (!DIGEST.test(String(inputDigest || ""))) fail("invalid_effect_digest", "Invalid local Agent Team effect digest.");
    await this.ensureBaseDir();
    const filePath = this.effectPath(effectId);
    let stat;
    try {
      stat = await fs.lstat(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_EFFECT_BYTES) {
      fail("unsafe_effect_receipt", "The local Agent Team effect receipt is unsafe.");
    }
    return parseRecord(await fs.readFile(filePath, "utf8"), effectId, inputDigest);
  }

  async begin(effectId, inputDigest) {
    const existing = await this.read(effectId, inputDigest);
    if (existing) return { ...existing, createdByThisCall: false };
    const filePath = this.effectPath(effectId);
    const pending = {
      schema: "agenticgraph.agent-team-local-effect/v1",
      status: "pending",
      effectId,
      inputDigest,
    };
    let handle;
    try {
      handle = await fs.open(filePath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(pending)}\n`, "utf8");
      await handle.sync();
      return { ...pending, createdByThisCall: true };
    } catch (error) {
      if (error?.code === "EEXIST") {
        const raced = await this.read(effectId, inputDigest);
        return { ...raced, createdByThisCall: false };
      }
      throw error;
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async complete(effectId, inputDigest, result) {
    const existing = await this.read(effectId, inputDigest);
    if (!existing || existing.status !== "pending") {
      if (existing?.status === "completed") return structuredClone(existing.result);
      fail("effect_claim_unavailable", "The local Agent Team effect claim is unavailable.");
    }
    const completed = {
      schema: "agenticgraph.agent-team-local-effect/v1",
      status: "completed",
      effectId,
      inputDigest,
      result: structuredClone(result),
    };
    const encoded = `${JSON.stringify(completed)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > MAX_EFFECT_BYTES) {
      fail("effect_receipt_too_large", "The local Agent Team effect receipt is too large.");
    }
    const filePath = this.effectPath(effectId);
    const temporaryPath = path.join(
      this.baseDir,
      `.${effectId}.${process.pid}.${Date.now()}.tmp`,
    );
    let handle;
    try {
      handle = await fs.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(encoded, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporaryPath, filePath);
    } finally {
      await handle?.close().catch(() => undefined);
      await fs.unlink(temporaryPath).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    }
    return structuredClone(completed.result);
  }
}
