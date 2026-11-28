// Responsibility: canonical runtime candidate evidence, consumer-pin binding, protected-check verification, and residue classification.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseRegisteredWorktrees as parseWorktreeRecords } from "./worktree-policy.mjs";
import { resolveRuntimeDocsDependencyFromSource } from "./runtime-readiness-contract.mjs";

export const SHA_PATTERN = /^[0-9a-f]{40}$/;
export const CANONICAL_RUNTIME_STATUS_ARGS = Object.freeze(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
const BLOCKING_CONFIG_FILES = Object.freeze([
  /^\.env(?:\..+)?$/u,
  /^package(?:-lock)?\.json$/u,
  /^pnpm-lock\.ya?ml$/u,
  /^bun\.lockb?$/u,
  /^tsconfig(?:\..+)?\.json$/u,
  /^vite\.config\.[^.]+$/u,
  /^vitest\.config\.[^.]+$/u,
  /^playwright\.config\.[^.]+$/u,
  /^wrangler(?:\.[^.]+)?\.(?:jsonc?|toml)$/u,
  /^\.npmrc$/u,
  /^\.nvmrc$/u,
]);
const BLOCKING_AUTHORITY_ROOTS = Object.freeze({
  "agentic-os": Object.freeze([
    "runtime",
    "catalog",
    "src",
    "bin",
    "scripts",
    ".github/workflows",
  ]),
  "agentic-graph": Object.freeze([
    ".github/workflows",
    ".githooks",
    "agentic_graph_parser",
    "api",
    "app",
    "canvas",
    "cloudflare",
    "components",
    "config",
    "contracts",
    "data",
    "ecs",
    "functions",
    "grph-shared",
    "gympgrph",
    "mcp",
    "packages",
    "public",
    "scripts",
    "schemas",
    "server",
    "sme-agent",
    "src",
    "storage",
    "web",
    "workers",
  ]),
});

export function validateCanonicalRuntimeCandidate(evidence) {
  for (const repository of [evidence.agenticCanvasOs, evidence.agenticGraph]) {
    if (repository.branch !== "main") throw new Error(`${repository.id} canonical runtime checkout must be on main.`);
    const residue = normalizeCanonicalRuntimeResidue(repository);
    assertCanonicalRuntimeWorkspace(repository.id, residue);
    if (!SHA_PATTERN.test(String(repository.headSha || ""))) throw new Error(`${repository.id} requires an exact 40-character SHA.`);
    if (repository === evidence.agenticGraph && repository.headSha !== repository.remoteSha) {
      throw new Error(`${repository.id} canonical HEAD must equal fetched origin/main.`);
    }
    if (!repository.protectedChecksVerified) throw new Error(`${repository.id} protected checks are not verified for ${repository.headSha}.`);
  }
  const revisionBinding = resolveAgenticCanvasOsRevisionBinding(evidence.agenticCanvasOs);
  if (!evidence.agenticGraph.hasDevApexScript || !evidence.agenticGraph.hasStorageWorkerScript) {
    throw new Error("agentic-graph must expose repository-owned dev:apex and storage:worker:dev scripts.");
  }
  return { ...evidence, agenticCanvasOs: { ...evidence.agenticCanvasOs, revisionBinding } };
}

function resolveAgenticCanvasOsRevisionBinding(repository) {
  const pin = String(repository.consumerPinnedRef || "");
  if (SHA_PATTERN.test(pin) &&
      (repository.headSha === pin || repository.headSha === repository.remoteSha) &&
      repository.consumerPinnedRefIsAncestorOfRemote === true) {
    return "consumer-pin";
  }
  if (repository.headSha === repository.remoteSha) return "fetched-tip";
  throw new Error(
    `${repository.id} canonical HEAD must equal fetched origin/main or the consumer-pinned docs_dependency ref that is an ancestor of origin/main.`,
  );
}

export function parseConsumerPinnedDocsRef(markdown) {
  const text = String(markdown ?? "");
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  let inDocsDependency = false;
  for (const line of text.slice(0, end).split("\n")) {
    if (/^docs_dependency:\s*$/u.test(line)) {
      inDocsDependency = true;
      continue;
    }
    if (!inDocsDependency) continue;
    if (!/^\s/u.test(line)) {
      inDocsDependency = false;
      continue;
    }
    const match = /^ {2}ref:\s*"?([0-9a-f]{40})"?\s*$/u.exec(line);
    if (match) return match[1];
  }
  return null;
}

function isAncestorCommit(root, ancestorSha, descendantSha, deps) {
  try {
    deps.gitText(root, ["merge-base", "--is-ancestor", ancestorSha, descendantSha]);
    return true;
  } catch {
    return false;
  }
}

export function resolvePinnedDocsDependency(agenticGraphRoot, agenticCanvasOsRoot, workspaceRoot) {
  const contractPath = path.join(agenticGraphRoot, "docs", "runtime-readiness-contract.md");
  const packagePath = path.join(agenticGraphRoot, "package.json");
  const lockPath = path.join(agenticGraphRoot, "package-lock.json");
  const { dependency } = resolveRuntimeDocsDependencyFromSource(
    readFileSync(contractPath, "utf8"),
    JSON.parse(readFileSync(packagePath, "utf8")),
    "docs/runtime-readiness-contract.md",
  );
  if (dependency.repository !== "huijoohwee/agentic-os") {
    throw new Error("local runtime docs dependency must resolve to huijoohwee/agentic-os");
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const expected = `https://codeload.github.com/${dependency.repository}/tar.gz/${dependency.ref}`;
  if (lock.packages?.["node_modules/agentic-os"]?.resolved !== expected) {
    throw new Error("local runtime docs package lock does not match the exact runtime docs dependency");
  }
  const archive = execFileSync("git", ["archive", "--format=tar", dependency.ref, "catalog/dictionaries"], {
    cwd: agenticCanvasOsRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  const archiveEntries = execFileSync("tar", ["-tf", "-"], { input: archive, encoding: "utf8" })
    .split("\n").filter(Boolean);
  if (archiveEntries.length === 0 || archiveEntries.some(entry =>
    (!entry.startsWith("catalog/dictionaries/") && entry !== "catalog/dictionaries" && entry !== "catalog/")
    || entry.split("/").includes("..") || entry.startsWith("/"))) {
    throw new Error("the exact pinned Agentic OS docs archive has an invalid path inventory");
  }
  const archiveDigest = createHash("sha256").update(archive).digest("hex");
  const cacheRoot = path.join(workspaceRoot, ".runtime-state", "agentic-canvas-os", "agentic-graph-local-runtime", "pinned-docs");
  mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  chmodSync(cacheRoot, 0o700);
  const marker = JSON.stringify({ schema: "agentic-graph/pinned-agentic-os-docs-cache/v1", ref: dependency.ref, archiveDigest });
  let target = path.join(cacheRoot, `${dependency.ref}-${archiveDigest}`);
  const validCache = directory => {
    try {
      return readFileSync(path.join(directory, ".agentic-os-docs-cache.json"), "utf8") === `${marker}\n`
        && existsSync(path.join(directory, "catalog", "dictionaries"));
    } catch {
      return false;
    }
  };
  if (existsSync(target) && !validCache(target)) target = `${target}-${process.pid}-${randomUUID()}`;
  if (!validCache(target)) {
    const staging = mkdtempSync(path.join(cacheRoot, `.extract-${dependency.ref}-`));
    try {
      execFileSync("tar", ["-xf", "-", "-C", staging], { input: archive, stdio: ["pipe", "ignore", "pipe"] });
      const extractedDocsRoot = path.join(staging, "catalog", "dictionaries");
      if (!existsSync(extractedDocsRoot)) throw new Error("pinned Agentic OS archive is missing catalog/dictionaries");
      writeFileSync(path.join(staging, ".agentic-os-docs-cache.json"), `${marker}\n`, { flag: "wx", mode: 0o600 });
      try {
        renameSync(staging, target);
      } catch (error) {
        if (!validCache(target)) throw error;
        rmSync(staging, { recursive: true, force: true });
      }
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  }
  return { dependency, docsRoot: path.join(target, "catalog", "dictionaries"), archiveDigest };
}

function withConsumerPinEvidence(repository, deps, docs) {
  const consumerPinnedRef = docs.dependency.ref;
  return {
    ...repository,
    consumerPinnedRef,
    docsRoot: docs.docsRoot,
    consumerPinnedRefIsAncestorOfRemote: consumerPinnedRef !== null &&
      isAncestorCommit(repository.root, consumerPinnedRef, repository.remoteSha, deps),
    pinnedDocsTreeSha: deps.gitText(repository.root, ["rev-parse", `${consumerPinnedRef}^{tree}`]).trim(),
  };
}


function inspectCanonicalCandidate(options, deps, { verifyProtected }) {
  const { workspaceRoot, agenticCanvasOsRoot, agenticGraphRoot } = resolveCanonicalRuntimeRoots(options, deps);
  const docs = resolvePinnedDocsDependency(agenticGraphRoot, agenticCanvasOsRoot, workspaceRoot);
  const repositories = [
    inspectRepository("agentic-os", agenticCanvasOsRoot, deps, verifyProtected),
    inspectRepository("agentic-graph", agenticGraphRoot, deps, verifyProtected),
  ];
  const packageJson = JSON.parse(readFileSync(path.join(agenticGraphRoot, "package.json"), "utf8"));
  const protectedChecks = Object.fromEntries(repositories.map(repository => [repository.id, repository.checks]));
  const evidence = validateCanonicalRuntimeCandidate({
    agenticCanvasOs: withConsumerPinEvidence(repositories[0], deps, docs),
    agenticGraph: {
      ...repositories[1],
      hasDevApexScript: typeof packageJson.scripts?.["dev:apex"] === "string",
      hasStorageWorkerScript: typeof packageJson.scripts?.["storage:worker:dev"] === "string",
    },
  });
  const { headSha: checkoutHeadSha, treeSha: checkoutTreeSha, pinnedDocsTreeSha, docsRoot,
    consumerPinnedRef, ...agenticCanvasOs } = evidence.agenticCanvasOs;
  return {
    workspaceRoot,
    agenticCanvasOsRoot,
    agenticGraph: { ...evidence.agenticGraph, root: agenticGraphRoot },
    agenticCanvasOs: {
      ...agenticCanvasOs,
      checkoutHeadSha,
      checkoutTreeSha,
      headSha: consumerPinnedRef,
      treeSha: pinnedDocsTreeSha,
      docsRoot,
    },
    protectedChecks,
  };
}

export function resolveCanonicalCandidate(options, deps, settings) {
  return typeof deps.inspectCanonicalCandidate === "function"
    ? deps.inspectCanonicalCandidate(options, settings)
    : inspectCanonicalCandidate(options, deps, settings);
}

export function resolveOwnershipCandidate(options, deps) {
  return typeof deps.inspectOwnershipCandidate === "function"
    ? deps.inspectOwnershipCandidate(options)
    : inspectOwnershipCandidate(options, deps);
}

export function inspectOwnershipCandidate(options, deps) {
  const { workspaceRoot, agenticCanvasOsRoot, agenticGraphRoot } = resolveCanonicalRuntimeRoots(options, deps);
  const docs = resolvePinnedDocsDependency(agenticGraphRoot, agenticCanvasOsRoot, workspaceRoot);
  const docsTreeSha = deps.gitText(agenticCanvasOsRoot, ["rev-parse", `${docs.dependency.ref}^{tree}`]).trim();
  return {
    workspaceRoot,
    agenticCanvasOsRoot,
    agenticCanvasOs: { headSha: docs.dependency.ref, treeSha: docsTreeSha, docsRoot: docs.docsRoot },
    agenticGraph: {
      root: agenticGraphRoot,
      headSha: deps.gitText(agenticGraphRoot, ["rev-parse", "HEAD"]).trim(),
      gitCommonDir: resolveGitCommonDir(agenticGraphRoot, deps),
    },
  };
}

function resolveCanonicalRuntimeRoots(options, deps) {
  const invokingRoot = realpathSync(options.agenticCanvasOsRoot);
  const workspaceRoot = resolveWorkspaceRootFromGitCommonDir(resolveGitCommonDir(invokingRoot, deps));
  const agenticCanvasOsRoot = realpathSync(resolveCanonicalMainWorktree(
    deps.gitText(invokingRoot, ["worktree", "list", "--porcelain", "-z"]),
  ));
  const requestedAgenticGraphRoot = realpathSync(options.repository || path.join(workspaceRoot, "agentic-graph"));
  const agenticGraphRoot = realpathSync(resolveCanonicalMainWorktree(
    deps.gitText(requestedAgenticGraphRoot, ["worktree", "list", "--porcelain", "-z"]),
  ));
  return { workspaceRoot, agenticCanvasOsRoot, agenticGraphRoot };
}

function inspectRepository(id, root, deps, verifyProtected) {
  refreshProtectedMain(root, deps);
  const headSha = deps.gitText(root, ["rev-parse", "HEAD"]).trim();
  const remoteSha = deps.gitText(root, ["rev-parse", "origin/main"]).trim();
  const treeSha = deps.gitText(root, ["rev-parse", "HEAD^{tree}"]).trim();
  const statusPorcelain = deps.gitText(root, CANONICAL_RUNTIME_STATUS_ARGS);
  const residue = classifyCanonicalRuntimeResidue({ repositoryId: id, statusPorcelain });
  const profile = JSON.parse(readFileSync(path.join(root, ".agentic-os.json"), "utf8"));
  const requiredChecks = profile.requiredChecks;
  if (profile.repository !== `github.com/huijoohwee/${id}` || !Array.isArray(requiredChecks)
      || requiredChecks.length === 0 || requiredChecks.some(name => typeof name !== "string" || !name.trim())
      || new Set(requiredChecks).size !== requiredChecks.length) throw new Error(`${id} has an invalid committed check profile.`);
  const checks = verifyProtected ? deps.verifyProtectedChecks(id, root, headSha, requiredChecks) : ["cached-status-check"];
  return {
    id,
    root,
    gitCommonDir: resolveGitCommonDir(root, deps),
    branch: deps.gitText(root, ["branch", "--show-current"]).trim(),
    clean: residue.clean,
    headSha,
    remoteSha,
    treeSha,
    residue,
    protectedChecksVerified: checks.length > 0,
    checks,
  };
}

/** Refresh only the protected tip; local review must preserve every lane ref. */
export function refreshProtectedMain(root, deps) {
  deps.gitText(root, ["fetch", "--quiet", "--no-tags", "--no-prune", "--no-write-fetch-head",
    "--no-auto-maintenance", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
}

export function classifyCanonicalRuntimeResidue({
  repositoryId,
  statusPorcelain = "",
} = {}) {
  const entries = parseGitStatusPorcelain(statusPorcelain);
  const blocking = [];
  const foreign = [];
  for (const entry of entries) {
    const classified = classifyCanonicalRuntimeResidueEntry(repositoryId, entry);
    if (classified.blocking) {
      blocking.push(classified);
    } else {
      foreign.push(classified);
    }
  }
  return Object.freeze({
    clean: entries.length === 0,
    runtimeSafe: blocking.length === 0,
    blocking,
    foreign,
    blockingDigest: blocking.length ? sha256(JSON.stringify(blocking)) : null,
    foreignDigest: foreign.length ? sha256(JSON.stringify(foreign)) : null,
  });
}

export function assertCanonicalRuntimeWorkspace(repositoryId, residue) {
  if (!residue.runtimeSafe) {
    throw new Error(`${repositoryId} canonical runtime checkout has runtime-blocking residue: ${summarizeCanonicalRuntimeResidue(residue.blocking)}.`);
  }
}

function normalizeCanonicalRuntimeResidue(repository) {
  if (repository?.residue) return repository.residue;
  if (repository?.clean === true) {
    return {
      clean: true,
      runtimeSafe: true,
      blocking: [],
      foreign: [],
      blockingDigest: null,
      foreignDigest: null,
    };
  }
  return {
    clean: Boolean(repository?.clean),
    runtimeSafe: Boolean(repository?.clean),
    blocking: repository?.clean ? [] : [{ path: "*", reason: "legacy-uncategorized-residue" }],
    foreign: [],
    blockingDigest: null,
    foreignDigest: null,
  };
}

function classifyCanonicalRuntimeResidueEntry(repositoryId, entry) {
  const pathName = entry.toPath || entry.path;
  if (entry.code !== "??") {
    return Object.freeze({
      ...entry,
      path: pathName,
      blocking: true,
      reason: "tracked-residue",
    });
  }
  if (matchesBlockingRuntimeAuthority(repositoryId, pathName)) {
    return Object.freeze({
      ...entry,
      path: pathName,
      blocking: true,
      reason: "untracked-runtime-authority",
    });
  }
  return Object.freeze({
    ...entry,
    path: pathName,
    blocking: false,
    reason: "foreign-parallel-residue",
  });
}

function parseGitStatusPorcelain(statusPorcelain) {
  const text = String(statusPorcelain || "");
  const nulDelimited = text.includes("\0");
  const records = nulDelimited ? text.split("\0") : text.split(/\r?\n/u);
  const entries = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (!record) continue;
    const code = record.slice(0, 2);
    const payload = record.slice(3);
    if (/[RC]/u.test(code)) {
      // With -z Git emits the destination first, then the original path as its own record.
      const [path, toPath] = nulDelimited ? [records[++index], payload] : payload.split(" -> ");
      entries.push(Object.freeze({ code, path, toPath }));
    } else {
      entries.push(Object.freeze({ code, path: payload }));
    }
  }
  return entries;
}

function matchesBlockingRuntimeAuthority(repositoryId, pathName) {
  const normalizedPath = String(pathName || "").replace(/\\/gu, "/");
  const baseName = normalizedPath.split("/").at(-1) || normalizedPath;
  if (BLOCKING_CONFIG_FILES.some(pattern => pattern.test(baseName))) return true;
  const roots = BLOCKING_AUTHORITY_ROOTS[repositoryId];
  if (!roots) return true;
  return roots.some(root => (
    normalizedPath === root || normalizedPath.startsWith(`${root}/`)
  ));
}

function summarizeCanonicalRuntimeResidue(entries) {
  if (!entries.length) return "unknown residue";
  const preview = entries
    .slice(0, 3)
    .map(entry => `${entry.path} (${entry.reason})`)
    .join(", ");
  return entries.length > 3 ? `${preview}, +${entries.length - 3} more` : preview;
}

export function verifyProtectedChecks(id, root, revision, requiredNames) {
  const remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
  const slug = /github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/.exec(remote)?.[1];
  if (!slug) throw new Error(`${id} origin is not a GitHub repository.`);
  const response = JSON.parse(execFileSync("gh", ["api", `repos/${slug}/commits/${revision}/check-runs?per_page=100`], { cwd: root, encoding: "utf8" }));
  const runs = Array.isArray(response.check_runs) ? response.check_runs : [];
  for (const name of requiredNames) {
    if (!runs.some(run => run.name === name && run.status === "completed" && run.conclusion === "success")) {
      throw new Error(`${id} protected check ${name} is not successful at ${revision}.`);
    }
  }
  return [...requiredNames];
}


function resolveGitCommonDir(repository, deps) {
  return path.resolve(repository, deps.gitText(repository, ["rev-parse", "--git-common-dir"]).trim());
}

export function resolveCanonicalMainWorktree(porcelain) {
  const matches = parseWorktreeRecords(porcelain)
    .filter(record => record.branch === "refs/heads/main" && !record.bare && !record.prunable && !record.locked);
  if (matches.length !== 1) {
    throw new Error(`Canonical runtime requires exactly one registered main worktree; found ${matches.length}.`);
  }
  return path.resolve(matches[0].path);
}

export function resolveWorkspaceRootFromGitCommonDir(commonDir) {
  const resolved = path.resolve(String(commonDir || ""));
  if (!String(commonDir || "").trim()) throw new Error("Canonical runtime requires the Git common directory.");
  return path.dirname(path.dirname(resolved));
}


export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
