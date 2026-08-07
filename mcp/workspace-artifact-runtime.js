import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  WORKSPACE_ARTIFACT_APPLY_TOOL_NAME,
  WORKSPACE_ARTIFACT_PLAN_TOOL_NAME,
} from "./workspace-artifact-contract.js";

const PLAN_SCHEMA = "knowgrph-workspace-artifact-plan/v1";
const APPLY_SCHEMA = "knowgrph-workspace-artifact-apply/v1";
const MAX_BYTES = 1024 * 1024;
const MAX_FOLDER_ENTRIES = 500;
const ECONOMICS = Object.freeze({ networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
const MUTATIONS = new Set(["create-file", "create-folder", "update-file", "import-file", "export-file", "trash-file"]);

const digestBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const digestValue = (value) => digestBytes(Buffer.from(JSON.stringify(canonical(value))));
const within = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const parseRoots = (raw, fallback = []) => {
  if (!raw?.trim()) return fallback.map((item) => path.resolve(item));
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Workspace artifact roots must be a JSON string array."); }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || !item.trim())) throw new Error("Workspace artifact roots must be a JSON string array.");
  return [...new Set(parsed.map((item) => path.resolve(item)))];
};

const normalizeRelativePath = (value, label) => {
  if (typeof value !== "string" || !value || value.length > 1024) throw new Error(`${label} must be a non-empty bounded relative path.`);
  if (value.includes("\\") || /[\u0000-\u001f]/u.test(value) || path.posix.isAbsolute(value)) throw new Error(`${label} is not a portable relative path.`);
  const normalized = path.posix.normalize(value);
  const parts = normalized.split("/");
  if (normalized !== value || parts.some((part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error(`${label} contains traversal, ambiguity, or a reserved Git segment.`);
  return normalized;
};

const lstatMaybe = async (candidate) => {
  try { return await fs.lstat(candidate); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
};
const assertRegularKind = (stats, label, { folder = false } = {}) => {
  if (!stats) return;
  if (stats.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link.`);
  if (folder ? !stats.isDirectory() : !stats.isFile()) throw new Error(`${label} has an unsupported entry kind.`);
};
const assertNoSymlinkComponents = async (root, candidate, { allowMissingLeaf = false } = {}) => {
  const relative = path.relative(root, candidate);
  if (!within(root, candidate)) throw new Error("Path escapes its configured root.");
  let cursor = root;
  for (const [index, part] of relative.split(path.sep).filter(Boolean).entries()) {
    cursor = path.join(cursor, part);
    const stats = await lstatMaybe(cursor);
    if (!stats) {
      if (allowMissingLeaf && index === relative.split(path.sep).filter(Boolean).length - 1) return;
      throw new Error(`Missing path component: ${cursor}`);
    }
    if (stats.isSymbolicLink()) throw new Error(`Symbolic-link traversal is forbidden: ${cursor}`);
  }
};
const resolveConfiguredRoot = async (requested, roots) => {
  const absolute = path.resolve(requested);
  if (!roots.includes(absolute)) throw new Error("workspaceRoot is not an explicitly configured root.");
  const stats = await fs.lstat(absolute);
  assertRegularKind(stats, "workspaceRoot", { folder: true });
  if (await fs.realpath(absolute) !== absolute) throw new Error("workspaceRoot must not resolve through a symbolic link.");
  return absolute;
};
const resolveExternalPath = async (requested, roots, { allowMissingLeaf = false } = {}) => {
  if (typeof requested !== "string" || !path.isAbsolute(requested)) throw new Error("External path must be absolute.");
  const absolute = path.resolve(requested);
  const root = roots.find((candidate) => within(candidate, absolute));
  if (!root) throw new Error("External path is outside configured external roots.");
  await assertNoSymlinkComponents(root, absolute, { allowMissingLeaf });
  return absolute;
};
const inspectFile = async (candidate) => {
  const stats = await lstatMaybe(candidate);
  if (!stats) return { kind: "missing" };
  assertRegularKind(stats, candidate);
  if (stats.size > MAX_BYTES) throw new Error(`File exceeds ${MAX_BYTES} bytes.`);
  const bytes = await fs.readFile(candidate);
  return { kind: "file", bytes: bytes.length, digest: digestBytes(bytes) };
};
const inspectFolder = async (candidate) => {
  const stats = await lstatMaybe(candidate);
  if (!stats) return { kind: "missing" };
  assertRegularKind(stats, candidate, { folder: true });
  const names = (await fs.readdir(candidate)).sort();
  if (names.length > MAX_FOLDER_ENTRIES) throw new Error(`Folder exceeds ${MAX_FOLDER_ENTRIES} direct entries.`);
  return { kind: "folder", entries: names };
};
const normalizeRequest = (args) => ({
  operation: String(args.operation || ""),
  workspaceRoot: String(args.workspaceRoot || ""),
  path: String(args.path || ""),
  ...(args.sourcePath ? { sourcePath: String(args.sourcePath) } : {}),
  ...(args.destinationPath ? { destinationPath: String(args.destinationPath) } : {}),
  ...(args.trashPath ? { trashPath: String(args.trashPath) } : {}),
  ...(Object.hasOwn(args, "content") ? { content: String(args.content) } : {}),
  ...(args.expectedDigest ? { expectedDigest: String(args.expectedDigest) } : {}),
  collisionPolicy: args.collisionPolicy || "fail",
});

export const createWorkspaceArtifactRuntime = ({ rootDir, env = process.env } = {}) => {
  const workspaceRoots = parseRoots(env.KNOWGRPH_WORKSPACE_ARTIFACT_ROOTS, [rootDir]);
  const externalRoots = parseRoots(env.KNOWGRPH_WORKSPACE_ARTIFACT_EXTERNAL_ROOTS);

  const plan = async (args = {}) => {
    const request = normalizeRequest(args);
    if (!["inspect", "create-file", "create-folder", "update-file", "import-file", "export-file", "trash-file"].includes(request.operation)) throw new Error("Unsupported workspace artifact operation.");
    if (!["fail", "verify-identical"].includes(request.collisionPolicy)) throw new Error("Unsupported collision policy.");
    const workspaceRoot = await resolveConfiguredRoot(request.workspaceRoot, workspaceRoots);
    const relativePath = normalizeRelativePath(request.path, "path");
    const targetPath = path.join(workspaceRoot, ...relativePath.split("/"));
    await assertNoSymlinkComponents(workspaceRoot, targetPath, { allowMissingLeaf: true });
    let observed; let effect; let sourcePath; let destinationPath; let contentDigest;
    if (request.operation === "create-folder") {
      observed = await inspectFolder(targetPath);
      effect = observed.kind === "missing" ? "create-folder" : request.collisionPolicy === "verify-identical" && observed.kind === "folder" ? "reuse" : "collision";
    } else if (request.operation === "export-file") {
      observed = { source: await inspectFile(targetPath) };
      if (observed.source.kind !== "file") throw new Error("Export source must be a regular file.");
      destinationPath = await resolveExternalPath(request.destinationPath, externalRoots, { allowMissingLeaf: true });
      observed.destination = await inspectFile(destinationPath);
      effect = observed.destination.kind === "missing" ? "write" : request.collisionPolicy === "verify-identical" && observed.destination.digest === observed.source.digest ? "reuse" : "collision";
      contentDigest = observed.source.digest;
    } else if (request.operation === "trash-file") {
      observed = { source: await inspectFile(targetPath) };
      if (observed.source.kind !== "file" || observed.source.digest !== request.expectedDigest) throw new Error("Trash requires the exact current file digest.");
      const trashRelative = normalizeRelativePath(request.trashPath, "trashPath");
      destinationPath = path.join(workspaceRoot, ...trashRelative.split("/"));
      await assertNoSymlinkComponents(workspaceRoot, destinationPath, { allowMissingLeaf: true });
      observed.destination = await inspectFile(destinationPath);
      effect = observed.destination.kind === "missing" ? "trash" : "collision";
    } else {
      observed = request.operation === "inspect" && (await lstatMaybe(targetPath))?.isDirectory()
        ? await inspectFolder(targetPath) : await inspectFile(targetPath);
      if (request.operation === "inspect") effect = "inspect";
      if (request.operation === "create-file" || request.operation === "update-file") {
        const bytes = Buffer.from(request.content ?? "", "utf8");
        if (bytes.length > MAX_BYTES) throw new Error(`Content exceeds ${MAX_BYTES} bytes.`);
        contentDigest = digestBytes(bytes);
      }
      if (request.operation === "import-file") {
        sourcePath = await resolveExternalPath(request.sourcePath, externalRoots);
        const source = await inspectFile(sourcePath);
        if (source.kind !== "file") throw new Error("Import source must be a regular file.");
        observed = { source, target: observed };
        contentDigest = source.digest;
      }
      const current = observed.target || observed;
      if (request.operation === "create-file" || request.operation === "import-file") effect = current.kind === "missing" ? "write" : request.collisionPolicy === "verify-identical" && current.digest === contentDigest ? "reuse" : "collision";
      if (request.operation === "update-file") {
        if (current.kind !== "file" || current.digest !== request.expectedDigest) throw new Error("Update requires the exact current file digest.");
        effect = current.digest === contentDigest ? "reuse" : "replace";
      }
    }
    if (effect === "collision") throw new Error("Destination collision does not match the selected policy.");
    const core = { schemaVersion: PLAN_SCHEMA, operation: request.operation, request, workspaceRoot, targetPath, ...(sourcePath ? { sourcePath } : {}), ...(destinationPath ? { destinationPath } : {}), observed, effect, ...(contentDigest ? { contentDigest } : {}), bounds: { maxBytes: MAX_BYTES, maxFolderEntries: MAX_FOLDER_ENTRIES }, economics: ECONOMICS };
    return Object.freeze({ ok: true, ...core, planDigest: digestValue(core) });
  };

  const publishBytes = async (destination, bytes, { replace = false } = {}) => {
    const temporary = `${destination}.workspace-artifact-${randomUUID()}.tmp`;
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    if (digestBytes(await fs.readFile(temporary)) !== digestBytes(bytes)) throw new Error("Staged write digest mismatch.");
    try {
      if (replace) await fs.rename(temporary, destination);
      else { await fs.link(temporary, destination); await fs.unlink(temporary); }
    } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error; }
    const readBack = await inspectFile(destination);
    if (readBack.digest !== digestBytes(bytes)) throw new Error("Published write read-back mismatch.");
    return readBack;
  };

  const apply = async (args = {}) => {
    const expectedPlanDigest = String(args.planDigest || "");
    const current = await plan(args);
    if (current.planDigest !== expectedPlanDigest) throw new Error("Plan digest is stale or does not match this request.");
    if (MUTATIONS.has(current.operation) && args.operatorAuthorized !== true) throw new Error("Mutation requires explicit operatorAuthorized=true.");
    let readBack = current.observed; let recovery = null;
    if (current.effect === "create-folder") { await fs.mkdir(current.targetPath); readBack = await inspectFolder(current.targetPath); }
    if (current.effect === "write" || current.effect === "replace") {
      const source = current.sourcePath || (current.operation === "export-file" ? current.targetPath : null);
      const bytes = source ? await fs.readFile(source) : Buffer.from(current.request.content ?? "", "utf8");
      const destination = current.destinationPath || current.targetPath;
      readBack = await publishBytes(destination, bytes, { replace: current.effect === "replace" });
      recovery = current.effect === "replace" ? { priorDigest: current.request.expectedDigest } : { disposition: "remove-created-file" };
    }
    if (current.effect === "trash") { await fs.rename(current.targetPath, current.destinationPath); readBack = await inspectFile(current.destinationPath); recovery = { restoreFrom: current.destinationPath, restoreTo: current.targetPath }; }
    const result = { ok: true, schemaVersion: APPLY_SCHEMA, operation: current.operation, planDigest: current.planDigest, effect: current.effect, readBack, recovery, economics: ECONOMICS };
    return Object.freeze({ ...result, receiptDigest: digestValue(result) });
  };

  return Object.freeze({ plan, apply, supports: (name) => name === WORKSPACE_ARTIFACT_PLAN_TOOL_NAME || name === WORKSPACE_ARTIFACT_APPLY_TOOL_NAME, run: (name, args) => name === WORKSPACE_ARTIFACT_PLAN_TOOL_NAME ? plan(args) : apply(args) });
};
