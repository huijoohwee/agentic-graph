import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  checkKnowledgeGraphBudget,
  KnowledgeGraphError,
} from "./contract.mjs";
import { ensureKnowledgeGraphStorageRoot } from "./store.mjs";

const LOCK_SCHEMA = "knowgrph-knowledge-graph-ingest-lock/v1";
const INVALID_OWNER_GRACE_MS = 5_000;
const OWNER_FILE = /^owner\.([a-f0-9-]{36})\.json$/;
const RETRY_MS = 25;

const delay = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function prepareLockCandidate(directory, lockName, token) {
  const candidatePath = path.join(
    directory,
    `.${lockName}.candidate.${process.pid}.${token}`,
  );
  const ownerName = `owner.${token}.json`;
  const ownerPath = path.join(candidatePath, ownerName);
  await fs.mkdir(candidatePath, { mode: 0o700 });
  const handle = await fs.open(ownerPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify({
      schema: LOCK_SCHEMA,
      pid: process.pid,
      token,
    })}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { candidatePath, ownerName };
}

async function readLockState(lockPath) {
  const observed = await fs.lstat(lockPath);
  if (observed.isSymbolicLink() || !observed.isDirectory()) {
    throw new KnowledgeGraphError(
      "ingest_lock_invalid",
      "The knowledge graph ingest lock is not a regular directory.",
    );
  }
  const entries = await fs.readdir(lockPath);
  if (entries.length !== 1) return { observed, owner: null, ownerName: "" };
  const ownerName = entries[0];
  const match = OWNER_FILE.exec(ownerName);
  const ownerPath = path.join(lockPath, ownerName);
  const ownerStat = await fs.lstat(ownerPath);
  if (!match || ownerStat.isSymbolicLink() || !ownerStat.isFile()) {
    return { observed, owner: null, ownerName };
  }
  try {
    const owner = JSON.parse(await fs.readFile(ownerPath, "utf8"));
    return owner?.schema === LOCK_SCHEMA
      && owner.token === match[1]
      && Number.isSafeInteger(owner.pid)
      ? { observed, owner, ownerName }
      : { observed, owner: null, ownerName };
  } catch {
    return { observed, owner: null, ownerName };
  }
}

async function reclaimDeadLock(lockPath, state) {
  const invalidOwnerExpired = !state.owner
    && Date.now() - state.observed.mtimeMs >= INVALID_OWNER_GRACE_MS;
  if (!invalidOwnerExpired && (!state.owner || processIsAlive(state.owner.pid))) return false;
  if (state.ownerName) {
    try {
      await fs.unlink(path.join(lockPath, state.ownerName));
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }
  try {
    await fs.rmdir(lockPath);
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error?.code)) return false;
    throw error;
  }
}

async function acquireIngestLock(pointerPath, options) {
  const directory = await ensureKnowledgeGraphStorageRoot(path.dirname(pointerPath));
  const lockName = `${path.basename(pointerPath)}.ingest.lock`;
  const lockPath = path.join(directory, lockName);
  const token = crypto.randomUUID();
  const candidate = await prepareLockCandidate(directory, lockName, token);
  let acquired = false;
  try {
    while (true) {
      checkKnowledgeGraphBudget({ ...options, stage: "ingest-lock-acquire" });
      try {
        await fs.rename(candidate.candidatePath, lockPath);
        acquired = true;
        return {
          lockPath,
          ownerName: candidate.ownerName,
          token,
        };
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes(error?.code)) throw error;
      }
      let state;
      try {
        state = await readLockState(lockPath);
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
      if (await reclaimDeadLock(lockPath, state)) continue;
      await delay(RETRY_MS);
    }
  } finally {
    if (!acquired) {
      await fs.rm(candidate.candidatePath, { recursive: true, force: true });
    }
  }
}

async function releaseIngestLock(lock) {
  const state = await readLockState(lock.lockPath);
  if (state.owner?.token !== lock.token || state.ownerName !== lock.ownerName) {
    throw new KnowledgeGraphError(
      "ingest_lock_ownership_lost",
      "The knowledge graph ingest lock owner changed before release.",
    );
  }
  await fs.unlink(path.join(lock.lockPath, lock.ownerName));
  await fs.rmdir(lock.lockPath);
}

export async function withKnowledgeGraphIngestLock(pointerPath, options, operation) {
  const lock = await acquireIngestLock(pointerPath, options);
  try {
    return await operation();
  } finally {
    await releaseIngestLock(lock);
  }
}
