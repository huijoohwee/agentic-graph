import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  checkKnowledgeGraphBudget,
  compareStableStrings,
  createKnowledgeGraphDeadline,
  KnowledgeGraphError,
  normalizeRelativePath,
  sha256,
} from "./contract.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";

const DEFAULT_EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".knowgrph",
  ".next",
  ".nuxt",
  ".venv",
  "__pycache__",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
]);

const normalizePattern = (value) => String(value || "").trim().replaceAll("\\", "/").replace(/^\.\//, "");

function globPatternToRegExp(patternRaw) {
  let pattern = normalizePattern(patternRaw);
  const directoryOnly = pattern.endsWith("/");
  if (directoryOnly) pattern = pattern.slice(0, -1);
  const anchored = pattern.startsWith("/");
  if (anchored) pattern = pattern.slice(1);
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  const prefix = anchored ? "^" : pattern.includes("/") ? "^(?:.*?/)?" : "^(?:.*?/)?";
  return new RegExp(`${prefix}${source}${directoryOnly ? "(?:/.*)?" : ""}$`);
}

function buildOrderedIgnoreRules(lines) {
  const rules = [];
  for (const raw of lines) {
    const trimmed = String(raw || "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const negated = trimmed.startsWith("!");
    const pattern = negated ? trimmed.slice(1) : trimmed;
    if (!pattern) continue;
    rules.push({ negated, regex: globPatternToRegExp(pattern) });
  }
  return rules;
}

function matchesOrderedRules(relativePath, rules) {
  let ignored = false;
  for (const rule of rules) if (rule.regex.test(relativePath)) ignored = !rule.negated;
  return ignored;
}

function matchesAny(relativePath, patterns) {
  return patterns.some((pattern) => globPatternToRegExp(pattern).test(relativePath));
}

function isDefaultExcluded(relativePath) {
  return relativePath.split("/").some((segment) => DEFAULT_EXCLUDED_SEGMENTS.has(segment));
}

async function readRootGitignore(rootPath, options = {}) {
  try {
    const opened = await readStableSourceFile(
      path.join(rootPath, ".gitignore"),
      rootPath,
      1_000_000,
      ".gitignore",
      options,
    );
    return opened.bytes ? buildOrderedIgnoreRules(opened.bytes.toString("utf8").split(/\r?\n/)) : [];
  } catch (error) {
    if (error instanceof KnowledgeGraphError && ["aborted", "max_duration_exceeded"].includes(error.code)) throw error;
    return [];
  }
}

export function inferKnowledgeSourceKind(relativePath) {
  return SOURCE_PARSER_REGISTRY.match(relativePath)?.kind || "unsupported";
}

function looksBinary(bytes) {
  const limit = Math.min(bytes.length, 8192);
  for (let index = 0; index < limit; index += 1) if (bytes[index] === 0) return true;
  return false;
}

function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;

async function readStableSourceFile(absolutePath, rootPath, maxFileBytes, relativePath, options = {}) {
  const checkBudget = () => checkKnowledgeGraphBudget({
    abortSignal: options.abortSignal,
    deadline: options.deadline,
    stage: options.stage || "source-read",
    details: { sourcePath: relativePath },
  });
  let handle;
  try {
    checkBudget();
    const noFollow = Number(fsConstants.O_NOFOLLOW || 0);
    handle = await fs.open(absolutePath, fsConstants.O_RDONLY | noFollow);
    checkBudget();
    const openedStat = await handle.stat();
    checkBudget();
    if (!openedStat.isFile()) throw new KnowledgeGraphError("source_not_regular_file", `Source is not a regular file: ${relativePath}`);
    const realPath = await fs.realpath(absolutePath);
    checkBudget();
    const pathStat = await fs.stat(realPath);
    checkBudget();
    if (!pathIsInside(realPath, rootPath) || !sameFileIdentity(openedStat, pathStat)) {
      throw new KnowledgeGraphError("source_path_unstable", `Source path changed or escaped during discovery: ${relativePath}`);
    }
    if (openedStat.size > maxFileBytes) return { stat: openedStat, bytes: null };
    const bytes = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < bytes.length) {
      checkBudget();
      const chunk = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!chunk.bytesRead) break;
      offset += chunk.bytesRead;
    }
    checkBudget();
    const extra = Buffer.alloc(1);
    const extraRead = await handle.read(extra, 0, 1, openedStat.size);
    checkBudget();
    const closedStat = await handle.stat();
    checkBudget();
    if (offset !== bytes.length || extraRead.bytesRead || !sameFileIdentity(openedStat, closedStat)
      || openedStat.size !== closedStat.size || openedStat.mtimeMs !== closedStat.mtimeMs) {
      throw new KnowledgeGraphError("source_changed_during_read", `Source changed while it was being read: ${relativePath}`);
    }
    return { stat: openedStat, bytes };
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError("source_read_failed", `Could not safely read source: ${relativePath}`, {
      sourcePath: relativePath,
      causeCode: String(error?.code || "read_failed"),
    });
  } finally {
    await handle?.close().catch(() => {});
  }
}

const repositoryIdentity = (repositoryPath) => ({
  repositoryPath,
  repositoryId: `kg:repo:${sha256(repositoryPath).slice(0, 24)}`,
});

export async function hydrateKnowledgeSource(source, {
  rootPath,
  maxFileBytes = 100_000_000,
  abortSignal,
  deadline,
} = {}) {
  checkKnowledgeGraphBudget({ abortSignal, deadline, stage: "source-hydration" });
  if (!source || source.status !== "ready") return source;
  const opened = await readStableSourceFile(
    source.absolutePath,
    rootPath,
    maxFileBytes,
    source.relativePath,
    { abortSignal, deadline, stage: "source-hydration" },
  );
  if (!opened.bytes || opened.stat.size !== source.byteSize || sha256(opened.bytes) !== source.contentHash) {
    throw new KnowledgeGraphError("source_changed_after_discovery", `Source changed after admission: ${source.relativePath}`, {
      sourcePath: source.relativePath,
    });
  }
  return source.kind === "pdf"
    ? { ...source, bytes: opened.bytes }
    : { ...source, text: opened.bytes.toString("utf8") };
}

export async function resolveRealDirectory(rootPathRaw, options = {}) {
  checkKnowledgeGraphBudget({ ...options, stage: options.stage || "directory-resolution" });
  if (!String(rootPathRaw || "").trim()) throw new KnowledgeGraphError("root_path_required", "rootPath is required.");
  const resolved = path.resolve(String(rootPathRaw));
  let real;
  try {
    real = await fs.realpath(resolved);
  } catch {
    throw new KnowledgeGraphError("root_not_found", `Knowledge graph root does not exist: ${resolved}`);
  }
  checkKnowledgeGraphBudget({ ...options, stage: options.stage || "directory-resolution" });
  const stat = await fs.stat(real);
  checkKnowledgeGraphBudget({ ...options, stage: options.stage || "directory-resolution" });
  if (!stat.isDirectory()) throw new KnowledgeGraphError("root_not_directory", `Knowledge graph root is not a directory: ${resolved}`);
  return real;
}

export async function isPathWithinAllowedRoots(candidatePath, allowedRoots) {
  const candidate = path.resolve(candidatePath);
  for (const rootRaw of allowedRoots || []) {
    const root = await resolveRealDirectory(rootRaw);
    const relative = path.relative(root, candidate);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return true;
  }
  return false;
}

export async function discoverKnowledgeSources(args) {
  const deadline = args.deadline || createKnowledgeGraphDeadline(args.maxDurationMs, { now: args.now });
  const rootPath = await resolveRealDirectory(args.rootPath, {
    abortSignal: args.abortSignal,
    deadline,
    stage: "source-discovery-root",
  });
  const maxFiles = Math.max(1, Math.min(250_000, Number(args.maxFiles || 100_000)));
  const maxFileBytes = Math.max(1, Math.min(100_000_000, Number(args.maxFileBytes || 2_000_000)));
  const maxTotalBytes = Math.max(1, Math.min(4_000_000_000, Number(args.maxTotalBytes || 1_000_000_000)));
  const maxDurationMs = deadline.maxDurationMs;
  const include = Array.isArray(args.include) ? args.include.map(normalizePattern).filter(Boolean) : [];
  const exclude = Array.isArray(args.exclude) ? args.exclude.map(normalizePattern).filter(Boolean) : [];
  const exactExcludedPaths = new Set((args.exactExcludedPaths || []).map(normalizePattern).filter(Boolean));
  const gitignoreRules = args.respectGitignore === false ? [] : await readRootGitignore(rootPath, {
    abortSignal: args.abortSignal,
    deadline,
    stage: "source-discovery-ignore",
  });
  const sources = [];
  const diagnostics = [];
  const repositories = new Map();
  const counts = {
    entriesVisited: 0,
    ignoredEntries: 0,
    filesVisited: 0,
    filesAdmitted: 0,
    filesReady: 0,
    filesSkipped: 0,
    filesUnsupported: 0,
    bytesVisited: 0,
    bytesAdmitted: 0,
  };

  const checkBudget = () => {
    checkKnowledgeGraphBudget({
      abortSignal: args.abortSignal,
      deadline,
      stage: "source-discovery",
      details: { counts: { ...counts } },
    });
  };

  async function walk(directoryPath, directoryRelative = "", inheritedRepositoryPath = ".") {
    checkBudget();
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => compareStableStrings(left.name, right.name));
    const hasRepositoryMarker = entries.some((entry) => entry.name === ".git" && (
      entry.isDirectory() || entry.isFile()
    ));
    const repositoryPath = hasRepositoryMarker ? (directoryRelative || ".") : inheritedRepositoryPath;
    const repository = repositoryIdentity(repositoryPath);
    repositories.set(repository.repositoryId, repository);
    for (const entry of entries) {
      checkBudget();
      counts.entriesVisited += 1;
      const relativePath = normalizeRelativePath(directoryRelative ? `${directoryRelative}/${entry.name}` : entry.name);
      if (exactExcludedPaths.has(relativePath) || isDefaultExcluded(relativePath) || matchesOrderedRules(relativePath, gitignoreRules) || matchesAny(relativePath, exclude)) {
        counts.ignoredEntries += 1;
        continue;
      }
      const absolutePath = path.join(directoryPath, entry.name);
      if (entry.isSymbolicLink()) {
        counts.ignoredEntries += 1;
        diagnostics.push({ code: "symlink_skipped", sourcePath: relativePath, message: `Skipped symbolic link ${relativePath}.` });
        continue;
      }
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath, repositoryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (include.length && !matchesAny(relativePath, include)) {
        counts.ignoredEntries += 1;
        continue;
      }
      counts.filesVisited += 1;
      if (counts.filesVisited > maxFiles) {
        throw new KnowledgeGraphError("max_files_exceeded", `File count exceeds configured maximum ${maxFiles}.`, {
          maxFiles,
          counts: { ...counts },
          complete: false,
        });
      }
      const opened = await readStableSourceFile(
        absolutePath,
        rootPath,
        maxFileBytes,
        relativePath,
        { abortSignal: args.abortSignal, deadline, stage: "source-discovery-read" },
      );
      const stat = opened.stat;
      counts.bytesVisited += stat.size;
      if (counts.bytesVisited > maxTotalBytes) {
        throw new KnowledgeGraphError("max_total_bytes_exceeded", `Discovered files exceed configured total byte maximum ${maxTotalBytes}.`, {
          maxTotalBytes,
          counts: { ...counts },
          complete: false,
        });
      }
      const kind = inferKnowledgeSourceKind(relativePath);
      const sourceRepository = repositoryIdentity(repositoryPath);
      if (!opened.bytes) {
        const diagnostic = { code: "file_too_large", sourcePath: relativePath, message: `Skipped ${relativePath}; ${stat.size} bytes exceeds ${maxFileBytes}.` };
        diagnostics.push(diagnostic);
        counts.filesAdmitted += 1;
        counts.filesSkipped += 1;
        counts.bytesAdmitted += stat.size;
        sources.push({
          relativePath,
          absolutePath,
          byteSize: stat.size,
          contentHash: sha256(`skipped\0${relativePath}\0${stat.size}`),
          kind,
          status: "skipped",
          ...sourceRepository,
          diagnostics: [diagnostic],
        });
        continue;
      }
      const bytes = opened.bytes;
      const contentHash = sha256(bytes);
      const binary = looksBinary(bytes);
      const isPdf = kind === "pdf";
      if (binary && !isPdf) {
        const diagnostic = { code: "binary_unsupported", sourcePath: relativePath, message: `Recorded binary file ${relativePath} without content extraction.` };
        diagnostics.push(diagnostic);
        counts.filesAdmitted += 1;
        counts.filesUnsupported += 1;
        counts.bytesAdmitted += bytes.length;
        sources.push({
          relativePath,
          absolutePath,
          byteSize: bytes.length,
          contentHash,
          kind: "unsupported",
          status: "unsupported",
          ...sourceRepository,
          diagnostics: [diagnostic],
        });
        continue;
      }
      counts.filesAdmitted += 1;
      counts.bytesAdmitted += bytes.length;
      const unsupportedDiagnostic = kind === "unsupported"
        ? { code: "parser_unsupported", sourcePath: relativePath, message: `No structural parser is registered for ${relativePath}.` }
        : null;
      if (unsupportedDiagnostic) {
        counts.filesUnsupported += 1;
        diagnostics.push(unsupportedDiagnostic);
      } else counts.filesReady += 1;
      sources.push({
        relativePath,
        absolutePath,
        byteSize: bytes.length,
        contentHash,
        kind,
        status: kind === "unsupported" ? "unsupported" : "ready",
        ...sourceRepository,
        ...(args.retainContent === true ? (isPdf ? { bytes } : { text: bytes.toString("utf8") }) : {}),
        diagnostics: unsupportedDiagnostic ? [unsupportedDiagnostic] : [],
      });
    }
  }

  await walk(rootPath);
  checkBudget();
  sources.sort((left, right) => compareStableStrings(left.relativePath, right.relativePath));
  const incompleteSources = sources
    .filter((source) => source.status !== "ready")
    .map((source) => source.relativePath)
    .sort(compareStableStrings);
  const incompleteReasons = [
    ...(counts.filesSkipped ? ["source_skipped"] : []),
    ...(counts.filesUnsupported ? ["source_unsupported"] : []),
  ];
  return {
    rootPath,
    sources,
    repositories: [...repositories.values()].sort((left, right) => compareStableStrings(left.repositoryPath, right.repositoryPath)),
    admission: {
      complete: incompleteSources.length === 0,
      counts,
      limits: { maxFiles, maxFileBytes, maxTotalBytes, maxDurationMs },
      incompleteSources,
      reasons: incompleteReasons,
    },
    diagnostics: [...diagnostics].sort((left, right) => compareStableStrings(`${left.sourcePath}:${left.code}`, `${right.sourcePath}:${right.code}`)),
  };
}
