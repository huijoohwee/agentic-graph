import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { KnowledgeGraphError, sha256, throwIfAborted } from "./contract.mjs";

const OWNER_REPO = /^[A-Za-z0-9_.-]{1,100}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;

async function ensureRepositoryCacheRoot(cacheRootRaw, allowedRootRaw) {
  const cacheRoot = path.resolve(String(cacheRootRaw || ""));
  const allowedRoot = await fs.realpath(path.resolve(String(allowedRootRaw || ""))).catch(() => null);
  if (!allowedRoot || !pathIsInside(cacheRoot, allowedRoot) || cacheRoot === allowedRoot) {
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository cache root is outside its host-owned storage root.");
  }
  try {
    await fs.mkdir(cacheRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const observed = await fs.lstat(cacheRoot);
  if (observed.isSymbolicLink() || !observed.isDirectory()) {
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository cache root must be a non-symlink directory.");
  }
  const real = await fs.realpath(cacheRoot);
  const resolved = await fs.stat(real);
  if (!sameFileIdentity(observed, resolved) || !pathIsInside(real, allowedRoot)) {
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository cache root changed or escaped containment.");
  }
  return real;
}

function parseRepositoryUrl(valueRaw) {
  let url;
  try { url = new URL(String(valueRaw || "")); } catch {
    throw new KnowledgeGraphError("repository_url_invalid", "repositoryUrl must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search || url.hash) {
    throw new KnowledgeGraphError("repository_url_invalid", "repositoryUrl must be credential-free HTTPS on github.com.");
  }
  let parts;
  try {
    parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    throw new KnowledgeGraphError("repository_url_invalid", "repositoryUrl contains invalid path encoding.");
  }
  const owner = parts[0];
  const repository = String(parts[1] || "").replace(/\.git$/i, "");
  if (!OWNER_REPO.test(owner || "") || !OWNER_REPO.test(repository) || (parts.length > 2 && parts[2] !== "tree")) {
    throw new KnowledgeGraphError("repository_url_invalid", "repositoryUrl must identify owner/repository or owner/repository/tree/ref/path.");
  }
  if (parts[2] === "tree" && parts.length < 4) {
    throw new KnowledgeGraphError("repository_url_invalid", "A repository tree URL must include a ref.");
  }
  return {
    owner,
    repository,
    remoteUrl: `https://github.com/${owner}/${repository}.git`,
    displayUrl: `https://github.com/${owner}/${repository}`,
    treeParts: parts[2] === "tree" ? parts.slice(3) : [],
  };
}

function runGit(args, { cwd, abortSignal, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    throwIfAborted(abortSignal);
    const child = spawn("git", [
      "-c", "credential.helper=",
      "-c", "core.fsmonitor=false",
      "-c", "core.hooksPath=/dev/null",
      ...args,
    ], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: String(process.env.PATH || ""),
        HOME: String(process.env.HOME || ""),
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "/usr/bin/false",
        SSH_ASKPASS: "/usr/bin/false",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ALLOW_PROTOCOL: "https",
        GIT_PROTOCOL_FROM_USER: "0",
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(stdout);
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(new KnowledgeGraphError("aborted", "Repository acquisition was aborted."));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new KnowledgeGraphError("repository_acquisition_timeout", `Repository acquisition exceeded ${timeoutMs}ms.`));
    }, Math.max(1000, Math.min(600_000, Number(timeoutMs) || 120_000)));
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => finish(new KnowledgeGraphError("repository_acquisition_unavailable", "Local git is unavailable.", {
      causeCode: String(error?.code || "spawn_failed"),
    })));
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 32 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new KnowledgeGraphError("repository_acquisition_output_limit", "Repository acquisition output exceeded its bound."));
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 8192); });
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new KnowledgeGraphError("repository_acquisition_failed", `Local git exited ${code}.`, {
        stderr: stderr.trim().slice(0, 1000),
      }));
    });
  });
}

function parseRemoteRefs(output) {
  const refs = new Map();
  let headRef = "";
  for (const line of String(output || "").split(/\r?\n/)) {
    const symbolic = /^ref:\s+(\S+)\s+HEAD$/.exec(line);
    if (symbolic) {
      headRef = symbolic[1];
      continue;
    }
    const match = /^([a-f0-9]{40})\s+(\S+)$/.exec(line);
    if (match) {
      const ref = match[2];
      if (ref.endsWith("^{}")) refs.set(ref.slice(0, -3), match[1]);
      else if (!refs.has(ref)) refs.set(ref, match[1]);
    }
  }
  return { refs, headRef };
}

function resolveTreeIdentity(parsed, remote, requestedRef) {
  const parts = parsed.treeParts;
  if (requestedRef) {
    if (parts.length) {
      throw new KnowledgeGraphError("repository_ref_conflict", "repositoryRef cannot be combined with a repository tree URL.");
    }
    const ref = String(requestedRef);
    const sha = COMMIT_SHA.test(ref)
      ? ref
      : remote.refs.get(`refs/heads/${ref}`) || remote.refs.get(`refs/tags/${ref}`) || remote.refs.get(ref);
    if (!sha) throw new KnowledgeGraphError("repository_ref_not_found", `Repository ref was not found: ${ref}`);
    return { sha, ref, subpath: parts.length ? parts.join("/") : "" };
  }
  if (!parts.length) {
    const sha = remote.refs.get("HEAD") || remote.refs.get(remote.headRef);
    if (!sha) throw new KnowledgeGraphError("repository_ref_not_found", "Repository default branch could not be resolved.");
    return { sha, ref: remote.headRef || "HEAD", subpath: "" };
  }
  if (COMMIT_SHA.test(parts[0])) return { sha: parts[0], ref: parts[0], subpath: parts.slice(1).join("/") };
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join("/");
    const sha = remote.refs.get(`refs/heads/${candidate}`) || remote.refs.get(`refs/tags/${candidate}`);
    if (sha) return { sha, ref: candidate, subpath: parts.slice(length).join("/") };
  }
  throw new KnowledgeGraphError("repository_ref_not_found", "Repository tree ref could not be resolved exactly.");
}

export async function verifyRepositoryCacheEntry(target, expectedSha, allowedRoot = "", options = {}) {
  let targetStat;
  try {
    const observed = await fs.lstat(target);
    if (observed.isSymbolicLink() || !observed.isDirectory()) {
      throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache entry is not a non-symlink directory.");
    }
    const real = await fs.realpath(target);
    const resolved = await fs.stat(real);
    const canonicalAllowedRoot = allowedRoot ? await fs.realpath(allowedRoot).catch(() => null) : "";
    if (!sameFileIdentity(observed, resolved)
      || (allowedRoot && (!canonicalAllowedRoot || !pathIsInside(real, canonicalAllowedRoot)))) {
      throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache entry escaped its cache root.");
    }
    targetStat = observed;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache entry could not be verified.");
  }
  if (!targetStat.isDirectory()) {
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache entry is not a directory.");
  }
  const timeoutMs = Math.min(10_000, Number(options.timeoutMs) || 10_000);
  const runOptions = { cwd: target, timeoutMs, abortSignal: options.abortSignal };
  const head = (await runGit(["rev-parse", "HEAD"], runOptions)).trim();
  if (head !== expectedSha) {
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache commit does not match its immutable identity.");
  }
  const status = await runGit([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignored=matching",
  ], runOptions);
  if (status.length) {
    throw new KnowledgeGraphError(
      "repository_cache_dirty",
      "Repository acquisition cache contains modified, staged, untracked, or ignored working-tree content.",
    );
  }
  return true;
}

async function verifiedCacheRoot(cacheRoot, identity, allowedRoot) {
  const canonicalCacheRoot = await ensureRepositoryCacheRoot(cacheRoot, allowedRoot);
  const target = path.join(canonicalCacheRoot, `${identity.owner}-${identity.repository}-${identity.sha}`);
  const verificationOptions = {
    abortSignal: identity.abortSignal,
    timeoutMs: identity.timeoutMs,
  };
  try {
    if (await verifyRepositoryCacheEntry(target, identity.sha, canonicalCacheRoot, verificationOptions)) {
      return { target, reused: true };
    }
  } catch (error) {
    if (error instanceof KnowledgeGraphError) throw error;
    throw new KnowledgeGraphError("repository_cache_invalid", "Repository acquisition cache entry could not be verified.");
  }
  const temporary = await fs.mkdtemp(path.join(canonicalCacheRoot, ".acquire-"));
  try {
    await runGit(["init", "--quiet"], { cwd: temporary, abortSignal: identity.abortSignal });
    await runGit(["remote", "add", "origin", identity.remoteUrl], { cwd: temporary, abortSignal: identity.abortSignal });
    await runGit(["fetch", "--quiet", "--depth=1", "origin", identity.sha], { cwd: temporary, abortSignal: identity.abortSignal, timeoutMs: identity.timeoutMs });
    await runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: temporary, abortSignal: identity.abortSignal });
    if (!(await verifyRepositoryCacheEntry(temporary, identity.sha, canonicalCacheRoot, verificationOptions))) {
      throw new KnowledgeGraphError("repository_commit_mismatch", "Acquired repository did not match the resolved commit.");
    }
    try { await fs.rename(temporary, target); } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
      if (!(await verifyRepositoryCacheEntry(target, identity.sha, canonicalCacheRoot, verificationOptions))) {
        throw new KnowledgeGraphError("repository_cache_invalid", "Concurrent repository cache entry failed immutable commit verification.");
      }
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
  return { target, reused: false };
}

export async function acquireRepositoryUrl({
  repositoryUrl,
  repositoryRef,
  cacheRoot,
  allowedRoot,
  abortSignal,
  timeoutMs,
}) {
  const parsed = parseRepositoryUrl(repositoryUrl);
  const remoteOutput = await runGit(["ls-remote", "--symref", parsed.remoteUrl], { abortSignal, timeoutMs });
  const resolved = resolveTreeIdentity(parsed, parseRemoteRefs(remoteOutput), repositoryRef);
  const cache = await verifiedCacheRoot(
    cacheRoot,
    { ...parsed, ...resolved, abortSignal, timeoutMs },
    allowedRoot,
  );
  const candidate = resolved.subpath ? path.resolve(cache.target, resolved.subpath) : cache.target;
  const real = await fs.realpath(candidate).catch(() => null);
  const relative = real ? path.relative(cache.target, real) : "..";
  if (!real || relative.startsWith("..") || path.isAbsolute(relative) || !(await fs.stat(real)).isDirectory()) {
    throw new KnowledgeGraphError("repository_subpath_invalid", "Repository URL subpath is not a directory at the resolved commit.");
  }
  return {
    rootPath: real,
    identity: {
      mode: "repository-url",
      repositoryUrl: parsed.displayUrl,
      commitSha: resolved.sha,
      ref: resolved.ref,
      subpath: resolved.subpath,
      acquisitionId: `kg:acquisition:${sha256(`${parsed.displayUrl}\0${resolved.sha}\0${resolved.subpath}`).slice(0, 24)}`,
      networkRequests: 1 + (cache.reused ? 0 : 1),
      cacheReused: cache.reused,
      complete: true,
    },
  };
}
