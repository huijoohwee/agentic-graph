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
import {
  collectTrackedSourceOmissions,
  isTrackedGitlink,
  readGitSourceInventory,
  sameGitSourceInventory,
} from "./git-source-inventory.mjs";
import {
  readStableSourceDirectory,
  readStableSourceFile,
} from "./safe-source-io.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";

const HARD_EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".knowgrph",
  ".knowgrph-workspace",
]);

const SOFT_EXCLUDED_SEGMENTS = new Set([
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

const compilePatterns = (patterns) => patterns.map(globPatternToRegExp);
const matchesAny = (relativePath, patterns) => patterns.some((pattern) => pattern.test(relativePath));
const hasExcludedSegment = (relativePath, segments) => (
  relativePath.split("/").some((segment) => segments.has(segment))
);

async function readGitignorePolicy(repositoryRootPath, rootPath, repositoryPath, options = {}) {
  const relativePath = repositoryPath === "." ? ".gitignore" : `${repositoryPath}/.gitignore`;
  try {
    const opened = await readStableSourceFile(
      path.join(repositoryRootPath, ".gitignore"),
      rootPath,
      1_000_000,
      relativePath,
      options,
    );
    if (!opened.bytes) {
      throw new KnowledgeGraphError(
        "ignore_policy_too_large",
        `Ignore policy exceeds its byte bound: ${relativePath}.`,
        { complete: false, sourcePath: relativePath },
      );
    }
    const text = opened.bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(opened.bytes)) {
      throw new KnowledgeGraphError(
        "ignore_policy_invalid",
        `Ignore policy is not valid UTF-8: ${relativePath}.`,
        { complete: false, sourcePath: relativePath },
      );
    }
    return {
      digest: opened.bytes.length ? sha256(opened.bytes) : sha256(""),
      rules: buildOrderedIgnoreRules(text.split(/\r?\n/)),
    };
  } catch (error) {
    if (error instanceof KnowledgeGraphError && ["aborted", "max_duration_exceeded"].includes(error.code)) throw error;
    if (error instanceof KnowledgeGraphError && error.details?.causeCode === "ENOENT") {
      return { digest: sha256(""), rules: [] };
    }
    if (error instanceof KnowledgeGraphError && error.code.startsWith("ignore_policy_")) throw error;
    throw new KnowledgeGraphError(
      "ignore_policy_unreadable",
      `Could not safely read ignore policy ${relativePath}.`,
      {
        causeCode: String(error?.details?.causeCode || error?.code || "read_failed"),
        complete: false,
        sourcePath: relativePath,
      },
    );
  }
}

function repositoryRelativePath(relativePath, repositoryPath) {
  if (repositoryPath === ".") return relativePath;
  const prefix = `${repositoryPath}/`;
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : relativePath;
}

function isExcludedByRepositoryScope(relativePath, entry, scope) {
  if (!scope) return false;
  const scopedPath = repositoryRelativePath(relativePath, scope.repositoryPath);
  if (entry.isDirectory()) {
    return !scope.inventory.directories.has(scopedPath);
  }
  return !scope.inventory.trackedFiles.has(scopedPath)
    && !scope.inventory.untrackedFiles.has(scopedPath);
}

function isTrackedByRepositoryScope(relativePath, entry, scope) {
  if (!scope) return false;
  const scopedPath = repositoryRelativePath(relativePath, scope.repositoryPath);
  return entry.isDirectory()
    ? scope.inventory.trackedDirectories.has(scopedPath)
    : scope.inventory.trackedFiles.has(scopedPath);
}

export function inferKnowledgeSourceKind(relativePath, parserRegistry = SOURCE_PARSER_REGISTRY) {
  return parserRegistry.match(relativePath)?.kind || "inventory";
}

function looksBinary(bytes) {
  const limit = Math.min(bytes.length, 8192);
  for (let index = 0; index < limit; index += 1) if (bytes[index] === 0) return true;
  return false;
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
  return source.parserAdapter === "pdf" || (
    !source.parserAdapter && source.kind === "pdf"
  )
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
  const parserRegistry = args.parserRegistry || SOURCE_PARSER_REGISTRY;
  if (!parserRegistry?.digest || typeof parserRegistry.match !== "function") {
    throw new KnowledgeGraphError(
      "parser_registry_invalid",
      "Source discovery requires a verified compiled parser registry.",
    );
  }
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
  const include = compilePatterns(
    Array.isArray(args.include) ? args.include.map(normalizePattern).filter(Boolean) : [],
  );
  const exclude = compilePatterns(
    Array.isArray(args.exclude) ? args.exclude.map(normalizePattern).filter(Boolean) : [],
  );
  const exactExcludedPaths = new Set((args.exactExcludedPaths || []).map(normalizePattern).filter(Boolean));
  const respectGitignore = args.respectGitignore !== false;
  const rootRepositoryInventory = await readGitSourceInventory(rootPath, {
    abortSignal: args.abortSignal,
    deadline,
    repositoryPath: ".",
    respectGitignore,
  });
  const workspaceGitignorePolicy = respectGitignore && !rootRepositoryInventory
    ? await readGitignorePolicy(rootPath, rootPath, ".", {
      abortSignal: args.abortSignal,
      deadline,
      stage: "source-discovery-ignore",
    })
    : { digest: sha256(""), rules: [] };
  let workspaceGitignoreApplies = !rootRepositoryInventory;
  const sources = [];
  const diagnostics = [];
  const repositories = new Map();
  const repositoryPolicies = new Map();
  const trackedOmissions = new Map();
  const directorySnapshots = new Map();
  const visitedDirectories = new Set();
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
    trackedSymlinksOmitted: 0,
    trackedGitlinksOmitted: 0,
  };

  const checkBudget = () => {
    checkKnowledgeGraphBudget({
      abortSignal: args.abortSignal,
      deadline,
      stage: "source-discovery",
      details: { counts: { ...counts } },
    });
  };

  const recordTrackedOmissions = (scope) => {
    for (const candidate of collectTrackedSourceOmissions(
      scope.inventory,
      scope.repositoryPath,
    )) {
      const { sourcePath } = candidate;
      if (exactExcludedPaths.has(sourcePath)
        || hasExcludedSegment(sourcePath, HARD_EXCLUDED_SEGMENTS)
        || matchesAny(sourcePath, exclude)
        || (include.length && candidate.kind === "symlink" && !matchesAny(sourcePath, include))) {
        continue;
      }
      const key = `${candidate.code}:${sourcePath}`;
      if (trackedOmissions.has(key)) continue;
      trackedOmissions.set(key, { ...candidate, sourcePath });
      if (candidate.kind === "symlink") counts.trackedSymlinksOmitted += 1;
      else counts.trackedGitlinksOmitted += 1;
      diagnostics.push({ code: candidate.code, sourcePath, message: candidate.message });
    }
  };

  async function walk(
    directoryPath,
    directoryRelative = "",
    inheritedRepositoryPath = ".",
    inheritedRepositoryScope = null,
  ) {
    checkBudget();
    const directorySnapshot = await readStableSourceDirectory(
      directoryPath,
      rootPath,
      directoryRelative,
      { abortSignal: args.abortSignal, deadline },
    );
    if (visitedDirectories.has(directorySnapshot.identity)) {
      throw new KnowledgeGraphError(
        "source_directory_cycle",
        `Source directory was visited more than once: ${directoryRelative || "."}.`,
        { complete: false, sourcePath: directoryRelative || "." },
      );
    }
    visitedDirectories.add(directorySnapshot.identity);
    const entries = directorySnapshot.entries;
    const hasRepositoryMarker = entries.some((entry) => entry.name === ".git" && (
      entry.isDirectory() || entry.isFile()
    ));
    const candidateRepositoryPath = directoryRelative || ".";
    let repositoryScope = inheritedRepositoryScope;
    let repositoryPath = inheritedRepositoryPath;
    if (hasRepositoryMarker || (!directoryRelative && rootRepositoryInventory)) {
      const inventory = !directoryRelative && rootRepositoryInventory
        ? rootRepositoryInventory
        : await readGitSourceInventory(directoryPath, {
          abortSignal: args.abortSignal,
          deadline,
          repositoryPath: candidateRepositoryPath,
          respectGitignore,
        });
      if (inventory) {
        repositoryPath = candidateRepositoryPath;
        repositoryScope = { inventory, repositoryPath, repositoryRootPath: directoryPath };
        repositoryPolicies.set(repositoryPath, repositoryScope);
        recordTrackedOmissions(repositoryScope);
        if (!directoryRelative) workspaceGitignoreApplies = false;
      }
    }
    directorySnapshots.set(directoryRelative || ".", {
      directoryPath,
      enforceListing: !repositoryScope,
      identity: directorySnapshot.identity,
      listingDigest: directorySnapshot.listingDigest,
      relativePath: directoryRelative || ".",
    });
    const repository = repositoryIdentity(repositoryPath);
    repositories.set(repository.repositoryId, repository);
    for (const entry of entries) {
      checkBudget();
      counts.entriesVisited += 1;
      const relativePath = normalizeRelativePath(directoryRelative ? `${directoryRelative}/${entry.name}` : entry.name);
      if (exactExcludedPaths.has(relativePath)
        || hasExcludedSegment(relativePath, HARD_EXCLUDED_SEGMENTS)
        || (hasExcludedSegment(relativePath, SOFT_EXCLUDED_SEGMENTS)
          && !isTrackedByRepositoryScope(relativePath, entry, repositoryScope))
        || (workspaceGitignoreApplies && matchesOrderedRules(relativePath, workspaceGitignorePolicy.rules))
        || matchesAny(relativePath, exclude)
        || isExcludedByRepositoryScope(relativePath, entry, repositoryScope)) {
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
        if (repositoryScope && isTrackedGitlink(
          repositoryScope.inventory,
          repositoryRelativePath(relativePath, repositoryScope.repositoryPath),
        )) {
          counts.ignoredEntries += 1;
          continue;
        }
        await walk(absolutePath, relativePath, repositoryPath, repositoryScope);
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
      const parserDescriptor = parserRegistry.match(relativePath);
      const kind = parserDescriptor?.kind || "inventory";
      const parserRoute = parserDescriptor ? {
        parserAdapter: parserDescriptor.adapter,
        parserDescriptorId: parserDescriptor.id,
        parserFidelity: parserDescriptor.fidelity,
        parserRegistryDigest: parserRegistry.digest,
      } : {
        parserAdapter: "inventory",
        parserDescriptorId: "inventory-fallback",
        parserFidelity: "inventory-only",
        parserRegistryDigest: parserRegistry.digest,
      };
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
          ...parserRoute,
          status: "skipped",
          ...sourceRepository,
          diagnostics: [diagnostic],
        });
        continue;
      }
      const bytes = opened.bytes;
      const contentHash = sha256(bytes);
      const binary = looksBinary(bytes);
      const isPdf = parserDescriptor?.adapter === "pdf";
      const inventoryOnly = !parserDescriptor || parserDescriptor.adapter === "inventory";
      if (binary && !isPdf && !inventoryOnly) {
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
          ...parserRoute,
          status: "unsupported",
          ...sourceRepository,
          diagnostics: [diagnostic],
        });
        continue;
      }
      counts.filesAdmitted += 1;
      counts.bytesAdmitted += bytes.length;
      counts.filesReady += 1;
      sources.push({
        relativePath,
        absolutePath,
        byteSize: bytes.length,
        contentHash,
        kind,
        ...parserRoute,
        status: "ready",
        ...sourceRepository,
        ...(args.retainContent === true ? (isPdf ? { bytes } : { text: bytes.toString("utf8") }) : {}),
        diagnostics: [],
      });
    }
  }

  await walk(rootPath);
  checkBudget();
  sources.sort((left, right) => compareStableStrings(left.relativePath, right.relativePath));
  const incompleteSources = [...new Set([
    ...sources
      .filter((source) => source.status !== "ready")
      .map((source) => source.relativePath),
    ...[...trackedOmissions.values()].map((omission) => omission.sourcePath),
  ])].sort(compareStableStrings);
  const incompleteReasons = [
    ...(counts.filesSkipped ? ["source_skipped"] : []),
    ...(counts.filesUnsupported ? ["source_unsupported"] : []),
    ...(counts.trackedSymlinksOmitted ? ["tracked_symlink_omitted"] : []),
    ...(counts.trackedGitlinksOmitted ? ["tracked_gitlink_omitted"] : []),
  ];
  const revalidateAdmission = async () => {
    checkBudget();
    if (workspaceGitignoreApplies && respectGitignore) {
      const currentPolicy = await readGitignorePolicy(rootPath, rootPath, ".", {
        abortSignal: args.abortSignal,
        deadline,
        stage: "source-discovery-ignore-revalidation",
      });
      if (currentPolicy.digest !== workspaceGitignorePolicy.digest) {
        throw new KnowledgeGraphError(
          "source_admission_changed",
          "Workspace ignore policy changed during ingestion.",
          { complete: false, sourcePath: ".gitignore" },
        );
      }
    }
    for (const scope of repositoryPolicies.values()) {
      const current = await readGitSourceInventory(scope.repositoryRootPath, {
        abortSignal: args.abortSignal,
        deadline,
        repositoryPath: scope.repositoryPath,
        respectGitignore,
      });
      if (!sameGitSourceInventory(scope.inventory, current)) {
        throw new KnowledgeGraphError(
          "source_admission_changed",
          `Repository source inventory changed during ingestion: ${scope.repositoryPath}.`,
          { complete: false, repositoryPath: scope.repositoryPath },
        );
      }
    }
    for (const snapshot of directorySnapshots.values()) {
      const current = await readStableSourceDirectory(
        snapshot.directoryPath,
        rootPath,
        snapshot.relativePath === "." ? "" : snapshot.relativePath,
        { abortSignal: args.abortSignal, deadline },
      );
      if (current.identity !== snapshot.identity
        || (snapshot.enforceListing && current.listingDigest !== snapshot.listingDigest)) {
        throw new KnowledgeGraphError(
          "source_admission_changed",
          `Source directory changed during ingestion: ${snapshot.relativePath}.`,
          { complete: false, sourcePath: snapshot.relativePath },
        );
      }
    }
  };
  return {
    rootPath,
    revalidateAdmission,
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
