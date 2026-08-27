import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createExportPublishError } from "./export-publish-contract.js";

const LOCK_SCHEMA = "agenticgraph-export-identity-lock/v1";
const DEFAULT_LOCK_ROOT = path.join(os.tmpdir(), "agenticgraph-export-identity-locks-v1");
const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_RETRY_MS = 25;
const DEFAULT_STALE_MS = 30_000;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const lockError = (message, options = {}) => createExportPublishError(
  "LEDGER_LOCK_TIMEOUT",
  message,
  options,
);

const boundedInteger = (value, fallback, { label, minimum, maximum }) => {
  const selected = value ?? fallback;
  if (!Number.isInteger(selected) || selected < minimum || selected > maximum) {
    throw lockError(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return selected;
};

const identityLockDigest = ({ identityKey, publicationNamespace }) => createHash("sha256")
  .update(`${path.resolve(publicationNamespace)}\0${identityKey}`)
  .digest("hex");

const processIsAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
};

const parseOwner = (source, expectedDigest) => {
  try {
    const owner = JSON.parse(source);
    const acquiredAtMs = Date.parse(owner.acquired_at);
    if (
      owner.schema !== LOCK_SCHEMA
      || owner.lock_digest !== expectedDigest
      || !Number.isInteger(owner.pid)
      || owner.pid < 1
      || typeof owner.hostname !== "string"
      || !owner.hostname
      || typeof owner.token !== "string"
      || !/^[0-9a-f-]{36}$/i.test(owner.token)
      || !Number.isFinite(acquiredAtMs)
    ) {
      return null;
    }
    return { ...owner, acquiredAtMs };
  } catch {
    return null;
  }
};

const existingOwnerTarget = async ({ lockPath, lockRoot, digest }) => {
  let target;
  try {
    target = await fs.readlink(lockPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return false;
  }
  if (
    target !== path.basename(target)
    || !target.startsWith(`${digest}.`)
    || !target.endsWith(".owner")
  ) {
    return false;
  }
  const ownerPath = path.join(lockRoot, target);
  try {
    if (!(await fs.lstat(ownerPath)).isDirectory()) return false;
  } catch {
    return false;
  }
  return { target, ownerPath };
};

const recoverDeadOwner = async ({
  lockPath,
  lockRoot,
  digest,
  staleMs,
  now,
  hostname,
  isProcessAlive,
}) => {
  const selected = await existingOwnerTarget({ lockPath, lockRoot, digest });
  if (!selected) return selected === null;
  let owner;
  try {
    owner = parseOwner(await fs.readFile(path.join(selected.ownerPath, "owner.json"), "utf8"), digest);
  } catch {
    return false;
  }
  if (
    !owner
    || owner.hostname !== hostname
    || now() - owner.acquiredAtMs < staleMs
    || await isProcessAlive(owner.pid) !== false
  ) {
    return false;
  }

  const recoveryPath = path.join(selected.ownerPath, "recovery");
  try {
    await fs.mkdir(recoveryPath, { mode: 0o700 });
  } catch {
    // One recovery owner is allowed to unlink the demonstrably dead owner's lock.
    return false;
  }
  try {
    if (await fs.readlink(lockPath) !== selected.target) return false;
    await fs.unlink(lockPath);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  } finally {
    await fs.rm(selected.ownerPath, { recursive: true, force: true });
  }
};

const releaseOwnedLock = async ({ lockPath, target, ownerPath }) => {
  try {
    if (await fs.readlink(lockPath) === target) await fs.unlink(lockPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  } finally {
    await fs.rm(ownerPath, { recursive: true, force: true });
  }
};

export async function acquireExportIdentityLock(input, options = {}) {
  const identityKey = typeof input?.identityKey === "string" ? input.identityKey : "";
  const publicationNamespace = typeof input?.publicationNamespace === "string"
    ? input.publicationNamespace
    : "";
  if (!identityKey || !publicationNamespace) {
    throw new TypeError("Export identity locking requires identityKey and publicationNamespace.");
  }
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, {
    label: "identity lock timeoutMs", minimum: 1, maximum: 30_000,
  });
  const retryMs = boundedInteger(options.retryMs, DEFAULT_RETRY_MS, {
    label: "identity lock retryMs", minimum: 1, maximum: 1_000,
  });
  const staleMs = boundedInteger(options.staleMs, DEFAULT_STALE_MS, {
    label: "identity lock staleMs", minimum: 1, maximum: 3_600_000,
  });
  const lockRoot = path.resolve(options.lockRoot ?? DEFAULT_LOCK_ROOT);
  const now = options.now ?? Date.now;
  const hostname = options.hostname ?? os.hostname();
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  const pid = options.pid ?? process.pid;
  if (!Number.isInteger(pid) || pid < 1) throw new TypeError("Export identity lock pid must be a positive integer.");
  if (typeof hostname !== "string" || !hostname.trim()) {
    throw new TypeError("Export identity lock hostname must be a non-empty string.");
  }
  if (typeof now !== "function" || typeof isProcessAlive !== "function") {
    throw new TypeError("Export identity lock clock and process probe must be functions.");
  }
  const digest = identityLockDigest({ identityKey, publicationNamespace });
  const token = randomUUID();
  const target = `${digest}.${pid}.${token}.owner`;
  const ownerPath = path.join(lockRoot, target);
  const lockPath = path.join(lockRoot, `${digest}.lock`);
  const deadline = now() + timeoutMs;

  await fs.mkdir(lockRoot, { recursive: true, mode: 0o700 });
  await fs.mkdir(ownerPath, { mode: 0o700 });
  await fs.writeFile(path.join(ownerPath, "owner.json"), `${JSON.stringify({
    schema: LOCK_SCHEMA,
    lock_digest: digest,
    pid,
    hostname,
    token,
    acquired_at: new Date(now()).toISOString(),
  })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });

  try {
    while (now() <= deadline) {
      try {
        await fs.symlink(target, lockPath, "dir");
        return async () => releaseOwnedLock({ lockPath, target, ownerPath });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      const recovered = await recoverDeadOwner({
        lockPath,
        lockRoot,
        digest,
        staleMs,
        now,
        hostname,
        isProcessAlive,
      });
      if (recovered) continue;
      const remainingMs = deadline - now();
      if (remainingMs <= 0) break;
      await delay(Math.min(retryMs, remainingMs));
    }
    throw lockError(`Timed out acquiring the export identity lock after ${timeoutMs}ms.`);
  } catch (error) {
    await fs.rm(ownerPath, { recursive: true, force: true });
    throw error;
  }
}

export async function withExportIdentityLock(input, operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("Export identity lock operation must be a function.");
  const release = await acquireExportIdentityLock(input, options);
  try {
    return await operation();
  } finally {
    await release();
  }
}
