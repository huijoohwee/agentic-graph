import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

import {
  AGENTIC_CANVAS_OS_DOCS_KIND_FILES,
  AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE,
  AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE,
} from "./agentic-canvas-os-docs-contract.mjs";
import {
  buildAgenticCanvasOsDocsInvokePayload,
  resolveAgentLiveProviderProofRevisionFromGitHub,
} from "./agentic-canvas-os-docs-core.mjs";

const REQUIRED_DOC_FILE_NAMES = Object.freeze([
  "FACTS.md",
  ...Object.values(AGENTIC_CANVAS_OS_DOCS_KIND_FILES),
  AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE,
  AGENTIC_CANVAS_OS_PROGRESSIVE_AGENTS_FILE,
]);

const normalizeText = (value) => String(value || "").trim();
const execFileAsync = promisify(execFile);
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const CANONICAL_DOCS_REPOSITORY = "huijoohwee/agentic-canvas-os";
const DOCS_SOURCE_AUTHORITY_ERROR_MESSAGE =
  "Agentic Canvas OS docs source authority could not be verified.";

const sourceAuthorityError = (message) => Object.assign(new Error(message), {
  code: "docs_source_authority_unverified",
});

const normalizeGitHubRepositoryIdentity = (remoteUrl) => {
  const value = normalizeText(remoteUrl);
  let repositoryPath = "";
  const httpsMatch = value.match(/^https:\/\/github\.com\/(.+)$/i);
  const scpSshMatch = value.match(/^git@github\.com:(.+)$/i);
  const urlSshMatch = value.match(/^ssh:\/\/git@github\.com(?::22)?\/(.+)$/i);
  if (httpsMatch) repositoryPath = httpsMatch[1];
  else if (scpSshMatch) repositoryPath = scpSshMatch[1];
  else if (urlSshMatch) repositoryPath = urlSshMatch[1];
  else return "";

  const normalizedPath = repositoryPath.replace(/\/+$/, "").replace(/\.git$/i, "");
  const segments = normalizedPath.split("/");
  if (segments.length !== 2 || segments.some((segment) => !segment)) return "";
  return segments.map((segment) => segment.toLowerCase()).join("/");
};

export const resolveAgenticCanvasOsDocsRevision = async ({ absoluteDocsRoot, env = process.env }) => {
  const configuredRevision = normalizeText(env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION);
  if (configuredRevision) {
    if (!SOURCE_REVISION_PATTERN.test(configuredRevision)) {
      throw new Error("AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION must be an exact 40-character SHA");
    }
  }

  let repositoryRoot;
  try {
    const { stdout } = await execFileAsync("git", [
      "-C", path.resolve(absoluteDocsRoot), "rev-parse", "--show-toplevel",
    ]);
    repositoryRoot = path.resolve(normalizeText(stdout));
    const [resolvedDocsRoot, expectedDocsRoot] = await Promise.all([
      fs.realpath(path.resolve(absoluteDocsRoot)),
      fs.realpath(path.join(repositoryRoot, "docs")),
    ]);
    if (resolvedDocsRoot !== expectedDocsRoot) {
      throw sourceAuthorityError("Agentic Canvas OS docs root is not the repository docs root");
    }
  } catch (error) {
    if (error?.code === "docs_source_authority_unverified") throw error;
    throw sourceAuthorityError("Agentic Canvas OS docs root is not a Git checkout");
  }

  const { stdout: dirtyOutput } = await execFileAsync("git", [
    "-C", repositoryRoot, "status", "--porcelain", "--untracked-files=all",
  ]);
  if (normalizeText(dirtyOutput)) {
    throw sourceAuthorityError(
      "Agentic Canvas OS docs checkout has uncommitted content and cannot provide an exact source revision",
    );
  }

  let remoteUrls;
  try {
    const { stdout } = await execFileAsync("git", [
      "-C", repositoryRoot, "remote", "get-url", "--all", "origin",
    ]);
    remoteUrls = String(stdout || "").split(/\r?\n/).map(normalizeText).filter(Boolean);
  } catch {
    throw sourceAuthorityError("Agentic Canvas OS docs checkout has no canonical origin");
  }
  if (
    remoteUrls.length === 0
    || remoteUrls.some((remoteUrl) => (
      normalizeGitHubRepositoryIdentity(remoteUrl) !== CANONICAL_DOCS_REPOSITORY
    ))
  ) {
    throw sourceAuthorityError("Agentic Canvas OS docs checkout origin is not canonical");
  }

  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"]);
  const revision = normalizeText(stdout);
  if (!SOURCE_REVISION_PATTERN.test(revision)) {
    throw sourceAuthorityError("Agentic Canvas OS docs checkout did not resolve to an exact Git SHA");
  }

  let originMainRevision;
  try {
    const { stdout: originMainOutput } = await execFileAsync("git", [
      "-C", repositoryRoot, "rev-parse", "--verify", "refs/remotes/origin/main^{commit}",
    ]);
    originMainRevision = normalizeText(originMainOutput);
    if (!SOURCE_REVISION_PATTERN.test(originMainRevision)) throw new Error("invalid revision");
    await execFileAsync("git", [
      "-C", repositoryRoot, "merge-base", "--is-ancestor", revision, originMainRevision,
    ]);
  } catch {
    throw sourceAuthorityError(
      "Agentic Canvas OS docs checkout HEAD is not contained in fetched origin/main",
    );
  }

  if (configuredRevision && configuredRevision !== revision) {
    throw new Error(`AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION ${configuredRevision} does not match docs checkout HEAD ${revision}`);
  }
  return revision;
};

export const resolveAgenticCanvasOsLiveProofRevision = async ({
  absoluteDocsRoot,
  sourceRevision,
  env = process.env,
}) => {
  const configuredRevision = normalizeText(env.AGENTIC_OS_AGENTIC_CANVAS_OS_LIVE_PROOF_REVISION);
  if (configuredRevision) {
    if (!SOURCE_REVISION_PATTERN.test(configuredRevision)) {
      throw new Error("AGENTIC_OS_AGENTIC_CANVAS_OS_LIVE_PROOF_REVISION must be an exact 40-character SHA");
    }
    return configuredRevision;
  }
  const repositoryRoot = path.resolve(absoluteDocsRoot, "..");
  const proofPath = path.relative(repositoryRoot, path.join(absoluteDocsRoot, AGENTIC_CANVAS_OS_LIVE_AGENT_PROOF_FILE));
  const { stdout: shallowOutput } = await execFileAsync("git", [
    "-C", repositoryRoot, "rev-parse", "--is-shallow-repository",
  ]);
  const isShallowRepository = normalizeText(shallowOutput) === "true";
  let localRevision = "";
  if (!isShallowRepository) {
    const { stdout } = await execFileAsync("git", [
      "-C", repositoryRoot, "log", "--follow", "--diff-filter=A", "--format=%H", "--", proofPath,
    ]);
    localRevision = normalizeText(stdout).split(/\r?\n/).filter(Boolean).at(-1) || "";
  }
  if (SOURCE_REVISION_PATTERN.test(localRevision)) return localRevision;
  const revision = await resolveAgentLiveProviderProofRevisionFromGitHub({
    sourceRevision,
    token: env.AGENTIC_OS_GITHUB_TOKEN,
  });
  if (!SOURCE_REVISION_PATTERN.test(revision)) {
    throw new Error("Agentic Canvas OS live proof did not resolve to an exact introduction SHA from local or remote history");
  }
  return revision;
};

export const resolveAgenticCanvasOsDocsRoot = ({
  rootDir = process.cwd(),
  env = process.env,
} = {}) => {
  const explicitRoot = normalizeText(env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT);
  if (explicitRoot) {
    const resolved = path.resolve(explicitRoot);
    if (!existsSync(path.join(resolved, "FACTS.md"))) {
      throw new Error(`AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT is not a readable Agentic Canvas OS docs root: ${resolved}`);
    }
    return resolved;
  }
  const findMarkerBackedAncestorRoot = (startDir) => {
    let cursor = path.resolve(startDir);
    while (true) {
      const candidate = path.join(cursor, "agentic-canvas-os", "docs");
      if (existsSync(path.join(candidate, "FACTS.md"))) return candidate;
      const parent = path.dirname(cursor);
      if (parent === cursor) return "";
      cursor = parent;
    }
  };
  const ancestorRoot = findMarkerBackedAncestorRoot(rootDir);
  if (ancestorRoot) return ancestorRoot;
  try {
    const gitCommonDir = normalizeText(execFileSync(
      "git",
      ["-C", path.resolve(rootDir), "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ));
    const canonicalRepositoryRoot = path.basename(gitCommonDir) === ".git"
      ? path.dirname(gitCommonDir)
      : gitCommonDir;
    const canonicalRoot = findMarkerBackedAncestorRoot(canonicalRepositoryRoot);
    if (canonicalRoot) return canonicalRoot;
  } catch {
    // Non-Git callers still receive the marker-backed resolution error below.
  }
  throw new Error(`Could not resolve agentic-canvas-os/docs from ${path.resolve(rootDir)}`);
};

export async function runAgenticCanvasOsDocsInvokeTool(args = {}, {
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  try {
    const absoluteDocsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir, env });
    const sourceRevision = await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot, env });
    const liveAgentProviderProofRevision = await resolveAgenticCanvasOsLiveProofRevision({
      absoluteDocsRoot,
      sourceRevision,
      env,
    });
    const docsContentByFileName = {};
    const missing = [];

    for (const fileName of REQUIRED_DOC_FILE_NAMES) {
      try {
        docsContentByFileName[fileName] = await fs.readFile(path.join(absoluteDocsRoot, fileName), "utf8");
      } catch {
        missing.push(fileName);
        docsContentByFileName[fileName] = "";
      }
    }

    const payload = buildAgenticCanvasOsDocsInvokePayload({
      docsContentByFileName,
      token: args.token,
      query: args.query,
      includeContent: args.includeContent === true,
      limit: args.limit,
      absoluteDocsRoot,
      sourceRevision,
      liveAgentProviderProofRevision,
    });

    if (missing.length) {
      return {
        ...payload,
        ok: false,
        error: {
          code: "docs_root_unreadable",
          message: `Missing required Agentic Canvas OS docs files: ${missing.join(", ")}`,
        },
      };
    }

    return payload;
  } catch {
    throw sourceAuthorityError(DOCS_SOURCE_AUTHORITY_ERROR_MESSAGE);
  }
}
