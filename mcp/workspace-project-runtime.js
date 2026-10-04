import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createRepositoryPackGit } from "./repository-pack-git.js";
import { WORKSPACE_PROJECT_OPERATIONS } from "./workspace-artifact-contract.js";

const execFileAsync = promisify(execFile);
const ZERO = "0".repeat(40);
const OID = /^[0-9a-f]{40}$/u;
const MUTATIONS = new Set(["project-checkpoint", "project-import"]);
const OPERATIONS = new Set(WORKSPACE_PROJECT_OPERATIONS);
const LIMITS = Object.freeze({ maxFileBytes: 262144, maxFiles: 100, maxProjectBytes: 2097152, maxStoreBytes: 10485760, maxHistory: 100, timeoutMs: 30000 });
const ECONOMICS = Object.freeze({ networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
const CAPABILITIES = Object.freeze({ provider: "local-native-git", remoteEnabled: false, offline: true, codeExecution: false, compareAndSwap: true, importExport: true, browserStore: false });
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => sha256(Buffer.from(JSON.stringify(stable(value))));
const byteSort = (a, b) => Buffer.from(a).compare(Buffer.from(b));
const fail = (code, message, details) => { const error = new Error(message); error.code = code; if (details) error.details = details; throw error; };
const statMaybe = async target => {
  try { return await fs.lstat(target); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
};
const directory = async (target, missing = false) => {
  const stats = await statMaybe(target);
  if (!stats && missing) return false;
  if (!stats || !stats.isDirectory() || stats.isSymbolicLink()) fail("STORAGE_UNAVAILABLE", "Local store directories must exist and must not be symbolic links.");
  return true;
};

const portablePath = value => {
  if (typeof value !== "string" || !value || value.length > 1024 || value !== value.normalize("NFC")
    || value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value) || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value) fail("INVALID_INPUT", "File path must be an unambiguous portable relative path.");
  const parts = value.split("/");
  if (parts.length > 20 || parts.some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git"
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)
    || /[<>:"|?*]/u.test(part) || /[. ]$/u.test(part))) fail("INVALID_INPUT", "File path contains traversal, a reserved segment or unsupported depth.");
  return value;
};

const normalizeFiles = raw => {
  if (!Array.isArray(raw) || !raw.length || raw.length > LIMITS.maxFiles) fail("QUOTA_EXCEEDED", "A project requires 1 to 100 text files.");
  const paths = new Set(); const prefixes = new Map(); let total = 0;
  const files = raw.map(file => {
    if (!file || typeof file !== "object" || Array.isArray(file) || Object.keys(file).some(key => !["path", "content", "digest"].includes(key))) fail("INVALID_INPUT", "Files accept only path, content and optional digest.");
    const relativePath = portablePath(file.path);
    if (typeof file.content !== "string") fail("INVALID_INPUT", "File content must be UTF-8 text.");
    const bytes = Buffer.from(file.content, "utf8");
    if (bytes.toString("utf8") !== file.content || file.content.includes("\u0000")) fail("INVALID_INPUT", "File content must contain exact valid UTF-8 text.");
    if (bytes.length > LIMITS.maxFileBytes) fail("QUOTA_EXCEEDED", "A file exceeds 256 KiB.");
    total += bytes.length;
    const key = relativePath.toLowerCase();
    if (paths.has(key)) fail("INVALID_INPUT", "Project paths collide after portable normalization.");
    paths.add(key);
    const parts = relativePath.split("/");
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join("/"); const normalized = prefix.toLowerCase();
      if (prefixes.has(normalized) && prefixes.get(normalized) !== prefix) fail("INVALID_INPUT", "Directory names collide after portable normalization.");
      prefixes.set(normalized, prefix);
    }
    const contentDigest = sha256(bytes);
    if (file.digest !== undefined && file.digest !== contentDigest) fail("INVALID_INPUT", "Imported file digest does not match its exact bytes.");
    return { path: relativePath, content: file.content, digest: contentDigest, bytes: bytes.length };
  }).sort((a, b) => byteSort(a.path, b.path));
  for (const file of files) {
    const parts = file.path.toLowerCase().split("/");
    for (let i = 1; i < parts.length; i += 1) if (paths.has(parts.slice(0, i).join("/"))) fail("INVALID_INPUT", "A path cannot be both a file and a directory.");
  }
  if (total > LIMITS.maxProjectBytes) fail("QUOTA_EXCEEDED", "Project exceeds 2 MiB.");
  return files;
};

const normalizeRequest = args => {
  const allowed = new Set(["operation", "workspaceRoot", "path", "version", "expectedVersion", "files", "message", "planDigest", "operatorAuthorized"]);
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(key => !allowed.has(key))) fail("INVALID_INPUT", "Project requests use a closed local-only contract.");
  const operation = args.operation;
  if (!OPERATIONS.has(operation)) fail("INVALID_INPUT", "Unsupported project operation; remote operations are disabled.");
  if (typeof args.workspaceRoot !== "string" || !path.isAbsolute(args.workspaceRoot)) fail("INVALID_INPUT", "workspaceRoot must name an explicitly configured absolute local store.");
  const projectId = args.path;
  const global = operation === "project-discover" || operation === "project-list";
  if (global ? projectId !== "_" : typeof projectId !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(projectId)) fail("INVALID_INPUT", "path must be a project slug, or _ for discovery and listing.");
  if (args.version !== undefined && !OID.test(args.version)) fail("INVALID_INPUT", "version must be an immutable 40-hex Git commit.");
  if (args.message !== undefined && (typeof args.message !== "string" || args.message.length > 200 || /[\u0000-\u001f\u007f]/u.test(args.message))) fail("INVALID_INPUT", "Checkpoint message must be one bounded text line.");
  if (MUTATIONS.has(operation) && (typeof args.expectedVersion !== "string" || (args.expectedVersion !== "" && !OID.test(args.expectedVersion)))) fail("INVALID_INPUT", "Mutations require expectedVersion, empty for a new project.");
  if (operation === "project-import" && (!Array.isArray(args.files) || args.files.some(file => !file || !/^[0-9a-f]{64}$/u.test(file.digest)))) fail("INVALID_INPUT", "Every imported file requires its exact SHA-256 digest.");
  return {
    operation, workspaceRoot: path.resolve(args.workspaceRoot), path: projectId,
    ...(args.version !== undefined ? { version: args.version } : {}),
    ...(MUTATIONS.has(operation) ? { expectedVersion: args.expectedVersion, files: normalizeFiles(args.files), message: args.message || "Project checkpoint" } : {}),
  };
};

const storeBytes = async root => {
  let total = 0; let count = 0;
  const scan = async (target, depth) => {
    if (depth > 32 || ++count > 10000) fail("QUOTA_EXCEEDED", "Local store inventory exceeds its bound.");
    const stats = await fs.lstat(target);
    if (stats.isSymbolicLink()) fail("STORAGE_UNAVAILABLE", "Symbolic links are forbidden within the local store.");
    if (stats.isDirectory()) { for (const name of await fs.readdir(target)) await scan(path.join(target, name), depth + 1); }
    else if (stats.isFile()) {
      if (stats.size >= 500000) fail("QUOTA_EXCEEDED", "A stored object or chunk exceeds its bound.");
      total += stats.size;
      if (total > LIMITS.maxStoreBytes) fail("QUOTA_EXCEEDED", "Local store exceeds 10 MiB.");
    } else fail("STORAGE_UNAVAILABLE", "Unsupported local store entry.");
  };
  if (await statMaybe(root)) await scan(root, 0);
  return total;
};

export const createWorkspaceProjectRuntime = ({ rootDir, env = process.env } = {}) => {
  let configured;
  try { configured = env.AGENTIC_OS_WORKSPACE_ARTIFACT_ROOTS?.trim() ? JSON.parse(env.AGENTIC_OS_WORKSPACE_ARTIFACT_ROOTS) : [rootDir]; }
  catch { fail("INVALID_INPUT", "Configured workspace roots must be a JSON array."); }
  if (!Array.isArray(configured) || configured.some(root => typeof root !== "string" || !root.trim())) fail("INVALID_INPUT", "Configured workspace roots must be nonempty paths.");
  const roots = configured.map(root => path.resolve(root));

  const context = async args => {
    const request = normalizeRequest(args);
    if (!roots.includes(request.workspaceRoot)) fail("FORBIDDEN", "workspaceRoot is not an explicitly configured local store.");
    await directory(request.workspaceRoot);
    if (await fs.realpath(request.workspaceRoot) !== request.workspaceRoot) fail("FORBIDDEN", "workspaceRoot must not resolve through a symbolic link.");
    for (const name of [".git", "HEAD", "objects"]) if (await statMaybe(path.join(request.workspaceRoot, name))) fail("FORBIDDEN", "Choose an isolated local store directory rather than an existing Git repository root.");
    const storeRoot = path.join(request.workspaceRoot, ".workspace-project");
    const reposRoot = path.join(storeRoot, "repos");
    await directory(storeRoot, true); await directory(reposRoot, true);
    const repo = path.join(reposRoot, `${request.path}.git`);
    const exists = await directory(repo, true);
    const deadline = Date.now() + LIMITS.timeoutMs;
    const assertActive = () => { if (Date.now() >= deadline) fail("RUNTIME_LIMIT_EXCEEDED", "Local Git operation exceeded 30 seconds."); };
    const git = createRepositoryPackGit({
      execFileImpl: (command, commandArgs, options) => execFileAsync(command, commandArgs, { ...options, maxBuffer: 499999 }),
      hostEnvironment: env.PATH ? env : { ...env, PATH: process.env.PATH },
      remainingRuntime: () => { assertActive(); return deadline - Date.now(); },
      assertActive, canonicalRelativePath: portablePath,
    });
    const run = async (commandArgs, allowed = []) => {
      try { return (await git.run(repo, ["--no-replace-objects", "-c", "core.fsync=committed", ...commandArgs], "GIT_INVENTORY_FAILED", allowed)).stdout; }
      catch (error) { if (error.code === "RUNTIME_LIMIT_EXCEEDED") throw error; fail("STORAGE_UNAVAILABLE", "Native local Git could not complete the bounded operation."); }
    };
    const readHead = async () => {
      if (!await directory(repo, true)) return "";
      await storeBytes(storeRoot);
      const config = await fs.readFile(path.join(repo, "config"), "utf8");
      if (/^\s*\[(?:include|includeIf|remote|extensions)(?:\s|\])/imu.test(config)) fail("STORAGE_UNAVAILABLE", "Project repositories must not configure external storage or transports.");
      for (const name of ["alternates", "http-alternates"]) {
        if (await statMaybe(path.join(repo, "objects", "info", name))) fail("STORAGE_UNAVAILABLE", "Project object storage must remain inside its configured local repository.");
      }
      if ((await run(["rev-parse", "--is-bare-repository"])).toString().trim() !== "true") fail("STORAGE_UNAVAILABLE", "Project storage must be a local bare Git repository.");
      const value = (await run(["rev-parse", "--verify", "--quiet", "refs/heads/project"], [1])).toString().trim();
      if (value && !OID.test(value)) fail("STORAGE_UNAVAILABLE", "Project ref is not a supported Git object identity.");
      return value;
    };
    return { request, storeRoot, reposRoot, repo, exists, run, git, readHead, assertActive };
  };

  const readFiles = async (ctx, version) => {
    const kind = (await ctx.run(["cat-file", "-t", version], [128])).toString().trim();
    if (!kind) fail("NOT_FOUND", "Immutable project version was not found in this local store.");
    if (kind !== "commit") fail("INVALID_INPUT", "version does not identify a project commit.");
    const tree = await ctx.run(["ls-tree", "-r", "-z", version]);
    const entries = tree.toString("utf8").split("\u0000").filter(Boolean);
    if (entries.length > LIMITS.maxFiles) fail("QUOTA_EXCEEDED", "Stored project exceeds its file count.");
    const files = [];
    for (const entry of entries) {
      const match = /^100644 blob ([0-9a-f]{40})\t(.+)$/u.exec(entry);
      if (!match) fail("INVALID_INPUT", "Stored tree contains an unsupported entry kind.");
      const relativePath = portablePath(match[2]);
      const size = Number((await ctx.run(["cat-file", "-s", match[1]])).toString().trim());
      if (!Number.isSafeInteger(size) || size > LIMITS.maxFileBytes) fail("QUOTA_EXCEEDED", "Stored file exceeds 256 KiB.");
      const bytes = await ctx.run(["cat-file", "blob", match[1]]);
      const content = bytes.toString("utf8");
      if (!Buffer.from(content, "utf8").equals(bytes)) fail("INVALID_INPUT", "Stored file is not exact UTF-8 text.");
      files.push({ path: relativePath, content, digest: sha256(bytes), bytes: bytes.length });
    }
    return normalizeFiles(files.map(({ bytes, ...file }) => file));
  };
  const history = async (ctx, version) => {
    const raw = (await ctx.run(["log", "--first-parent", `--max-count=${LIMITS.maxHistory}`, "--format=%H%x00%P%x00%s", version])).toString("utf8");
    return raw.trimEnd().split("\n").filter(Boolean).map(line => {
      const [commit, parents, message] = line.split("\u0000");
      return { version: commit, message, ...(parents ? { parent: parents.split(" ")[0] } : {}) };
    });
  };

  const plan = async (args = {}) => {
    const ctx = await context(args); const { request } = ctx;
    let currentHead = request.path === "_" ? "" : await ctx.readHead(); let data;
    if (request.operation === "project-discover") data = { projectContract: "VERSIONED-WORKSPACE-001", surfaces: ["localhost-http", "local-mcp", "browser-webmcp"], disabled: ["remote", "paid-providers", "model-inference"], storageRequired: "configured host directory + native Git", durability: "native Git objects and expected-old ref updates", lockRecovery: "A stopped writer can leave .writer.lock; preserve data and explicitly remove only a verified abandoned lock." };
    if (request.operation === "project-list") {
      const names = await directory(ctx.reposRoot, true) ? (await fs.readdir(ctx.reposRoot)).sort(byteSort) : [];
      if (names.length > 100) fail("QUOTA_EXCEEDED", "Project listing exceeds 100 repositories.");
      const projects = [];
      for (const name of names) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}\.git$/u.test(name)) fail("STORAGE_UNAVAILABLE", "Local repository inventory contains an unexpected path.");
        const id = name.slice(0, -4);
        const child = await context({ operation: "project-inspect", workspaceRoot: request.workspaceRoot, path: id });
        const version = await child.readHead(); if (version) projects.push({ id, version });
      }
      data = { projects };
    }
    if (request.operation === "project-inspect" || request.operation === "project-export") {
      const version = request.version || currentHead;
      if (!version) fail("NOT_FOUND", "Project has no checkpoint.");
      const files = await readFiles(ctx, version);
      data = request.operation === "project-export"
        ? { schemaVersion: "agentic-graph-project-export/v1", projectId: request.path, version, files: files.map(({ bytes, ...file }) => file) }
        : { projectId: request.path, version, files, history: await history(ctx, version) };
    }
    if (MUTATIONS.has(request.operation)) {
      if (request.expectedVersion !== currentHead) fail("VERSION_CONFLICT", "Project changed; retain the draft and reconcile explicitly.", { expectedVersion: request.expectedVersion, currentVersion: currentHead });
      const bytes = request.files.reduce((total, file) => total + file.bytes, 0);
      const retainedBytes = await storeBytes(ctx.storeRoot);
      // Reserve raw blobs, portable tree names, object framing and one transient
      // staging chunk before creating objects. Deduplication only improves this bound.
      const pathBytes = request.files.reduce((total, file) => total + Buffer.byteLength(file.path), 0);
      const reserveBytes = bytes + pathBytes + request.files.length * 4096 + LIMITS.maxFileBytes + 65536;
      if (retainedBytes + reserveBytes > LIMITS.maxStoreBytes) fail("QUOTA_EXCEEDED", "Checkpoint cannot fit within the 10 MiB local store bound.");
      data = { projectId: request.path, expectedVersion: request.expectedVersion, files: request.files.map(({ content, ...file }) => file), retainedBytes, draftRetainedByCaller: true };
    }
    const wireRequest = MUTATIONS.has(request.operation) ? { ...request, files: request.files.map(({ bytes, ...file }) => file) } : request;
    const core = { schemaVersion: "agentic-graph-workspace-artifact-plan/v1", operation: request.operation, request: wireRequest, effect: MUTATIONS.has(request.operation) ? "checkpoint" : "inspect", currentHead, data, store: { surface: "localhost-host-git", workspaceRoot: request.workspaceRoot }, limits: LIMITS, capabilities: CAPABILITIES, economics: ECONOMICS };
    return { ok: true, ...core, planDigest: digest(core) };
  };

  const writeObject = async (ctx, stage, type, bytes) => {
    ctx.assertActive();
    if (bytes.length >= 500000) fail("QUOTA_EXCEEDED", "Git object input exceeds the chunk bound.");
    if (await storeBytes(ctx.storeRoot) + 2 * bytes.length + 1024 > LIMITS.maxStoreBytes) fail("QUOTA_EXCEEDED", "Object staging and publication cannot fit in the 10 MiB local store.");
    const temporary = path.join(stage, randomUUID());
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try {
      const oid = (await ctx.run(["hash-object", "-w", "--no-filters", "-t", type, "--", temporary])).toString().trim();
      if (!OID.test(oid)) fail("STORAGE_UNAVAILABLE", "Native Git returned an unsupported object identity.");
      return oid;
    } finally { await fs.unlink(temporary); }
  };
  const writeTree = async (ctx, stage, files) => {
    const root = new Map();
    for (const file of files) {
      const segments = file.path.split("/"); let node = root;
      for (const segment of segments.slice(0, -1)) { if (!node.has(segment)) node.set(segment, new Map()); node = node.get(segment); }
      node.set(segments.at(-1), await writeObject(ctx, stage, "blob", Buffer.from(file.content, "utf8")));
    }
    const build = async node => {
      const entries = [...node].sort(([a, av], [b, bv]) => byteSort(a + (av instanceof Map ? "/" : ""), b + (bv instanceof Map ? "/" : "")));
      const parts = [];
      for (const [name, value] of entries) {
        const folder = value instanceof Map; const oid = folder ? await build(value) : value;
        parts.push(Buffer.from(`${folder ? "40000" : "100644"} ${name}\u0000`), Buffer.from(oid, "hex"));
      }
      return writeObject(ctx, stage, "tree", Buffer.concat(parts));
    };
    return build(root);
  };

  const apply = async (args = {}) => {
    const current = await plan(args);
    if (current.planDigest !== args.planDigest) fail("PLAN_STALE", "Plan digest is stale or does not bind this exact request.");
    if (!MUTATIONS.has(current.operation)) return { ...current, schemaVersion: "agentic-graph-workspace-artifact-apply/v1", readBack: current.data };
    if (args.operatorAuthorized !== true) fail("FORBIDDEN", "Checkpoint requires explicit operator authorization.");
    const ctx = await context(args);
    await fs.mkdir(ctx.storeRoot, { recursive: false, mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    await directory(ctx.storeRoot);
    const lock = path.join(ctx.storeRoot, ".writer.lock");
    try { await fs.mkdir(lock, { mode: 0o700 }); } catch (error) { if (error.code === "EEXIST") fail("RESOURCE_BUSY", "Another local writer holds the store reservation; retain the draft."); throw error; }
    let stage;
    try {
      const locked = await plan(args);
      if (locked.planDigest !== current.planDigest) fail("PLAN_STALE", "Local store changed after checkpoint planning.");
      await fs.mkdir(ctx.reposRoot, { recursive: false, mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
      await directory(ctx.reposRoot);
      if (!await directory(ctx.repo, true)) {
        await fs.mkdir(ctx.repo, { mode: 0o700 });
        await ctx.run(["init", "--bare", "--object-format=sha1", "--template=", "."]);
      }
      stage = await fs.mkdtemp(path.join(ctx.storeRoot, ".stage-"));
      await fs.chmod(stage, 0o700);
      const tree = await writeTree(ctx, stage, ctx.request.files);
      const stamp = Math.floor(Date.now() / 1000);
      const commit = Buffer.from(`tree ${tree}\n${ctx.request.expectedVersion ? `parent ${ctx.request.expectedVersion}\n` : ""}author Workspace <workspace@localhost> ${stamp} +0000\ncommitter Workspace <workspace@localhost> ${stamp} +0000\n\n${ctx.request.message}\n`);
      const version = await writeObject(ctx, stage, "commit", commit);
      await storeBytes(ctx.storeRoot);
      try { await ctx.run(["update-ref", "refs/heads/project", version, ctx.request.expectedVersion || ZERO]); }
      catch (error) {
        const actual = await ctx.readHead();
        if (actual !== ctx.request.expectedVersion) fail("VERSION_CONFLICT", "Native Git rejected a stale expected project head; retain the draft.", { expectedVersion: ctx.request.expectedVersion, currentVersion: actual, retainedVersion: version });
        throw error;
      }
      if (await ctx.readHead() !== version) fail("STORAGE_UNAVAILABLE", "Project head readback did not match its checkpoint.");
      const files = await readFiles(ctx, version);
      if (digest(files) !== digest(ctx.request.files)) fail("STORAGE_UNAVAILABLE", "Checkpoint file readback differs from authored bytes.");
      const data = { projectId: ctx.request.path, version, files, history: await history(ctx, version) };
      const result = { ok: true, schemaVersion: "agentic-graph-workspace-artifact-apply/v1", operation: current.operation, planDigest: current.planDigest, version, data, readBack: data, store: current.store, limits: LIMITS, capabilities: CAPABILITIES, economics: ECONOMICS };
      return { ...result, receiptDigest: digest(result) };
    } finally {
      if (stage) await fs.rm(stage, { recursive: true, force: true });
      await fs.rmdir(lock);
    }
  };
  const protect = async task => {
    try { return await task(); }
    catch (error) {
      if (["INVALID_INPUT", "FORBIDDEN", "NOT_FOUND", "QUOTA_EXCEEDED", "VERSION_CONFLICT", "PLAN_STALE", "RESOURCE_BUSY", "STORAGE_UNAVAILABLE", "RUNTIME_LIMIT_EXCEEDED"].includes(error.code)) throw error;
      fail("STORAGE_UNAVAILABLE", "Local project storage could not complete this operation; retain the draft.");
    }
  };
  return Object.freeze({ plan: args => protect(() => plan(args)), apply: args => protect(() => apply(args)) });
};
