import { spawn } from "node:child_process";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import {
  compareStableStrings,
  AgentGraphError,
  sha256,
  throwIfAborted,
} from "./contract.mjs";

const REPOSITORY_PATH_SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9._~-]{0,199})$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const MAX_REPOSITORY_PATH_SEGMENTS = 32;

function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const sameFileIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino;

async function ensureRepositoryCacheRoot(cacheRootRaw, allowedRootRaw) {
  const cacheRoot = path.resolve(String(cacheRootRaw || ""));
  const allowedRoot = await fs.realpath(path.resolve(String(allowedRootRaw || ""))).catch(() => null);
  if (!allowedRoot || !pathIsInside(cacheRoot, allowedRoot) || cacheRoot === allowedRoot) {
    throw new AgentGraphError("repository_cache_invalid", "Repository cache root is outside its host-owned storage root.");
  }
  try {
    await fs.mkdir(cacheRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const observed = await fs.lstat(cacheRoot);
  if (observed.isSymbolicLink() || !observed.isDirectory()) {
    throw new AgentGraphError("repository_cache_invalid", "Repository cache root must be a non-symlink directory.");
  }
  const real = await fs.realpath(cacheRoot);
  const resolved = await fs.stat(real);
  if (!sameFileIdentity(observed, resolved) || !pathIsInside(real, allowedRoot)) {
    throw new AgentGraphError("repository_cache_invalid", "Repository cache root changed or escaped containment.");
  }
  return real;
}

function isLocalNetworkHostname(hostname) {
  const normalized = String(hostname || "").toLowerCase();
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost")
    || normalized.endsWith(".local") || normalized.endsWith(".home.arpa")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const octets = normalized.split(".").map(Number);
    return octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
      || octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || octets[0] >= 224;
  }
  return normalized.includes(":");
}

function normalizeAllowedRepositoryHosts(values) {
  if (!Array.isArray(values)) return new Set();
  return new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
}

function isPublicNetworkAddress(addressRaw) {
  const address = String(addressRaw || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    return !(octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && (
        octets[1] === 0
        || octets[1] === 168
      ))
      || (octets[0] === 198 && (
        octets[1] === 18
        || octets[1] === 19
        || octets[1] === 51
      ))
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] >= 224);
  }
  if (version === 6) {
    if (address.startsWith("::ffff:")) {
      return isPublicNetworkAddress(address.slice("::ffff:".length));
    }
    return !(address === "::"
      || address === "::1"
      || /^f[cd]/.test(address)
      || /^fe[89ab]/.test(address)
      || address.startsWith("ff")
      || address.startsWith("2001:db8:"));
  }
  return false;
}

function curlResolveAddress(addressRaw) {
  const address = String(addressRaw || "").replace(/^\[|\]$/g, "");
  return net.isIP(address) === 6 ? `[${address}]` : address;
}

export async function resolveRepositoryNetworkPin(
  parsed,
  {
    allowedHosts = [],
    allowPrivateNetwork = false,
    lookupHost = dns.lookup,
  } = {},
) {
  const hostname = String(parsed?.hostname || "").toLowerCase();
  const hostAllowlist = normalizeAllowedRepositoryHosts(allowedHosts);
  const privateNetworkAllowed = allowPrivateNetwork === true && hostAllowlist.has(hostname);
  const literalAddress = hostname.replace(/^\[|\]$/g, "");
  let addresses;
  if (net.isIP(literalAddress)) {
    addresses = [{ address: literalAddress, family: net.isIP(literalAddress) }];
  } else {
    try {
      addresses = await lookupHost(hostname, { all: true, verbatim: true });
    } catch (error) {
      throw new AgentGraphError(
        "repository_host_resolution_failed",
        "repositoryUrl host could not be resolved under the local source policy.",
        { causeCode: String(error?.code || "lookup_failed"), hostname },
      );
    }
  }
  const normalized = (Array.isArray(addresses) ? addresses : [addresses])
    .map((entry) => ({
      address: String(entry?.address || "").replace(/^\[|\]$/g, ""),
      family: Number(entry?.family || net.isIP(String(entry?.address || ""))),
    }))
    .filter((entry) => net.isIP(entry.address) === entry.family)
    .sort((left, right) => (
      left.family - right.family
      || compareStableStrings(left.address, right.address)
    ));
  if (!normalized.length) {
    throw new AgentGraphError(
      "repository_host_resolution_failed",
      "repositoryUrl host resolved without a usable network address.",
      { hostname },
    );
  }
  if (!privateNetworkAllowed && normalized.some((entry) => !isPublicNetworkAddress(entry.address))) {
    throw new AgentGraphError(
      "repository_host_not_allowed",
      "repositoryUrl host resolved to a non-public network address.",
      { hostname },
    );
  }
  return Object.freeze({
    hostname,
    address: normalized[0].address,
    curlResolve: `${hostname}:443:${curlResolveAddress(normalized[0].address)}`,
  });
}

export function parseRepositoryUrl(
  valueRaw,
  { allowedHosts = [], allowPrivateNetwork = false } = {},
) {
  let url;
  try { url = new URL(String(valueRaw || "")); } catch {
    throw new AgentGraphError("repository_url_invalid", "repositoryUrl must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new AgentGraphError("repository_url_invalid", "repositoryUrl must be credential-free HTTPS without a port, query, or fragment.");
  }
  const hostname = url.hostname.toLowerCase();
  const hostAllowlist = normalizeAllowedRepositoryHosts(allowedHosts);
  const hostExplicitlyAllowed = hostAllowlist.has(hostname);
  if ((hostAllowlist.size && !hostExplicitlyAllowed)
    || (isLocalNetworkHostname(hostname)
      && !(allowPrivateNetwork === true && hostExplicitlyAllowed))) {
    throw new AgentGraphError("repository_host_not_allowed", "repositoryUrl host is not allowed by the local repository-source policy.");
  }
  let parts;
  try {
    parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    throw new AgentGraphError("repository_url_invalid", "repositoryUrl contains invalid path encoding.");
  }
  if (!parts.length || parts.length > MAX_REPOSITORY_PATH_SEGMENTS) {
    throw new AgentGraphError("repository_url_invalid", "repositoryUrl must contain a bounded repository path.");
  }
  const submittedRepository = String(parts.at(-1) || "");
  const explicitGitSuffix = /\.git$/i.test(submittedRepository);
  const repository = submittedRepository.replace(/\.git$/i, "");
  const canonicalParts = [...parts.slice(0, -1), repository];
  if (!repository || canonicalParts.some((part) => (
    part === "."
    || part === ".."
    || !REPOSITORY_PATH_SEGMENT.test(part)
  ))) {
    throw new AgentGraphError("repository_url_invalid", "repositoryUrl contains an unsafe repository path segment.");
  }
  const encodedPath = canonicalParts.map((part) => encodeURIComponent(part)).join("/");
  const displayUrl = `https://${hostname}/${encodedPath}`;
  return {
    hostname,
    repository,
    repositoryPath: canonicalParts.join("/"),
    remoteUrl: explicitGitSuffix ? `${displayUrl}.git` : displayUrl,
    displayUrl,
    cacheKey: sha256(displayUrl).slice(0, 24),
  };
}

export function repositoryCacheEntryName(identity) {
  const cacheKey = String(identity?.cacheKey || "");
  const repository = String(identity?.repository || "");
  const commitSha = String(identity?.sha || "");
  if (!/^[a-f0-9]{24}$/u.test(cacheKey) || !repository || !COMMIT_SHA.test(commitSha)) {
    throw new AgentGraphError(
      "repository_cache_invalid",
      "Repository acquisition cache identity is invalid.",
    );
  }
  return `${cacheKey}-${sha256(repository).slice(0, 16)}-${commitSha}`;
}

function runGit(args, {
  cwd,
  abortSignal,
  timeoutMs = 120_000,
  networkPin = null,
} = {}) {
  return new Promise((resolve, reject) => {
    throwIfAborted(abortSignal);
    const child = spawn("git", [
      "-c", "credential.helper=",
      "-c", "core.fsmonitor=false",
      "-c", "core.hooksPath=/dev/null",
      ...(networkPin ? [
        "-c", "http.followRedirects=false",
        "-c", `http.curloptResolve=${networkPin.curlResolve}`,
      ] : []),
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
      finish(new AgentGraphError("aborted", "Repository acquisition was aborted."));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new AgentGraphError("repository_acquisition_timeout", `Repository acquisition exceeded ${timeoutMs}ms.`));
    }, Math.max(1000, Math.min(600_000, Number(timeoutMs) || 120_000)));
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => finish(new AgentGraphError("repository_acquisition_unavailable", "Local git is unavailable.", {
      causeCode: String(error?.code || "spawn_failed"),
    })));
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 32 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new AgentGraphError("repository_acquisition_output_limit", "Repository acquisition output exceeded its bound."));
      }
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk).slice(0, 8192); });
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new AgentGraphError("repository_acquisition_failed", `Local git exited ${code}.`, {
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

function resolveRepositoryIdentity(remote, requestedRef) {
  if (requestedRef) {
    const ref = String(requestedRef);
    const sha = COMMIT_SHA.test(ref)
      ? ref
      : remote.refs.get(`refs/heads/${ref}`) || remote.refs.get(`refs/tags/${ref}`) || remote.refs.get(ref);
    if (!sha) throw new AgentGraphError("repository_ref_not_found", `Repository ref was not found: ${ref}`);
    return { sha, ref, subpath: "" };
  }
  const sha = remote.refs.get("HEAD") || remote.refs.get(remote.headRef);
  if (!sha) throw new AgentGraphError("repository_ref_not_found", "Repository default branch could not be resolved.");
  return { sha, ref: remote.headRef || "HEAD", subpath: "" };
}

export async function verifyRepositoryCacheEntry(target, expectedSha, allowedRoot = "", options = {}) {
  let targetStat;
  try {
    const observed = await fs.lstat(target);
    if (observed.isSymbolicLink() || !observed.isDirectory()) {
      throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache entry is not a non-symlink directory.");
    }
    const real = await fs.realpath(target);
    const resolved = await fs.stat(real);
    const canonicalAllowedRoot = allowedRoot ? await fs.realpath(allowedRoot).catch(() => null) : "";
    if (!sameFileIdentity(observed, resolved)
      || (allowedRoot && (!canonicalAllowedRoot || !pathIsInside(real, canonicalAllowedRoot)))) {
      throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache entry escaped its cache root.");
    }
    targetStat = observed;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    if (error instanceof AgentGraphError) throw error;
    throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache entry could not be verified.");
  }
  if (!targetStat.isDirectory()) {
    throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache entry is not a directory.");
  }
  const timeoutMs = Math.min(10_000, Number(options.timeoutMs) || 10_000);
  const runOptions = { cwd: target, timeoutMs, abortSignal: options.abortSignal };
  const head = (await runGit(["rev-parse", "HEAD"], runOptions)).trim();
  if (head !== expectedSha) {
    throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache commit does not match its immutable identity.");
  }
  const status = await runGit([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--ignored=matching",
  ], runOptions);
  if (status.length) {
    throw new AgentGraphError(
      "repository_cache_dirty",
      "Repository acquisition cache contains modified, staged, untracked, or ignored working-tree content.",
    );
  }
  return true;
}

async function verifiedCacheRoot(cacheRoot, identity, allowedRoot) {
  const canonicalCacheRoot = await ensureRepositoryCacheRoot(cacheRoot, allowedRoot);
  const target = path.join(canonicalCacheRoot, repositoryCacheEntryName(identity));
  const verificationOptions = {
    abortSignal: identity.abortSignal,
    timeoutMs: identity.timeoutMs,
  };
  try {
    if (await verifyRepositoryCacheEntry(target, identity.sha, canonicalCacheRoot, verificationOptions)) {
      return { target, reused: true };
    }
  } catch (error) {
    if (error instanceof AgentGraphError) throw error;
    throw new AgentGraphError("repository_cache_invalid", "Repository acquisition cache entry could not be verified.");
  }
  const temporary = await fs.mkdtemp(path.join(canonicalCacheRoot, ".acquire-"));
  try {
    await runGit(["init", "--quiet"], { cwd: temporary, abortSignal: identity.abortSignal });
    await runGit(["remote", "add", "origin", identity.remoteUrl], { cwd: temporary, abortSignal: identity.abortSignal });
    await runGit(["fetch", "--quiet", "--depth=1", "origin", identity.sha], {
      cwd: temporary,
      abortSignal: identity.abortSignal,
      timeoutMs: identity.timeoutMs,
      networkPin: identity.networkPin,
    });
    await runGit(["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: temporary, abortSignal: identity.abortSignal });
    if (!(await verifyRepositoryCacheEntry(temporary, identity.sha, canonicalCacheRoot, verificationOptions))) {
      throw new AgentGraphError("repository_commit_mismatch", "Acquired repository did not match the resolved commit.");
    }
    try { await fs.rename(temporary, target); } catch (error) {
      if (error?.code !== "EEXIST" && error?.code !== "ENOTEMPTY") throw error;
      if (!(await verifyRepositoryCacheEntry(target, identity.sha, canonicalCacheRoot, verificationOptions))) {
        throw new AgentGraphError("repository_cache_invalid", "Concurrent repository cache entry failed immutable commit verification.");
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
  allowedHosts,
  allowPrivateNetwork = false,
  lookupHost,
}) {
  const networkPolicy = { allowedHosts, allowPrivateNetwork };
  const parsed = parseRepositoryUrl(repositoryUrl, networkPolicy);
  const networkPin = await resolveRepositoryNetworkPin(parsed, {
    ...networkPolicy,
    lookupHost,
  });
  const remoteOutput = await runGit(["ls-remote", "--symref", parsed.remoteUrl], {
    abortSignal,
    timeoutMs,
    networkPin,
  });
  const resolved = resolveRepositoryIdentity(parseRemoteRefs(remoteOutput), repositoryRef);
  const cache = await verifiedCacheRoot(
    cacheRoot,
    { ...parsed, ...resolved, abortSignal, timeoutMs, networkPin },
    allowedRoot,
  );
  const candidate = resolved.subpath ? path.resolve(cache.target, resolved.subpath) : cache.target;
  const real = await fs.realpath(candidate).catch(() => null);
  const relative = real ? path.relative(cache.target, real) : "..";
  if (!real || relative.startsWith("..") || path.isAbsolute(relative) || !(await fs.stat(real)).isDirectory()) {
    throw new AgentGraphError("repository_subpath_invalid", "Repository URL subpath is not a directory at the resolved commit.");
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
