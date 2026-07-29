import { constants as FS_CONSTANTS } from "node:fs";
import { fork } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { RepositoryPackError } from "./repository-pack-error.js";

const PUBLISH_WORKER_FLAG = "--repository-pack-publish-worker";
const PUBLISH_WORKER_TIMEOUT_MS = 30_000;
const SAFE_ARTIFACT_NAME = /^[0-9a-f]{64}\.md$/u;
const SAFE_TEMPORARY_NAME = /^\.[0-9a-f]{64}\.[0-9]+\.[0-9a-f-]+\.tmp$/u;

const isInside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const identity = (stat) => ({
  dev: String(stat.dev),
  ino: String(stat.ino),
  mode: stat.mode,
  size: stat.size,
  mtimeMs: stat.mtimeMs,
});
const sameIdentity = (left, right) => Object.keys(left).every((key) => left[key] === right[key]);
const nodeIdentity = (stat) => ({
  dev: String(stat.dev),
  ino: String(stat.ino),
  mode: stat.mode,
});
const sameNode = (left, right) => Object.keys(left).every((key) => left[key] === right[key]);

const assertSafeDirectory = async (root, directory) => {
  const stat = await fs.lstat(directory).catch(() => null);
  const resolved = await fs.realpath(directory).catch(() => "");
  if (!stat?.isDirectory() || stat.isSymbolicLink() || !isInside(root, resolved)) {
    throw new RepositoryPackError("OUTPUT_PATH_UNSAFE");
  }
  return nodeIdentity(stat);
};

const assertSameSafeDirectory = async (root, directory, expected) => {
  const current = await assertSafeDirectory(root, directory);
  if (!sameNode(current, expected)) throw new RepositoryPackError("OUTPUT_PATH_UNSAFE");
};

export const ensureRepositoryPackOutputDirectory = async (root, outputDirectory) => {
  let cursor = root;
  for (const segment of outputDirectory.split("/")) {
    cursor = path.join(cursor, segment);
    try {
      await fs.mkdir(cursor, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw new RepositoryPackError("OUTPUT_PATH_UNSAFE");
    }
    await assertSafeDirectory(root, cursor);
  }
  return cursor;
};

const readBounded = async (handle, maximum, assertActive) => {
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    assertActive();
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximum + 1 - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }
  throw new RepositoryPackError("OUTPUT_COLLISION");
};

const verifyArtifact = async (root, target, expected, assertActive) => {
  try {
    const stat = await fs.lstat(target);
    const resolved = await fs.realpath(target);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !isInside(root, resolved)
      || stat.size !== expected.length
      || (stat.mode & 0o077) !== 0
    ) throw new RepositoryPackError("OUTPUT_COLLISION");
    const handle = await fs.open(target, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
    try {
      const opened = identity(await handle.stat());
      const content = await readBounded(handle, expected.length, assertActive);
      if (
        !sameIdentity(identity(stat), opened)
        || !content.equals(expected)
        || !sameIdentity(opened, identity(await handle.stat()))
      ) throw new RepositoryPackError("OUTPUT_COLLISION");
    } finally {
      await handle.close();
    }
    if (!isInside(root, await fs.realpath(target))) throw new RepositoryPackError("OUTPUT_COLLISION");
  } catch (error) {
    if (error instanceof RepositoryPackError) throw error;
    throw new RepositoryPackError("OUTPUT_COLLISION");
  }
};

const readHandleDigest = async (handle, maximum) => {
  const hash = createHash("sha256");
  let total = 0;
  while (total <= maximum) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximum + 1 - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, total);
    if (bytesRead === 0) return { bytes: total, sha256: hash.digest("hex") };
    hash.update(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }
  throw new Error("artifact-too-large");
};

const assertWorkerDirectory = async (expectedPath, expectedIdentity) => {
  const resolved = await fs.realpath(".");
  const stat = await fs.lstat(".");
  if (
    resolved !== expectedPath
    || !stat.isDirectory()
    || stat.isSymbolicLink()
    || !sameNode(nodeIdentity(stat), expectedIdentity)
  ) throw new Error("directory-moved");
};

const unlinkExactRelative = async (name, expectedIdentity) => {
  const stat = await fs.lstat(name).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return;
  if (!stat.isFile() || stat.isSymbolicLink() || !sameIdentity(identity(stat), expectedIdentity)) {
    throw new Error("owned-file-changed");
  }
  await fs.unlink(name);
};

const verifyRelativeArtifact = async (name, expectedBytes, expectedSha256) => {
  const stat = await fs.lstat(name);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expectedBytes || (stat.mode & 0o077) !== 0) {
    throw new Error("artifact-mismatch");
  }
  const handle = await fs.open(name, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
  try {
    const opened = identity(await handle.stat());
    const digest = await readHandleDigest(handle, expectedBytes);
    if (
      !sameIdentity(identity(stat), opened)
      || digest.bytes !== expectedBytes
      || digest.sha256 !== expectedSha256
      || !sameIdentity(opened, identity(await handle.stat()))
    ) throw new Error("artifact-mismatch");
    return opened;
  } finally {
    await handle.close();
  }
};

const sendWorkerMessage = (message) => new Promise((resolve, reject) => {
  if (!process.send) {
    reject(new Error("worker-ipc-unavailable"));
    return;
  }
  process.send(message, (error) => (error ? reject(error) : resolve()));
});

const runPublishWorker = async () => {
  let handle;
  let temporaryName = "";
  let temporaryIdentity;
  let targetName = "";
  let expectedDirectory = "";
  let directoryIdentity;
  let expectedBytes = 0;
  let expectedSha256 = "";
  let createdTarget = false;
  let completed = false;

  const cleanup = async () => {
    if (createdTarget && temporaryIdentity) {
      await unlinkExactRelative(targetName, temporaryIdentity).catch(() => undefined);
    }
    if (temporaryIdentity) {
      await unlinkExactRelative(temporaryName, temporaryIdentity).catch(() => undefined);
    }
    await handle?.close().catch(() => undefined);
    handle = undefined;
  };
  const fail = async () => {
    await cleanup();
    await sendWorkerMessage({ type: "failed" }).catch(() => undefined);
    process.disconnect?.();
  };
  let chain = Promise.resolve();
  process.on("message", (message) => {
    chain = chain.then(async () => {
      if (!message || typeof message !== "object" || completed) throw new Error("invalid-worker-message");
      if (message.type === "prepare") {
        if (
          handle
          || !SAFE_TEMPORARY_NAME.test(message.temporaryName)
          || !SAFE_ARTIFACT_NAME.test(message.targetName)
          || typeof message.expectedDirectory !== "string"
        ) throw new Error("invalid-worker-prepare");
        expectedDirectory = message.expectedDirectory;
        temporaryName = message.temporaryName;
        targetName = message.targetName;
        const resolved = await fs.realpath(".");
        const stat = await fs.lstat(".");
        directoryIdentity = nodeIdentity(stat);
        if (resolved !== expectedDirectory || !stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error("directory-moved");
        }
        handle = await fs.open(
          temporaryName,
          FS_CONSTANTS.O_RDWR | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | FS_CONSTANTS.O_NOFOLLOW,
          0o600,
        );
        temporaryIdentity = identity(await handle.stat());
        await sendWorkerMessage({
          type: "prepared",
          directoryIdentity,
          temporaryIdentity,
        });
        return;
      }
      if (message.type === "stage") {
        if (
          !handle
          || !Number.isSafeInteger(message.expectedBytes)
          || message.expectedBytes < 0
          || !/^[0-9a-f]{64}$/u.test(message.expectedSha256)
        ) throw new Error("invalid-worker-stage");
        expectedBytes = message.expectedBytes;
        expectedSha256 = message.expectedSha256;
        await handle.sync();
        temporaryIdentity = identity(await handle.stat());
        const digest = await readHandleDigest(handle, expectedBytes);
        if (digest.bytes !== expectedBytes || digest.sha256 !== expectedSha256) {
          throw new Error("artifact-mismatch");
        }
        await sendWorkerMessage({ type: "staged", temporaryIdentity });
        return;
      }
      if (message.type === "abort") {
        completed = true;
        await cleanup();
        await sendWorkerMessage({ type: "aborted" });
        process.disconnect?.();
        return;
      }
      if (message.type !== "commit" || !handle || !temporaryIdentity) {
        throw new Error("invalid-worker-commit");
      }
      await assertWorkerDirectory(expectedDirectory, directoryIdentity);
      const digest = await readHandleDigest(handle, expectedBytes);
      if (digest.bytes !== expectedBytes || digest.sha256 !== expectedSha256) {
        throw new Error("artifact-mismatch");
      }
      let reused = false;
      try {
        await fs.link(temporaryName, targetName);
        createdTarget = true;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        reused = true;
        await verifyRelativeArtifact(targetName, expectedBytes, expectedSha256);
      }
      await unlinkExactRelative(temporaryName, temporaryIdentity);
      await verifyRelativeArtifact(targetName, expectedBytes, expectedSha256);
      await assertWorkerDirectory(expectedDirectory, directoryIdentity);
      completed = true;
      await handle.close();
      handle = undefined;
      await sendWorkerMessage({ type: "committed", reused });
      process.disconnect?.();
    }).catch(fail);
  });
  process.on("disconnect", () => {
    if (!completed) void cleanup().finally(() => process.exit(1));
  });
  await sendWorkerMessage({ type: "booted" });
};

const createMessageReader = (child) => {
  const pending = [];
  const waiting = [];
  let terminalError = null;
  child.on("message", (message) => {
    if (message?.type === "failed") {
      terminalError = new RepositoryPackError("OUTPUT_PATH_UNSAFE");
      while (waiting.length) {
        const entry = waiting.shift();
        clearTimeout(entry.timer);
        entry.reject(terminalError);
      }
      return;
    }
    const index = waiting.findIndex((entry) => entry.type === message?.type);
    if (index < 0) {
      pending.push(message);
      return;
    }
    const [entry] = waiting.splice(index, 1);
    clearTimeout(entry.timer);
    entry.resolve(message);
  });
  const fail = () => {
    terminalError = new RepositoryPackError("OUTPUT_PATH_UNSAFE");
    while (waiting.length) {
      const entry = waiting.shift();
      clearTimeout(entry.timer);
      entry.reject(terminalError);
    }
  };
  child.once("error", fail);
  child.once("exit", () => {
    if (!terminalError && waiting.length) fail();
  });
  return (type, timeoutMs) => {
    const index = pending.findIndex((message) => message?.type === type);
    if (index >= 0) return Promise.resolve(pending.splice(index, 1)[0]);
    if (terminalError) return Promise.reject(terminalError);
    return new Promise((resolve, reject) => {
      const entry = { type, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const waitingIndex = waiting.indexOf(entry);
        if (waitingIndex >= 0) waiting.splice(waitingIndex, 1);
        reject(new RepositoryPackError("RUNTIME_LIMIT_EXCEEDED"));
      }, Math.max(1, timeoutMs));
      entry.timer.unref?.();
      waiting.push(entry);
    });
  };
};

const sendChildMessage = (child, message) => new Promise((resolve, reject) => {
  child.send(message, (error) => (error ? reject(error) : resolve()));
});

export const publishRepositoryPackArtifact = async ({
  root,
  outputDir,
  outputDirectory,
  artifact,
  artifactSha256,
  revalidate,
  assertActive,
  remainingRuntime,
  hooks = {},
}) => {
  const target = path.join(outputDir, `${artifactSha256}.md`);
  const artifactPath = `${outputDirectory}/${artifactSha256}.md`;
  await revalidate();
  const outputIdentity = await assertSafeDirectory(root, outputDir);
  const existing = await fs.lstat(target).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw new RepositoryPackError("OUTPUT_COLLISION");
  });
  if (existing) {
    await verifyArtifact(root, target, artifact, assertActive);
    await revalidate();
    await verifyArtifact(root, target, artifact, assertActive);
    return { artifactPath, reused: true };
  }
  const temporaryName = `.${artifactSha256}.${process.pid}.${randomUUID()}.tmp`;
  const targetName = `${artifactSha256}.md`;
  const temporary = path.join(outputDir, temporaryName);
  const child = fork(fileURLToPath(import.meta.url), [PUBLISH_WORKER_FLAG], {
    cwd: outputDir,
    env: {},
    execArgv: [],
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const nextMessage = createMessageReader(child);
  let handle;
  let committed = false;
  const stageTimeout = () => remainingRuntime?.() ?? PUBLISH_WORKER_TIMEOUT_MS;
  try {
    await nextMessage("booted", stageTimeout());
    await sendChildMessage(child, {
      type: "prepare",
      temporaryName,
      targetName,
      expectedDirectory: outputDir,
    });
    const prepared = await nextMessage("prepared", stageTimeout());
    if (!sameNode(prepared.directoryIdentity, outputIdentity)) {
      throw new RepositoryPackError("OUTPUT_PATH_UNSAFE");
    }
    handle = await fs.open(temporary, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_NOFOLLOW);
    if (!sameIdentity(identity(await handle.stat()), prepared.temporaryIdentity)) {
      throw new RepositoryPackError("OUTPUT_PATH_UNSAFE");
    }
    await handle.writeFile(artifact);
    await handle.sync();
    const temporaryIdentity = identity(await handle.stat());
    await handle.close();
    handle = undefined;
    await sendChildMessage(child, {
      type: "stage",
      expectedBytes: artifact.length,
      expectedSha256: artifactSha256,
    });
    const staged = await nextMessage("staged", stageTimeout());
    if (!sameIdentity(staged.temporaryIdentity, temporaryIdentity)) {
      throw new RepositoryPackError("OUTPUT_COLLISION");
    }
    await hooks.afterArtifactStaged?.({ outputDir, temporary });
    await revalidate();
    await assertSameSafeDirectory(root, outputDir, outputIdentity);
    await hooks.beforeArtifactCommit?.();
    await assertSameSafeDirectory(root, outputDir, outputIdentity);
    assertActive();
    await sendChildMessage(child, { type: "commit" });
    const published = await nextMessage("committed", PUBLISH_WORKER_TIMEOUT_MS);
    committed = true;
    return { artifactPath, reused: published.reused };
  } finally {
    await handle?.close().catch(() => undefined);
    if (!committed && child.connected) {
      await sendChildMessage(child, { type: "abort" }).catch(() => undefined);
      let cleanupTimeout = 1_000;
      try {
        cleanupTimeout = Math.min(5_000, stageTimeout());
      } catch {
        // Runtime expiry does not suppress bounded cleanup of an owned temporary.
      }
      await nextMessage("aborted", cleanupTimeout).catch(() => undefined);
    }
    if (child.connected) child.kill("SIGTERM");
  }
};

if (process.argv[2] === PUBLISH_WORKER_FLAG) {
  await runPublishWorker().catch(() => process.exit(1));
}
