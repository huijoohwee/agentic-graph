// Responsibility: canonical runtime candidate evidence, consumer-pin binding, protected-check verification, and residue classification.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { parseRegisteredWorktrees as parseWorktreeRecords } from "./worktree-policy.mjs";

export const SHA_PATTERN = /^[0-9a-f]{40}$/;
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
    "app",
    "src",
    "api",
    "canvas",
    "components",
    "functions",
    "public",
    "scripts",
    "server",
    "storage",
    "workers",
  ]),
});

export function validateCanonicalRuntimeCandidate(evidence) {
  for (const repository of [evidence.agenticCanvasOs, evidence.agenticGraph]) {
    if (repository.branch !== "main") throw new Error(`${repository.id} canonical runtime checkout must be on main.`);
    const residue = normalizeCanonicalRuntimeResidue(repository);
    if (!residue.runtimeSafe) {
      throw new Error(
        `${repository.id} canonical runtime checkout has runtime-blocking residue: ${summarizeCanonicalRuntimeResidue(residue.blocking)}.`,
      );
    }
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
  if (repository.headSha === repository.remoteSha) return "fetched-tip";
  const pin = String(repository.consumerPinnedRef || "");
  if (SHA_PATTERN.test(pin) &&
      repository.headSha === pin &&
      repository.consumerPinnedRefIsAncestorOfRemote === true) {
    return "consumer-pin";
  }
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

function readConsumerPinnedDocsRef(agenticGraphRoot) {
  try {
    return parseConsumerPinnedDocsRef(
      readFileSync(path.join(agenticGraphRoot, "docs", "runtime-readiness-contract.md"), "utf8"),
    );
  } catch {
    return null;
  }
}

function isAncestorCommit(root, ancestorSha, descendantSha, deps) {
  try {
    deps.gitText(root, ["merge-base", "--is-ancestor", ancestorSha, descendantSha]);
    return true;
  } catch {
    return false;
  }
}

function withConsumerPinEvidence(repository, agenticGraphRoot, deps) {
  const consumerPinnedRef = readConsumerPinnedDocsRef(agenticGraphRoot);
  return {
    ...repository,
    consumerPinnedRef,
    consumerPinnedRefIsAncestorOfRemote: consumerPinnedRef !== null &&
      isAncestorCommit(repository.root, consumerPinnedRef, repository.remoteSha, deps),
  };
}


function inspectCanonicalCandidate(options, deps, { verifyProtected }) {
  const { workspaceRoot, agenticCanvasOsRoot, agenticGraphRoot } = resolveCanonicalRuntimeRoots(options, deps);
  const repositories = [
    inspectRepository("agentic-os", agenticCanvasOsRoot, deps, verifyProtected),
    inspectRepository("agentic-graph", agenticGraphRoot, deps, verifyProtected),
  ];
  const packageJson = JSON.parse(readFileSync(path.join(agenticGraphRoot, "package.json"), "utf8"));
  const protectedChecks = Object.fromEntries(repositories.map(repository => [repository.id, repository.checks]));
  const evidence = validateCanonicalRuntimeCandidate({
    agenticCanvasOs: withConsumerPinEvidence(repositories[0], agenticGraphRoot, deps),
    agenticGraph: {
      ...repositories[1],
      hasDevApexScript: typeof packageJson.scripts?.["dev:apex"] === "string",
      hasStorageWorkerScript: typeof packageJson.scripts?.["storage:worker:dev"] === "string",
    },
  });
  return { workspaceRoot, agenticCanvasOsRoot, agenticGraph: { ...evidence.agenticGraph, root: agenticGraphRoot }, agenticCanvasOs: evidence.agenticCanvasOs, protectedChecks };
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
  return {
    workspaceRoot,
    agenticCanvasOsRoot,
    agenticCanvasOs: { headSha: deps.gitText(agenticCanvasOsRoot, ["rev-parse", "HEAD"]).trim() },
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
  deps.gitText(root, ["fetch", "--quiet", "--prune", "origin", "main"]);
  const headSha = deps.gitText(root, ["rev-parse", "HEAD"]).trim();
  const remoteSha = deps.gitText(root, ["rev-parse", "origin/main"]).trim();
  const treeSha = deps.gitText(root, ["rev-parse", "HEAD^{tree}"]).trim();
  const statusPorcelain = deps.gitText(root, ["status", "--porcelain", "--untracked-files=all"]).trimEnd();
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
  return String(statusPorcelain || "")
    .split(/\r?\n/u)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const code = line.slice(0, 2);
      const payload = line.slice(3);
      const [fromPath, toPath] = payload.split(" -> ");
      return Object.freeze({
        code,
        path: fromPath,
        ...(toPath ? { toPath } : {}),
      });
    });
}

function matchesBlockingRuntimeAuthority(repositoryId, pathName) {
  const normalizedPath = String(pathName || "").replace(/\\/gu, "/");
  const baseName = normalizedPath.split("/").at(-1) || normalizedPath;
  if (BLOCKING_CONFIG_FILES.some(pattern => pattern.test(baseName))) return true;
  return (BLOCKING_AUTHORITY_ROOTS[repositoryId] || []).some(root => (
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
