import { constants as FS_CONSTANTS } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

import {
  REPOSITORY_PACK_DEFAULT_REQUEST,
  REPOSITORY_PACK_FORMAT_VERSION,
  REPOSITORY_PACK_HARD_BOUNDS,
  REPOSITORY_PACK_INVOCATION,
  REPOSITORY_PACK_SCHEMA_VERSION,
  REPOSITORY_PACK_TOOL_NAME,
} from "./repository-pack-contract.js";
import {
  buildRepositoryPackMarkdown,
  digestRepositoryPackSource,
} from "./repository-pack-format.js";
import {
  createRepositoryPackGit,
  sameRepositoryPackGitIndex,
} from "./repository-pack-git.js";
import { RepositoryPackError } from "./repository-pack-error.js";
import {
  ensureRepositoryPackOutputDirectory,
  publishRepositoryPackArtifact,
} from "./repository-pack-publisher.js";

export { RepositoryPackError } from "./repository-pack-error.js";

const execFileAsync = promisify(execFile);
const ALLOWED_ARGUMENTS = new Set(Object.keys(REPOSITORY_PACK_DEFAULT_REQUEST));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const byteSort = (values) => [...values].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
const sameList = (left, right) => (
  left.length === right.length && left.every((entry, index) => entry === right[index])
);
const isInside = (root, candidate, allowEqual = false) => {
  const relative = path.relative(root, candidate);
  return (allowEqual && relative === "")
    || (relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const statIdentity = (stat) => ({
  dev: String(stat.dev),
  ino: String(stat.ino),
  mode: stat.mode,
  size: stat.size,
  mtimeMs: stat.mtimeMs,
  ctimeMs: stat.ctimeMs,
});
const sameIdentity = (left, right) => Object.keys(left).every((key) => left[key] === right[key]);
const sameNode = (left, right) => left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
const emptyCounts = () => ({
  discoveredFiles: 0,
  embeddedFiles: 0,
  binaryFiles: 0,
  omittedFiles: 0,
  fileCount: 0,
  sourceBytes: 0,
  outputBytes: 0,
});
const emptyOmissions = () => ({
  policyExcluded: 0,
  binary: 0,
  symlink: 0,
  submodule: 0,
  nonRegular: 0,
});

const effectiveHostBound = (value, fallback, hard) => {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > hard) {
    throw new RepositoryPackError("INVALID_HOST_BOUNDS");
  }
  return selected;
};

const buildBounds = (request, options) => ({
  maxFiles: request.maxFiles,
  maxFileBytes: request.maxFileBytes,
  maxTotalBytes: request.maxTotalBytes,
  maxOutputBytes: effectiveHostBound(
    options.maxOutputBytes,
    REPOSITORY_PACK_HARD_BOUNDS.defaultMaxOutputBytes,
    REPOSITORY_PACK_HARD_BOUNDS.hardMaxOutputBytes,
  ),
  maxRuntimeMs: effectiveHostBound(
    options.maxRuntimeMs,
    REPOSITORY_PACK_HARD_BOUNDS.defaultRuntimeMs,
    REPOSITORY_PACK_HARD_BOUNDS.hardRuntimeMs,
  ),
  maxResponseBytes: REPOSITORY_PACK_HARD_BOUNDS.maxResponseBytes,
  maxPolicyPaths: REPOSITORY_PACK_HARD_BOUNDS.maxPolicyPaths,
  maxPathBytes: REPOSITORY_PACK_HARD_BOUNDS.maxPathBytes,
});

const resultEnvelope = ({
  ok,
  status,
  artifactPath = null,
  artifactSha256 = null,
  sourceSetSha256 = null,
  gitRevision = "unavailable",
  counts,
  bounds,
  omissions,
  reused = false,
  error = null,
}) => ({
  schemaVersion: REPOSITORY_PACK_SCHEMA_VERSION,
  ok,
  status,
  tool: REPOSITORY_PACK_TOOL_NAME,
  invocation: REPOSITORY_PACK_INVOCATION,
  artifactPath,
  artifactSha256,
  sourceSetSha256,
  gitRevision,
  counts,
  bounds,
  omissions,
  reused,
  networkCalls: 0,
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  error,
});

const assertActive = (context) => {
  if (context.signal?.aborted) throw new RepositoryPackError("PACK_ABORTED");
  if (context.now() >= context.deadlineAt) throw new RepositoryPackError("RUNTIME_LIMIT_EXCEEDED");
};
const remainingRuntime = (context) => {
  assertActive(context);
  return Math.max(1, context.deadlineAt - context.now());
};

const canonicalRelativePath = (value, { allowDot = false, errorCode = "INVALID_ARGUMENTS" } = {}) => {
  if (typeof value !== "string") throw new RepositoryPackError(errorCode);
  if (value === ".") {
    if (allowDot) return ".";
    throw new RepositoryPackError(errorCode);
  }
  if (
    value.length === 0
    || Buffer.byteLength(value, "utf8") > REPOSITORY_PACK_HARD_BOUNDS.maxPathBytes
    || path.posix.isAbsolute(value)
    || value.includes("\\")
    || /^[a-z][a-z0-9+.-]*:/iu.test(value)
    || Array.from(value).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  ) {
    throw new RepositoryPackError(errorCode);
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..") || parts[0] === ".git") {
    throw new RepositoryPackError(errorCode);
  }
  return parts.join("/");
};

const normalizeRequest = (args) => {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new RepositoryPackError("INVALID_ARGUMENTS");
  if (Object.keys(args).some((key) => !ALLOWED_ARGUMENTS.has(key))) throw new RepositoryPackError("INVALID_ARGUMENTS");
  const repositoryPath = canonicalRelativePath(args.repositoryPath ?? ".", { allowDot: true });
  const outputDirectory = canonicalRelativePath(
    args.outputDirectory ?? REPOSITORY_PACK_DEFAULT_REQUEST.outputDirectory,
  );
  const policyList = (key) => {
    const value = args[key] ?? [];
    if (!Array.isArray(value) || value.length > REPOSITORY_PACK_HARD_BOUNDS.maxPolicyPaths) {
      throw new RepositoryPackError("INVALID_ARGUMENTS");
    }
    const normalized = value.map((entry) => canonicalRelativePath(entry));
    if (new Set(normalized).size !== normalized.length) throw new RepositoryPackError("INVALID_ARGUMENTS");
    return byteSort(normalized);
  };
  const bound = (key, hard) => {
    const value = args[key] ?? REPOSITORY_PACK_DEFAULT_REQUEST[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > hard) {
      throw new RepositoryPackError("INVALID_ARGUMENTS");
    }
    return value;
  };
  return {
    repositoryPath,
    outputDirectory,
    includePaths: policyList("includePaths"),
    excludePaths: policyList("excludePaths"),
    maxFiles: bound("maxFiles", REPOSITORY_PACK_HARD_BOUNDS.maxFiles),
    maxFileBytes: bound("maxFileBytes", REPOSITORY_PACK_HARD_BOUNDS.maxFileBytes),
    maxTotalBytes: bound("maxTotalBytes", REPOSITORY_PACK_HARD_BOUNDS.maxTotalBytes),
  };
};

const assertNoSymlinkComponents = async (
  root,
  relativePath,
  includeFinal = false,
  allowMissing = false,
) => {
  if (relativePath === ".") return true;
  const parts = relativePath.split("/");
  let cursor = root;
  const checked = includeFinal ? parts : parts.slice(0, -1);
  for (const part of checked) {
    cursor = path.join(cursor, part);
    let stat;
    try {
      stat = await fs.lstat(cursor);
    } catch (error) {
      if (allowMissing && error?.code === "ENOENT") return false;
      throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
  }
  return true;
};

const resolveRepository = async (requestedRoot, repositoryPath, git) => {
  let hostRoot;
  try {
    hostRoot = await fs.realpath(path.resolve(requestedRoot));
    if (!(await fs.stat(hostRoot)).isDirectory()) throw new Error("not-directory");
  } catch {
    throw new RepositoryPackError("NOT_GIT_WORKTREE");
  }
  await assertNoSymlinkComponents(hostRoot, repositoryPath, true);
  const lexical = repositoryPath === "." ? hostRoot : path.resolve(hostRoot, ...repositoryPath.split("/"));
  if (!isInside(hostRoot, lexical, true)) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
  let repositoryRoot;
  try {
    repositoryRoot = await fs.realpath(lexical);
  } catch {
    throw new RepositoryPackError("NOT_GIT_WORKTREE");
  }
  const reportedRaw = (await git.run(repositoryRoot, ["rev-parse", "--show-toplevel"], "NOT_GIT_WORKTREE")).stdout;
  const reported = (Buffer.isBuffer(reportedRaw) ? reportedRaw : Buffer.from(reportedRaw || ""))
    .toString("utf8").replace(/\r?\n$/u, "");
  let canonicalReported;
  try {
    canonicalReported = await fs.realpath(reported);
  } catch {
    throw new RepositoryPackError("NOT_GIT_WORKTREE");
  }
  if (canonicalReported !== repositoryRoot) throw new RepositoryPackError("ROOT_SCOPE_MISMATCH");
  const rootStat = statIdentity(await fs.lstat(repositoryRoot));
  return { repositoryRoot, rootStat };
};

const prefixMatches = (relativePath, prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`);
const applyPolicy = (paths, request) => {
  const inventory = paths.filter((entry) => (
    !prefixMatches(entry, request.outputDirectory)
    && !prefixMatches(request.outputDirectory, entry)
  ));
  const selected = inventory.filter((entry) => (
    (request.includePaths.length === 0 || request.includePaths.some((prefix) => prefixMatches(entry, prefix)))
    && !request.excludePaths.some((prefix) => prefixMatches(entry, prefix))
  ));
  return { inventory, selected, policyExcluded: inventory.length - selected.length };
};

const isSensitivePath = (relativePath) => {
  const parts = relativePath.toLowerCase().split("/");
  const basename = parts.at(-1);
  if (basename === ".env" || (/^\.env\./u.test(basename) && !/\.(?:example|sample|template)$/u.test(basename))) return true;
  if ([".netrc", ".npmrc", ".pypirc", "credentials.json", "service-account.json"].includes(basename)) return true;
  if (/\.(?:pem|p12|pfx)$/u.test(basename) || /^id_(?:rsa|dsa|ecdsa|ed25519)$/u.test(basename)) return true;
  return parts.includes(".ssh") && basename !== "config";
};

const isObviousSyntheticCredential = (value) => {
  if (/(?:example|placeholder|dummy|fake|test|redacted|x{4,})/iu.test(value)) return true;
  const core = value.replace(/^(?:github_pat_|gh[pousr]_|sk-(?:proj-)?)/u, "");
  for (let width = 4; width <= Math.min(32, Math.floor(core.length / 2)); width += 1) {
    if (core.slice(-width) === core.slice(-2 * width, -width)) return true;
  }
  return false;
};

const hasHighConfidenceCredential = (buffer) => {
  const text = buffer.toString("utf8");
  if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/u.test(text)) return true;
  if (/\bAKIA[0-9A-Z]{16}\b/u.test(text)) return true;
  for (const [value] of text.matchAll(
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,})\b/gu,
  )) {
    if (!isObviousSyntheticCredential(value)) return true;
  }
  const quotedAssignments = text.matchAll(
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)\b[ \t]*[:=][ \t]*(["'])([A-Za-z0-9+/_=-]{20,})\1/giu,
  );
  for (const [, , value] of quotedAssignments) {
    if (!isObviousSyntheticCredential(value)) return true;
  }
  const unquotedAssignments = text.matchAll(
    /^\s*(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)[ \t]*[:=][ \t]*([A-Za-z0-9+/_=-]{20,})[ \t]*(?:#.*)?$/gimu,
  );
  for (const [, value] of unquotedAssignments) {
    if (!isObviousSyntheticCredential(value)) return true;
  }
  return false;
};

const readHandleBounded = async (handle, maximum, context) => {
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    assertActive(context);
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maximum + 1 - total));
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    chunks.push(chunk.subarray(0, bytesRead));
    total += bytesRead;
  }
  throw new RepositoryPackError("FILE_LIMIT_EXCEEDED");
};

const isBinaryContent = (buffer) => {
  if (buffer.includes(0)) return true;
  const decoded = buffer.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(buffer)) return true;
  let controls = 0;
  for (const byte of buffer) {
    if (byte < 32 && ![9, 10, 12, 13].includes(byte)) controls += 1;
  }
  return buffer.length > 0 && controls / buffer.length > 0.01;
};

const inspectPath = async (root, relativePath, bounds, context, gitIndex = []) => {
  assertActive(context);
  if (isSensitivePath(relativePath)) throw new RepositoryPackError("SENSITIVE_CONTENT");
  const isGitlink = gitIndex.some((entry) => entry.mode === "160000");
  const ancestorsPresent = await assertNoSymlinkComponents(root, relativePath, false, isGitlink);
  const lexical = path.resolve(root, ...relativePath.split("/"));
  if (!isInside(root, lexical)) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
  const gitIndexIdentity = JSON.stringify(gitIndex);
  const base = { path: relativePath, gitIndexIdentity };
  if (isGitlink && !ancestorsPresent) {
    return { ...base, state: "submodule-omitted", reason: "submodule", sizeBytes: 0, sha256: "", snapshot: null };
  }
  let before;
  try {
    before = await fs.lstat(lexical);
  } catch (error) {
    if (isGitlink && error?.code === "ENOENT") {
      return { ...base, state: "submodule-omitted", reason: "submodule", sizeBytes: 0, sha256: "", snapshot: null };
    }
    throw new RepositoryPackError("SOURCE_CHANGED");
  }
  const snapshot = statIdentity(before);
  if (isGitlink) {
    let resolved;
    try {
      resolved = await fs.realpath(lexical);
    } catch {
      throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    }
    if (!isInside(root, resolved)) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    return { ...base, state: "submodule-omitted", reason: "submodule", sizeBytes: before.size, sha256: "", snapshot };
  }
  if (before.isSymbolicLink()) {
    let target;
    try {
      target = await fs.realpath(lexical);
    } catch {
      throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    }
    if (!isInside(root, target)) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    return { ...base, state: "symlink-omitted", reason: "symlink", sizeBytes: before.size, sha256: "", snapshot };
  }
  if (before.isDirectory()) {
    return { ...base, state: "submodule-omitted", reason: "submodule", sizeBytes: before.size, sha256: "", snapshot };
  }
  if (!before.isFile()) {
    return { ...base, state: "non-regular-omitted", reason: "non-regular", sizeBytes: before.size, sha256: "", snapshot };
  }
  if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > bounds.maxFileBytes) {
    throw new RepositoryPackError("FILE_LIMIT_EXCEEDED");
  }
  let handle;
  try {
    handle = await fs.open(lexical, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || !sameIdentity(snapshot, statIdentity(opened))) throw new RepositoryPackError("SOURCE_CHANGED");
    const content = await readHandleBounded(handle, bounds.maxFileBytes, context);
    if (!sameIdentity(snapshot, statIdentity(await handle.stat())) || content.length !== before.size) {
      throw new RepositoryPackError("SOURCE_CHANGED");
    }
    const resolved = await fs.realpath(lexical);
    if (!isInside(root, resolved)) throw new RepositoryPackError("SOURCE_PATH_UNSAFE");
    const digest = sha256(content);
    if (isBinaryContent(content)) {
      return { ...base, state: "binary-omitted", reason: "binary", sizeBytes: content.length, sha256: digest, snapshot };
    }
    if (hasHighConfidenceCredential(content)) throw new RepositoryPackError("SENSITIVE_CONTENT");
    return { ...base, state: "embedded", reason: "", sizeBytes: content.length, sha256: digest, content, snapshot };
  } catch (error) {
    if (error instanceof RepositoryPackError) throw error;
    throw new RepositoryPackError("SOURCE_CHANGED");
  } finally {
    await handle?.close().catch(() => undefined);
  }
};

const assertRootIdentity = async (root, rootStat) => {
  try {
    const currentRoot = await fs.lstat(root);
    if (!sameNode(rootStat, statIdentity(currentRoot)) || await fs.realpath(root) !== root) {
      throw new RepositoryPackError("SOURCE_CHANGED");
    }
  } catch (error) {
    if (error instanceof RepositoryPackError) throw error;
    throw new RepositoryPackError("SOURCE_CHANGED");
  }
};

const revalidateEntries = async (root, rootStat, entries, bounds, context, gitIndex) => {
  await assertRootIdentity(root, rootStat);
  for (const expected of entries) {
    const current = await inspectPath(root, expected.path, bounds, context, gitIndex.get(expected.path) || []);
    const sameSnapshot = current.snapshot === null || expected.snapshot === null
      ? current.snapshot === expected.snapshot
      : sameIdentity(current.snapshot, expected.snapshot);
    if (
      current.state !== expected.state
      || current.sizeBytes !== expected.sizeBytes
      || current.sha256 !== expected.sha256
      || current.gitIndexIdentity !== expected.gitIndexIdentity
      || !sameSnapshot
    ) {
      throw new RepositoryPackError("SOURCE_CHANGED");
    }
  }
};

const summarizeEntries = ({ inventoryCount, policyExcluded, entries, outputBytes = 0 }) => {
  const omissions = {
    policyExcluded,
    binary: entries.filter((entry) => entry.state === "binary-omitted").length,
    symlink: entries.filter((entry) => entry.state === "symlink-omitted").length,
    submodule: entries.filter((entry) => entry.state === "submodule-omitted").length,
    nonRegular: entries.filter((entry) => entry.state === "non-regular-omitted").length,
  };
  const embedded = entries.filter((entry) => entry.state === "embedded");
  const counts = {
    discoveredFiles: inventoryCount,
    embeddedFiles: embedded.length,
    binaryFiles: omissions.binary,
    omittedFiles: Object.values(omissions).reduce((sum, count) => sum + count, 0),
    fileCount: entries.length,
    sourceBytes: embedded.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    outputBytes,
  };
  return { counts, omissions };
};

export const runRepositoryPackTool = async (args = {}, options = {}) => {
  let request = { ...REPOSITORY_PACK_DEFAULT_REQUEST, includePaths: [], excludePaths: [] };
  let bounds = buildBounds(request, {});
  let counts = emptyCounts();
  let omissions = emptyOmissions();
  let gitRevision = "unavailable";
  try {
    request = normalizeRequest(args);
    bounds = buildBounds(request, options);
    const now = options.now || Date.now;
    const context = {
      signal: options.signal,
      now,
      deadlineAt: now() + bounds.maxRuntimeMs,
    };
    const git = createRepositoryPackGit({
      execFileImpl: options.execFileImpl || execFileAsync,
      hostEnvironment: options.env || process.env,
      remainingRuntime: () => remainingRuntime(context),
      assertActive: () => assertActive(context),
      canonicalRelativePath: (value) => canonicalRelativePath(value, { errorCode: "SOURCE_PATH_UNSAFE" }),
    });
    assertActive(context);
    const { repositoryRoot, rootStat } = await resolveRepository(options.rootDir || process.cwd(), request.repositoryPath, git);
    gitRevision = await git.readRevision(repositoryRoot);
    const discovered = await git.readInventory(repositoryRoot);
    const policy = applyPolicy(discovered.paths, request);
    counts.discoveredFiles = policy.inventory.length;
    omissions.policyExcluded = policy.policyExcluded;
    if (policy.selected.length > bounds.maxFiles) throw new RepositoryPackError("INVENTORY_LIMIT_EXCEEDED");
    const entries = [];
    let sourceBytes = 0;
    for (const relativePath of policy.selected) {
      const entry = await inspectPath(
        repositoryRoot,
        relativePath,
        bounds,
        context,
        discovered.index.get(relativePath) || [],
      );
      if (entry.state === "embedded") {
        sourceBytes += entry.sizeBytes;
        if (sourceBytes > bounds.maxTotalBytes) throw new RepositoryPackError("SOURCE_TOTAL_LIMIT_EXCEEDED");
      }
      entries.push(entry);
    }
    ({ counts, omissions } = summarizeEntries({
      inventoryCount: policy.inventory.length,
      policyExcluded: policy.policyExcluded,
      entries,
    }));
    const sourceSetSha256 = digestRepositoryPackSource(entries);
    const built = buildRepositoryPackMarkdown({
      entries,
      sourceSetSha256,
      gitRevision,
      request,
      counts,
      bounds,
      omissions,
    });
    counts.outputBytes = built.outputBytes;
    if (built.outputBytes > bounds.maxOutputBytes) throw new RepositoryPackError("OUTPUT_LIMIT_EXCEEDED");
    const successResult = (reused) => resultEnvelope({
      ok: true,
      status: "completed",
      artifactPath: `${request.outputDirectory}/${built.sha256}.md`,
      artifactSha256: built.sha256,
      sourceSetSha256,
      gitRevision,
      counts,
      bounds,
      omissions,
      reused,
    });
    if ([false, true].some((reused) => (
      Buffer.byteLength(JSON.stringify(successResult(reused))) > bounds.maxResponseBytes
    ))) throw new RepositoryPackError("PACK_FAILED");
    assertActive(context);
    const outputDir = await ensureRepositoryPackOutputDirectory(repositoryRoot, request.outputDirectory);
    const revalidate = async () => {
      await assertRootIdentity(repositoryRoot, rootStat);
      if (await git.readRevision(repositoryRoot) !== gitRevision) {
        throw new RepositoryPackError("SOURCE_CHANGED");
      }
      const rediscovered = await git.readInventory(repositoryRoot);
      const refreshed = applyPolicy(rediscovered.paths, request);
      if (
        !sameList(refreshed.inventory, policy.inventory)
        || !sameList(refreshed.selected, policy.selected)
        || !sameRepositoryPackGitIndex(discovered.index, rediscovered.index, policy.inventory)
      ) throw new RepositoryPackError("SOURCE_CHANGED");
      await revalidateEntries(repositoryRoot, rootStat, entries, bounds, context, rediscovered.index);
    };
    await options.hooks?.beforeSourceRevalidation?.({ root: repositoryRoot, entries });
    const published = await publishRepositoryPackArtifact({
      root: repositoryRoot,
      outputDir,
      outputDirectory: request.outputDirectory,
      artifact: built.buffer,
      artifactSha256: built.sha256,
      revalidate,
      assertActive: () => assertActive(context),
      remainingRuntime: () => remainingRuntime(context),
      hooks: options.hooks,
    });
    return successResult(published.reused);
  } catch (error) {
    const failure = error instanceof RepositoryPackError ? error : new RepositoryPackError("PACK_FAILED");
    return resultEnvelope({
      ok: false,
      status: "blocked",
      gitRevision,
      counts,
      bounds,
      omissions,
      error: { code: failure.code, message: failure.message },
    });
  }
};
