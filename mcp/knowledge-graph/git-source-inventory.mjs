import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify, TextDecoder } from "node:util";

import {
  checkKnowledgeGraphBudget,
  KnowledgeGraphError,
  normalizeRelativePath,
  remainingKnowledgeGraphDuration,
  sha256,
} from "./contract.mjs";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_LIMIT_BYTES = 128 * 1024 * 1024;
const GIT_RECORD_LIMIT = 500_000;
const GIT_METADATA_POINTER_LIMIT_BYTES = 64 * 1024;
const GIT_CONFIG_LIMIT_BYTES = 4 * 1024 * 1024;
const NULL_DEVICE = process.platform === "win32" ? "NUL" : "/dev/null";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const REGULAR_INDEX_MODES = new Set(["100644", "100755"]);
const SAFE_GIT_ARGUMENTS = Object.freeze([
  "--no-pager",
  "-c", "core.fsmonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", `core.hooksPath=${NULL_DEVICE}`,
  "-c", "protocol.allow=never",
  "-c", "submodule.recurse=false",
  "-c", "fetch.recurseSubmodules=false",
  "-c", "maintenance.auto=false",
]);

function buildGitEnvironment(host = {}) {
  return Object.fromEntries([
    ["PATH", host.PATH || host.Path],
    ["SystemRoot", host.SystemRoot || host.SYSTEMROOT],
    ["ComSpec", host.ComSpec || host.COMSPEC],
    ["PATHEXT", host.PATHEXT],
    ["TMPDIR", host.TMPDIR],
    ["TMP", host.TMP],
    ["TEMP", host.TEMP],
    ["GIT_ATTR_NOSYSTEM", "1"],
    ["GIT_CONFIG_COUNT", "0"],
    ["GIT_CONFIG_NOSYSTEM", "1"],
    ["GIT_CONFIG_GLOBAL", NULL_DEVICE],
    ["GIT_CONFIG_SYSTEM", NULL_DEVICE],
    ["GIT_TERMINAL_PROMPT", "0"],
    ["GIT_OPTIONAL_LOCKS", "0"],
    ["GIT_LFS_SKIP_SMUDGE", "1"],
    ["GCM_INTERACTIVE", "Never"],
    ["LC_ALL", "C"],
    ["LANG", "C"],
  ].filter(([, value]) => typeof value === "string"));
}

function decodeUtf8(bytes, code = "repository_inventory_path_unsafe") {
  try {
    const decoded = UTF8_DECODER.decode(bytes);
    if (!Buffer.from(decoded, "utf8").equals(bytes)) throw new Error("roundtrip");
    return decoded;
  } catch {
    throw new KnowledgeGraphError(code, "Repository inventory contains a non-UTF-8 path.", {
      complete: false,
    });
  }
}

function nulRecords(stdout) {
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || "");
  if (bytes.length > GIT_OUTPUT_LIMIT_BYTES || (bytes.length && bytes.at(-1) !== 0)) {
    throw new KnowledgeGraphError(
      "repository_inventory_invalid",
      "Repository inventory output is truncated or exceeds its byte bound.",
      { complete: false, maxInventoryBytes: GIT_OUTPUT_LIMIT_BYTES },
    );
  }
  const records = [];
  let offset = 0;
  while (offset < bytes.length) {
    const end = bytes.indexOf(0, offset);
    if (end < 0) {
      throw new KnowledgeGraphError("repository_inventory_invalid", "Repository inventory is not NUL-terminated.", {
        complete: false,
      });
    }
    records.push(bytes.subarray(offset, end));
    if (records.length > GIT_RECORD_LIMIT) {
      throw new KnowledgeGraphError(
        "repository_inventory_record_limit",
        "Repository inventory exceeds its record bound.",
        { complete: false, maxInventoryRecords: GIT_RECORD_LIMIT },
      );
    }
    offset = end + 1;
  }
  return records;
}

function canonicalInventoryPath(bytes) {
  const decoded = decodeUtf8(bytes);
  const normalized = normalizeRelativePath(decoded);
  if (decoded !== normalized) {
    throw new KnowledgeGraphError(
      "repository_inventory_path_unsafe",
      "Repository inventory contains a non-canonical path.",
      { complete: false },
    );
  }
  return normalized;
}

function addDirectoryAncestors(directories, relativePath) {
  let cursor = relativePath.lastIndexOf("/");
  while (cursor > 0) {
    directories.add(relativePath.slice(0, cursor));
    cursor = relativePath.lastIndexOf("/", cursor - 1);
  }
}

function parseTrackedInventory(stdout) {
  const files = new Set();
  const directories = new Set();
  const gitlinks = new Set();
  const symlinks = new Set();
  for (const record of nulRecords(stdout)) {
    const tab = record.indexOf(9);
    const header = tab > 0 ? record.subarray(0, tab).toString("ascii") : "";
    const match = /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])$/u.exec(header);
    if (!match || Number(match[3]) !== 0) {
      throw new KnowledgeGraphError(
        "repository_inventory_unmerged",
        "Repository index contains an invalid or unmerged tracked entry.",
        { complete: false },
      );
    }
    const relativePath = canonicalInventoryPath(record.subarray(tab + 1));
    if (REGULAR_INDEX_MODES.has(match[1])) {
      files.add(relativePath);
      addDirectoryAncestors(directories, relativePath);
    } else if (match[1] === "120000") symlinks.add(relativePath);
    else if (match[1] === "160000") {
      gitlinks.add(relativePath);
      directories.add(relativePath);
      addDirectoryAncestors(directories, relativePath);
    } else {
      throw new KnowledgeGraphError(
        "repository_inventory_invalid",
        `Repository index contains unsupported mode ${match[1]}.`,
        { complete: false, sourcePath: relativePath },
      );
    }
  }
  return { directories, files, gitlinks, symlinks };
}

function parseUntrackedInventory(stdout) {
  const files = new Set();
  const directories = new Set();
  for (const record of nulRecords(stdout)) {
    const directory = record.length > 0 && record.at(-1) === 47;
    const pathBytes = directory ? record.subarray(0, -1) : record;
    const relativePath = canonicalInventoryPath(pathBytes);
    if (directory) directories.add(relativePath);
    else files.add(relativePath);
    addDirectoryAncestors(directories, relativePath);
  }
  return { directories, files };
}

async function readMetadataStat(targetPath, repositoryPath) {
  try {
    return await fs.stat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new KnowledgeGraphError(
      "repository_marker_unreadable",
      `Could not inspect repository metadata for ${repositoryPath}.`,
      { causeCode: String(error?.code || "marker_read_failed"), complete: false, repositoryPath },
    );
  }
}

async function readMetadataLstat(targetPath, repositoryPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    throw new KnowledgeGraphError(
      "repository_marker_unreadable",
      `Could not revalidate repository metadata for ${repositoryPath}.`,
      { causeCode: String(error?.code || "marker_read_failed"), complete: false, repositoryPath },
    );
  }
}

async function readOptionalMetadataText(
  targetPath,
  repositoryPath,
  maxBytes = GIT_METADATA_POINTER_LIMIT_BYTES,
) {
  let metadata;
  try {
    metadata = await fs.lstat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new KnowledgeGraphError(
      "repository_marker_unreadable",
      `Could not inspect repository ownership metadata for ${repositoryPath}.`,
      { causeCode: String(error?.code || "marker_read_failed"), complete: false, repositoryPath },
    );
  }
  if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > maxBytes) {
    throw new KnowledgeGraphError(
      "repository_marker_invalid",
      `Repository ownership metadata is not a bounded regular file for ${repositoryPath}.`,
      { complete: false, maxMetadataBytes: maxBytes, repositoryPath },
    );
  }
  return readStableMarkerFile(targetPath, metadata, repositoryPath, maxBytes);
}

function parseCoreWorktree(configText) {
  let inCore = false;
  for (const line of String(configText || "").split(/\r?\n/u)) {
    const section = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
    if (section) {
      inCore = section[1].trim().toLowerCase() === "core";
      continue;
    }
    if (!inCore) continue;
    const entry = /^\s*worktree\s*=\s*(.*?)\s*$/iu.exec(line);
    if (!entry) continue;
    const value = entry[1];
    return value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1).replace(/\\"/gu, '"').replace(/\\\\/gu, "\\")
      : value;
  }
  return "";
}

async function markerOwnsWorktree({
  commonDirectory,
  gitDirectory,
  markerPath,
  repositoryPath,
  repositoryRootPath,
}) {
  const backPointer = await readOptionalMetadataText(
    path.join(gitDirectory, "gitdir"),
    repositoryPath,
  );
  if (backPointer) {
    const reportedMarker = path.resolve(gitDirectory, backPointer.trim());
    if (reportedMarker === markerPath) return true;
  }
  const configText = await readOptionalMetadataText(
    path.join(commonDirectory, "config"),
    repositoryPath,
    GIT_CONFIG_LIMIT_BYTES,
  );
  const configuredWorktree = parseCoreWorktree(configText);
  if (!configuredWorktree) return false;
  const reportedWorktree = path.resolve(gitDirectory, configuredWorktree);
  const [candidateReal, reportedReal] = await Promise.all([
    fs.realpath(repositoryRootPath),
    fs.realpath(reportedWorktree).catch(() => null),
  ]);
  return Boolean(reportedReal && reportedReal === candidateReal);
}

async function readStableMarkerFile(
  markerPath,
  expectedStat,
  repositoryPath,
  maxBytes = GIT_METADATA_POINTER_LIMIT_BYTES,
) {
  let handle;
  try {
    handle = await fs.open(
      markerPath,
      fsConstants.O_RDONLY | Number(fsConstants.O_NOFOLLOW || 0),
    );
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== expectedStat.dev || opened.ino !== expectedStat.ino
      || opened.size !== expectedStat.size || opened.mtimeMs !== expectedStat.mtimeMs) {
      throw new KnowledgeGraphError(
        "repository_marker_unstable",
        `Repository marker changed during discovery for ${repositoryPath}.`,
        { complete: false, repositoryPath },
      );
    }
    if (opened.size > maxBytes) {
      throw new KnowledgeGraphError(
        "repository_marker_invalid",
        `Repository metadata exceeds its byte bound for ${repositoryPath}.`,
        { complete: false, maxMetadataBytes: maxBytes, repositoryPath },
      );
    }
    const bounded = Buffer.alloc(maxBytes + 1);
    let byteLength = 0;
    while (byteLength < bounded.length) {
      const { bytesRead } = await handle.read(
        bounded,
        byteLength,
        bounded.length - byteLength,
        null,
      );
      if (!bytesRead) break;
      byteLength += bytesRead;
    }
    if (byteLength > maxBytes) {
      throw new KnowledgeGraphError(
        "repository_marker_invalid",
        `Repository metadata exceeds its byte bound for ${repositoryPath}.`,
        { complete: false, maxMetadataBytes: maxBytes, repositoryPath },
      );
    }
    const bytes = bounded.subarray(0, byteLength);
    const closed = await handle.stat();
    if (closed.dev !== opened.dev || closed.ino !== opened.ino
      || closed.size !== opened.size || closed.mtimeMs !== opened.mtimeMs) {
      throw new KnowledgeGraphError(
        "repository_marker_unstable",
        `Repository marker changed during discovery for ${repositoryPath}.`,
        { complete: false, repositoryPath },
      );
    }
    try {
      return UTF8_DECODER.decode(bytes);
    } catch {
      throw new KnowledgeGraphError(
        "repository_marker_invalid",
        `Repository marker is not valid UTF-8 for ${repositoryPath}.`,
        { complete: false, repositoryPath },
      );
    }
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError(
      "repository_marker_unreadable",
      `Could not read the repository marker for ${repositoryPath}.`,
      { causeCode: String(error?.code || "marker_read_failed"), complete: false, repositoryPath },
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function markerLooksLikeRepository(repositoryRootPath, repositoryPath) {
  const markerPath = path.join(repositoryRootPath, ".git");
  let marker;
  try {
    marker = await fs.lstat(markerPath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new KnowledgeGraphError(
      "repository_marker_unreadable",
      `Could not inspect the repository marker for ${repositoryPath}.`,
      { causeCode: String(error?.code || "marker_read_failed"), complete: false, repositoryPath },
    );
  }
  if (marker.isSymbolicLink()) return false;
  if (marker.isDirectory()) {
    const [head, config, objects, closed] = await Promise.all([
      readMetadataStat(path.join(markerPath, "HEAD"), repositoryPath),
      readMetadataStat(path.join(markerPath, "config"), repositoryPath),
      readMetadataStat(path.join(markerPath, "objects"), repositoryPath),
      readMetadataLstat(markerPath, repositoryPath),
    ]);
    if (closed.isSymbolicLink() || !closed.isDirectory()
      || closed.dev !== marker.dev || closed.ino !== marker.ino) {
      throw new KnowledgeGraphError(
        "repository_marker_unstable",
        `Repository marker changed during discovery for ${repositoryPath}.`,
        { complete: false, repositoryPath },
      );
    }
    return Boolean(head?.isFile() && config?.isFile() && objects?.isDirectory());
  }
  if (!marker.isFile()) return false;
  if (marker.size > GIT_METADATA_POINTER_LIMIT_BYTES) {
    throw new KnowledgeGraphError(
      "repository_marker_invalid",
      `Repository marker exceeds its byte bound for ${repositoryPath}.`,
      { complete: false, repositoryPath },
    );
  }
  const markerText = await readStableMarkerFile(markerPath, marker, repositoryPath);
  const match = /^gitdir:\s*(.+)\s*$/iu.exec(markerText);
  if (!match) return false;
  const gitDirectory = path.resolve(repositoryRootPath, match[1]);
  const [directory, head] = await Promise.all([
    readMetadataStat(gitDirectory, repositoryPath),
    readMetadataStat(path.join(gitDirectory, "HEAD"), repositoryPath),
  ]);
  if (!directory?.isDirectory() || !head?.isFile()) return false;
  let commonDirectory = gitDirectory;
  const common = await readOptionalMetadataText(
    path.join(gitDirectory, "commondir"),
    repositoryPath,
  );
  if (common !== null) {
    commonDirectory = path.resolve(gitDirectory, common.trim());
  }
  const [config, objects] = await Promise.all([
    readMetadataStat(path.join(commonDirectory, "config"), repositoryPath),
    readMetadataStat(path.join(commonDirectory, "objects"), repositoryPath),
  ]);
  if (!config?.isFile() || !objects?.isDirectory()) return false;
  return markerOwnsWorktree({
    commonDirectory,
    gitDirectory,
    markerPath,
    repositoryPath,
    repositoryRootPath,
  });
}

async function runGit(repositoryRootPath, args, options = {}) {
  checkKnowledgeGraphBudget({ ...options, stage: "source-discovery-repository-inventory" });
  try {
    const result = await execFileAsync("git", [
      ...SAFE_GIT_ARGUMENTS,
      "-C",
      repositoryRootPath,
      ...args,
    ], {
      encoding: "buffer",
      env: buildGitEnvironment(process.env),
      maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
      signal: options.abortSignal,
      timeout: Math.max(1, remainingKnowledgeGraphDuration(options.deadline)),
      windowsHide: true,
    });
    checkKnowledgeGraphBudget({ ...options, stage: "source-discovery-repository-inventory" });
    return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || "");
  } catch (error) {
    checkKnowledgeGraphBudget({ ...options, stage: "source-discovery-repository-inventory" });
    throw new KnowledgeGraphError(
      "repository_inventory_failed",
      `Could not read the repository source inventory for ${options.repositoryPath || "."}.`,
      {
        causeCode: String(error?.code || "git_inventory_failed"),
        complete: false,
        repositoryPath: options.repositoryPath || ".",
      },
    );
  }
}

async function verifyRepositoryRoot(repositoryRootPath, options) {
  const topLevelBytes = await runGit(repositoryRootPath, ["rev-parse", "--show-toplevel"], options);
  const topLevel = decodeUtf8(topLevelBytes).replace(/\r?\n$/u, "");
  const [candidateReal, reportedReal] = await Promise.all([
    fs.realpath(repositoryRootPath),
    fs.realpath(topLevel).catch(() => null),
  ]);
  if (!reportedReal || candidateReal !== reportedReal) {
    throw new KnowledgeGraphError(
      "repository_inventory_scope_mismatch",
      `Repository inventory escaped its declared root for ${options.repositoryPath || "."}.`,
      { complete: false, repositoryPath: options.repositoryPath || "." },
    );
  }
}

export async function readGitSourceInventory(repositoryRootPath, options = {}) {
  if (!await markerLooksLikeRepository(repositoryRootPath, options.repositoryPath || ".")) return null;
  await verifyRepositoryRoot(repositoryRootPath, options);
  const [trackedBytes, untrackedBytes] = await Promise.all([
    runGit(repositoryRootPath, ["ls-files", "--stage", "-z"], options),
    runGit(repositoryRootPath, [
      "ls-files",
      "--others",
      ...(options.respectGitignore === false ? [] : ["--exclude-per-directory=.gitignore"]),
      "-z",
    ], options),
  ]);
  const tracked = parseTrackedInventory(trackedBytes);
  const untracked = parseUntrackedInventory(untrackedBytes);
  return {
    digest: sha256(Buffer.concat([trackedBytes, Buffer.from([0xff]), untrackedBytes])),
    directories: new Set([...tracked.directories, ...untracked.directories]),
    trackedDirectories: tracked.directories,
    trackedFiles: tracked.files,
    trackedGitlinks: tracked.gitlinks,
    trackedSymlinks: tracked.symlinks,
    untrackedFiles: untracked.files,
  };
}

export function collectTrackedSourceOmissions(inventory, repositoryPath = ".") {
  const workspacePath = (relativePath) => (
    repositoryPath === "." ? relativePath : `${repositoryPath}/${relativePath}`
  );
  return [
    ...[...(inventory?.trackedSymlinks || [])].map((relativePath) => ({
      code: "tracked_symlink_omitted",
      kind: "symlink",
      relativePath,
      sourcePath: workspacePath(relativePath),
      message: `Omitted tracked symbolic link ${workspacePath(relativePath)}.`,
    })),
    ...[...(inventory?.trackedGitlinks || [])].map((relativePath) => ({
      code: "tracked_gitlink_omitted",
      kind: "gitlink",
      relativePath,
      sourcePath: workspacePath(relativePath),
      message: `Omitted tracked Git link ${workspacePath(relativePath)}; submodule content is outside this repository inventory.`,
    })),
  ];
}

export function isTrackedGitlink(inventory, relativePath) {
  return Boolean(inventory?.trackedGitlinks?.has(relativePath));
}

export function sameGitSourceInventory(left, right) {
  return Boolean(left && right && left.digest === right.digest);
}
