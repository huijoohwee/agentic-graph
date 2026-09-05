import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { checkAgentGraphBudget, AgentGraphError, sha256, stableStringify } from "./contract.mjs";
import {
  MAX_OBJECT_BYTES, MAX_POINTER_BYTES,
} from "./store-schema.mjs";

export const checkStoreBudget = (options, stage) => checkAgentGraphBudget({
  abortSignal: options?.abortSignal,
  deadline: options?.deadline,
  stage,
});
export const attachReadBudget = (snapshot, options) => Object.defineProperty(snapshot, "readBudget", {
  value: { abortSignal: options?.abortSignal, deadline: options?.deadline },
  enumerable: false,
});
function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;
async function lstatIfPresent(targetPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function verifiedDirectory(directoryPath, containmentRoot) {
  const observed = await fs.lstat(directoryPath);
  if (observed.isSymbolicLink()) {
    throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage paths must not contain symbolic links.");
  }
  if (!observed.isDirectory()) {
    throw new AgentGraphError("artifact_path_not_directory", "Knowledge graph storage parent is not a directory.");
  }
  const real = await fs.realpath(directoryPath);
  const resolved = await fs.stat(real);
  if (!sameFileIdentity(observed, resolved) || (containmentRoot && !pathIsInside(real, containmentRoot))) {
    throw new AgentGraphError("artifact_path_unstable", "Knowledge graph storage directory changed or escaped containment.");
  }
  return real;
}
export async function ensureAgentGraphStorageRoot(rootPathRaw) {
  const requested = path.resolve(String(rootPathRaw || ""));
  if (!String(rootPathRaw || "").trim()) {
    throw new AgentGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  let ancestor = requested;
  const missing = [];
  while (!(await lstatIfPresent(ancestor))) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  let current = await verifiedDirectory(ancestor);
  const containmentRoot = current;
  for (const segment of missing) {
    const next = path.join(current, segment);
    try {
      await fs.mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    current = await verifiedDirectory(next, containmentRoot);
  }
  return current;
}
async function resolveContainedFileForWrite(filePath, allowedRoot) {
  if (!String(allowedRoot || "").trim()) {
    throw new AgentGraphError("artifact_allowed_root_required", "A host-owned knowledge graph output root is required.");
  }
  const requestedRoot = path.resolve(String(allowedRoot || ""));
  const requestedFile = path.resolve(filePath);
  const relative = path.relative(requestedRoot, requestedFile);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AgentGraphError("artifact_path_escape", "Knowledge graph storage path is outside its host-owned output root.");
  }
  const canonicalRoot = await ensureAgentGraphStorageRoot(requestedRoot);
  let current = canonicalRoot;
  for (const segment of path.dirname(relative).split(path.sep).filter((part) => part && part !== ".")) {
    const next = path.join(current, segment);
    try {
      await fs.mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    current = await verifiedDirectory(next, canonicalRoot);
  }
  const target = path.join(current, path.basename(requestedFile));
  const existing = await lstatIfPresent(target);
  if (existing?.isSymbolicLink()) {
    throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
  }
  if (existing && !existing.isFile()) {
    throw new AgentGraphError("artifact_path_not_file", "Knowledge graph storage target is not a regular file.");
  }
  return { canonicalRoot, target };
}
async function writeExclusiveText(filePath, serialized) {
  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_EXCL
    | Number(fsConstants.O_NOFOLLOW || 0);
  const handle = await fs.open(filePath, flags, 0o600);
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function readStableText(filePath, options = {}) {
  const {
    allowedRoot,
    maxBytes = MAX_OBJECT_BYTES,
    missingCode = "artifact_not_found",
  } = options;
  let handle;
  try {
    checkStoreBudget(options, "snapshot-read-open");
    handle = await fs.open(filePath, fsConstants.O_RDONLY | Number(fsConstants.O_NOFOLLOW || 0));
    checkStoreBudget(options, "snapshot-read-stat");
    const opened = await handle.stat();
    if (!opened.isFile()) throw new AgentGraphError("artifact_not_file", `Stored graph value is not a regular file: ${filePath}`);
    if (opened.size > maxBytes) throw new AgentGraphError("artifact_too_large", `Stored graph value exceeds ${maxBytes} bytes.`);
    const real = await fs.realpath(filePath);
    const pathStat = await fs.stat(real);
    const realAllowedRoot = allowedRoot
      ? await fs.realpath(allowedRoot).catch(() => path.resolve(allowedRoot))
      : "";
    if ((realAllowedRoot && !pathIsInside(real, realAllowedRoot)) || !sameFileIdentity(opened, pathStat)) {
      throw new AgentGraphError("artifact_path_unstable", "Stored graph value changed or escaped while it was opened.");
    }
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      checkStoreBudget(options, "snapshot-read-content");
      const chunk = await handle.read(bytes, offset, Math.min(1024 * 1024, bytes.length - offset), offset);
      if (!chunk.bytesRead) break;
      offset += chunk.bytesRead;
    }
    checkStoreBudget(options, "snapshot-read-verify");
    const extra = Buffer.alloc(1);
    const extraRead = await handle.read(extra, 0, 1, opened.size);
    const closed = await handle.stat();
    if (offset !== bytes.length || extraRead.bytesRead || !sameFileIdentity(opened, closed)
      || opened.size !== closed.size || opened.mtimeMs !== closed.mtimeMs) {
      throw new AgentGraphError("artifact_changed_during_read", "Stored graph value changed while it was being read.");
    }
    checkStoreBudget(options, "snapshot-read-complete");
    return bytes.toString("utf8");
  } catch (error) {
    if (error instanceof AgentGraphError) throw error;
    if (error?.code === "ENOENT") throw new AgentGraphError(missingCode, `Stored graph value was not found: ${filePath}`);
    if (error?.code === "ELOOP") {
      throw new AgentGraphError("artifact_path_symlink", "Knowledge graph storage files must not be symbolic links.");
    }
    throw new AgentGraphError("artifact_read_failed", "Stored graph value could not be read safely.", {
      causeCode: String(error?.code || "read_failed"),
    });
  } finally {
    await handle?.close().catch(() => {});
  }
}
export function parseStoredJson(raw, code) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch {
    throw new AgentGraphError(code, "Stored graph JSON is invalid.");
  }
}
export async function writeAtomicText(filePath, serialized, options = {}) {
  const { allowedRoot } = options;
  checkStoreBudget(options, "snapshot-pointer-stage");
  const resolved = await resolveContainedFileForWrite(filePath, allowedRoot);
  const directory = path.dirname(resolved.target);
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${sha256(`${filePath}:${process.hrtime.bigint()}`).slice(0, 12)}.tmp`,
  );
  try {
    await writeExclusiveText(temporary, serialized);
    checkStoreBudget(options, "snapshot-pointer-verify");
    const staged = await readStableText(temporary, {
      ...options,
      allowedRoot: resolved.canonicalRoot,
      maxBytes: MAX_POINTER_BYTES,
    });
    if (staged !== serialized) {
      throw new AgentGraphError("artifact_publish_mismatch", "Knowledge graph pointer publication could not be verified.");
    }
    checkStoreBudget(options, "snapshot-pointer-commit");
    await fs.rename(temporary, resolved.target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}
export const agentGraphStoreRoot = (pointerPath) => `${pointerPath}.store`;
function objectPath(storeRoot, digest) {
  if (!/^[a-f0-9]{64}$/.test(String(digest || ""))) {
    throw new AgentGraphError("object_digest_invalid", "Stored graph object digest is invalid.");
  }
  return path.join(storeRoot, "objects", digest.slice(0, 2), `${digest}.json`);
}
export async function writeContentAddressed(storeRoot, value, maxBytes = MAX_OBJECT_BYTES, options = {}) {
  const { allowedRoot } = options;
  const checkpoint = () => checkStoreBudget(options, "snapshot-object-serialization");
  const serialized = stableStringify(value, 2, { checkpoint });
  const bytes = Buffer.byteLength(serialized);
  if (bytes > maxBytes) {
    throw new AgentGraphError("artifact_too_large", `Stored graph object exceeds ${maxBytes} bytes.`, {
      actualBytes: bytes,
      maxBytes,
      previousSnapshotPreserved: true,
    });
  }
  checkpoint();
  const digest = sha256(serialized);
  const resolved = await resolveContainedFileForWrite(objectPath(storeRoot, digest), allowedRoot);
  const target = resolved.target;
  const temporary = `${target}.${process.pid}.${process.hrtime.bigint()}.tmp`;
  try {
    await writeExclusiveText(temporary, serialized);
    checkpoint();
    try {
      await fs.link(temporary, target);
      options.objectTransaction?.createdDigests?.add(digest);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const existing = await readStableText(target, {
      ...options,
      allowedRoot: resolved.canonicalRoot,
      maxBytes,
    });
    checkpoint();
    if (existing !== serialized) throw new AgentGraphError("object_digest_collision", `Stored graph object digest collision: ${digest}`);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return { digest, bytes };
}
export async function removeAgentGraphObject(pointerPath, digest, options = {}) {
  const resolved = await resolveContainedFileForWrite(
    objectPath(agentGraphStoreRoot(pointerPath), digest),
    options.allowedRoot,
  );
  await fs.unlink(resolved.target).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
export async function readContentAddressed(
  snapshot,
  digest,
  maxBytes = MAX_OBJECT_BYTES,
  validation = {},
) {
  const options = snapshot.readBudget || {};
  const raw = await readStableText(objectPath(snapshot.storeRoot, digest), {
    ...options,
    allowedRoot: snapshot.allowedRoot,
    maxBytes,
    missingCode: "snapshot_object_missing",
  });
  const actualBytes = Buffer.byteLength(raw);
  if (validation.expectedBytes !== undefined && actualBytes !== validation.expectedBytes) {
    throw new AgentGraphError(
      validation.sizeCode || "snapshot_object_invalid",
      validation.sizeMessage || `Stored graph object byte count is invalid: ${digest}`,
      {
        ...(validation.details || {}),
        actualBytes,
        expectedBytes: validation.expectedBytes,
      },
    );
  }
  checkStoreBudget(options, "snapshot-object-hash");
  if (sha256(raw) !== digest) throw new AgentGraphError("snapshot_object_tampered", `Stored graph object digest mismatch: ${digest}`);
  const parsed = parseStoredJson(raw, "snapshot_object_invalid");
  checkStoreBudget(options, "snapshot-object-parse");
  return parsed;
}
