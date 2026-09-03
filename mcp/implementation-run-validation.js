import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { loadAgentSandboxPolicy, authorizeAgentSandboxOperation } from "./agent-sandbox-policy-runtime.js";
import { buildAgenticCanvasOsDocsCatalog } from "./agentic-canvas-os-docs-core.mjs";
import { assertFileProof, executableProof, fileProof } from "./implementation-run-managed-process.js";
import { readRuntimeReadinessContract, resolveRuntimeDocsDependency } from "../scripts/runtime-readiness-contract.mjs";

const execFileAsync = promisify(execFile);
const REQUIRED_BINDINGS = Object.freeze(["@work-item", "@implementation-run"]);
const REQUIRED_TOKENS = Object.freeze(["/implementation.run", "#managed-implementation-run", ...REQUIRED_BINDINGS]);
const SPEC_KEYS = new Set(["invocation", "workItem", "repoRoot", "worktreeRoot", "agenticCanvasOsRoot", "semanticScope", "runnerId", "sandboxPolicyPath", "agenticSdlcLedgerPath", "allowedPaths", "verification", "idempotencyKey", "bounds"]);
const INVOCATION_KEYS = new Set(["action", "semantic", "bindings"]);
const WORK_KEYS = new Set(["id", "objective", "acceptance"]);
const BOUNDS_KEYS = new Set(["maxAttempts", "maxRuntimeMs", "maxOutputBytes", "leaseTtlSeconds"]);
const VERIFICATION_KEYS = new Set(["profileId"]);
const SAFE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SAFE_SCOPE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ENVIRONMENT_NAME = /^[A-Z_][A-Z0-9_]*$/;
const SHA = /^[a-f0-9]{40}$/;
const ALLOWED_PLACEHOLDERS = new Set(["{{requestPath}}", "{{workspacePath}}", "{{runId}}"]);
const MAX_SPEC_BYTES = 128 * 1024;
const MAX_REGISTRY_BYTES = 256 * 1024;
const MAX_REGISTRY_TOTAL_BYTES = 512 * 1024;
const MAX_PROFILE_ARG_BYTES = 8 * 1024;
const MAX_PROFILE_ENV_BYTES = 4096;
const MAX_POLICY_BYTES = 256 * 1024;

const record = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";
const unknownKeys = (value, allowed, field, errors) => {
  if (!record(value)) { errors.push(`${field} must be an object.`); return; }
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${field}.${key} is not supported.`);
};
const boundedInteger = (value, minimum, maximum, field, errors) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) errors.push(`${field} must be an integer from ${minimum} to ${maximum}.`);
};
const within = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
const safeRelativePath = (value) => {
  const normalized = text(value).replaceAll("\\", "/");
  if (!normalized || path.posix.isAbsolute(normalized) || /[\x00-\x1f]/.test(normalized)) return "";
  const canonical = path.posix.normalize(normalized).replace(/^\.\//, "").replace(/\/$/, "");
  if (!canonical || canonical === "." || canonical === ".." || canonical.startsWith("../")) return "";
  if (canonical === ".git" || canonical.startsWith(".git/") || canonical === ".agentic-graph-workspace" || canonical.startsWith(".agentic-graph-workspace/")) return "";
  return canonical;
};
const inspectAllowedPath = async (root, relativePath, diagnostics) => {
  let current = root;
  for (const part of relativePath.split("/")) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        diagnostics.push({ code: "allowed_path_symlink", message: `allowedPaths contains a symbolic-link component: ${relativePath}` });
        return;
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      diagnostics.push({ code: "allowed_path_unavailable", message: error.message });
      return;
    }
  }
};

export function validateImplementationRunSpec(raw) {
  const errors = [];
  try { if (Buffer.byteLength(JSON.stringify(raw)) > MAX_SPEC_BYTES) errors.push(`spec must serialize to at most ${MAX_SPEC_BYTES} UTF-8 bytes.`); } catch { errors.push("spec must be JSON serializable."); }
  unknownKeys(raw, SPEC_KEYS, "spec", errors);
  unknownKeys(raw?.invocation, INVOCATION_KEYS, "invocation", errors);
  unknownKeys(raw?.workItem, WORK_KEYS, "workItem", errors);
  unknownKeys(raw?.bounds, BOUNDS_KEYS, "bounds", errors);
  if (raw?.invocation?.action !== "/implementation.run") errors.push("invocation.action must equal /implementation.run.");
  if (raw?.invocation?.semantic !== "#managed-implementation-run") errors.push("invocation.semantic must equal #managed-implementation-run.");
  const bindings = Array.isArray(raw?.invocation?.bindings) ? [...new Set(raw.invocation.bindings.map(text).filter(Boolean))] : [];
  if (!Array.isArray(raw?.invocation?.bindings) || bindings.length !== raw.invocation.bindings.length || bindings.length < 2 || bindings.length > 16) errors.push("invocation.bindings must contain 2-16 unique non-empty tokens.");
  for (const binding of REQUIRED_BINDINGS) if (!bindings.includes(binding)) errors.push(`invocation.bindings must include ${binding}.`);
  if (bindings.some((binding) => !/^@[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(binding))) errors.push("invocation.bindings contains an invalid @ token.");

  const workItem = raw?.workItem;
  if (!SAFE_ID.test(text(workItem?.id)) || text(workItem?.id).length > 120) errors.push("workItem.id must be a bounded provider-neutral identifier.");
  if (!text(workItem?.objective) || text(workItem?.objective).length > 4096) errors.push("workItem.objective must contain 1-4096 characters.");
  if (!Array.isArray(workItem?.acceptance) || workItem.acceptance.length < 1 || workItem.acceptance.length > 50 || workItem.acceptance.some((entry) => !text(entry) || text(entry).length > 4096)) errors.push("workItem.acceptance must contain 1-50 non-empty bounded strings.");

  for (const field of ["repoRoot", "worktreeRoot", "agenticCanvasOsRoot"]) if (!path.isAbsolute(text(raw?.[field]))) errors.push(`${field} must be an absolute path.`);
  if (!SAFE_SCOPE.test(text(raw?.semanticScope)) || text(raw?.semanticScope).length > 100) errors.push("semanticScope must be a bounded lowercase hyphenated ACOS scope.");
  if (!SAFE_ID.test(text(raw?.runnerId)) || text(raw?.runnerId).length > 120) errors.push("runnerId must be a bounded provider-neutral identifier.");
  if (!text(raw?.idempotencyKey) || text(raw?.idempotencyKey).length < 8 || text(raw?.idempotencyKey).length > 200) errors.push("idempotencyKey must contain 8-200 characters.");
  if (!text(raw?.sandboxPolicyPath) || path.isAbsolute(text(raw?.sandboxPolicyPath)) || !safeRelativePath(raw?.sandboxPolicyPath)) errors.push("sandboxPolicyPath must be a safe repository-relative path.");
  const allowedPaths = Array.isArray(raw?.allowedPaths) ? [...new Set(raw.allowedPaths.map(safeRelativePath).filter(Boolean))] : [];
  if (!Array.isArray(raw?.allowedPaths) || allowedPaths.length !== raw.allowedPaths.length || allowedPaths.length < 1 || allowedPaths.length > 100) errors.push("allowedPaths must contain 1-100 unique safe repository-relative paths outside .git and runtime state.");
  const ledgerPath = raw?.agenticSdlcLedgerPath === undefined
    ? ""
    : safeRelativePath(raw.agenticSdlcLedgerPath);
  if (raw?.agenticSdlcLedgerPath !== undefined && !ledgerPath) {
    errors.push("agenticSdlcLedgerPath must be a safe repository-relative path.");
  }
  if (
    ledgerPath
    && !allowedPaths.some((allowed) => (
      ledgerPath === allowed || ledgerPath.startsWith(`${allowed}/`)
    ))
  ) {
    errors.push("agenticSdlcLedgerPath must be contained by allowedPaths.");
  }

  const verification = Array.isArray(raw?.verification) ? raw.verification : [];
  if (verification.length < 1 || verification.length > 25) errors.push("verification must contain 1-25 host-owned verifier profiles.");
  const normalizedVerification = verification.map((step, index) => {
    unknownKeys(step, VERIFICATION_KEYS, `verification[${index}]`, errors);
    const profileId = text(step?.profileId);
    if (!SAFE_ID.test(profileId) || profileId.length > 120) errors.push(`verification[${index}].profileId must be a bounded host verifier identifier.`);
    return { profileId };
  });
  if (new Set(normalizedVerification.map((step) => step.profileId)).size !== normalizedVerification.length) errors.push("verification profileId entries must be unique.");

  const bounds = raw?.bounds || {};
  boundedInteger(bounds.maxAttempts, 1, 5, "bounds.maxAttempts", errors);
  boundedInteger(bounds.maxRuntimeMs, 1000, 86400000, "bounds.maxRuntimeMs", errors);
  boundedInteger(bounds.maxOutputBytes, 1024, 10485760, "bounds.maxOutputBytes", errors);
  boundedInteger(bounds.leaseTtlSeconds, 300, 86400, "bounds.leaseTtlSeconds", errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    spec: {
      invocation: { action: raw.invocation.action, semantic: raw.invocation.semantic, bindings },
      workItem: { id: text(workItem.id), objective: text(workItem.objective), acceptance: workItem.acceptance.map(text) },
      repoRoot: path.resolve(raw.repoRoot),
      worktreeRoot: path.resolve(raw.worktreeRoot),
      agenticCanvasOsRoot: path.resolve(raw.agenticCanvasOsRoot),
      semanticScope: text(raw.semanticScope), runnerId: text(raw.runnerId),
      sandboxPolicyPath: safeRelativePath(raw.sandboxPolicyPath),
      ...(ledgerPath ? { agenticSdlcLedgerPath: ledgerPath } : {}),
      allowedPaths,
      verification: normalizedVerification, idempotencyKey: text(raw.idempotencyKey),
      bounds: { ...bounds },
    },
  };
}

const parseHostJson = (source, label) => {
  if (Buffer.byteLength(String(source || "")) > MAX_REGISTRY_BYTES) throw new Error(`${label} exceeds the ${MAX_REGISTRY_BYTES}-byte registry limit.`);
  try { return JSON.parse(String(source || "")); } catch { throw new Error(`${label} must be valid JSON.`); }
};
export function loadImplementationRunHostConfig(env = process.env) {
  const registrySources = [env.AGENTIC_OS_IMPLEMENTATION_RUNNERS_JSON, env.AGENTIC_OS_IMPLEMENTATION_VERIFIERS_JSON, env.AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON];
  if (registrySources.reduce((total, value) => total + Buffer.byteLength(String(value || "")), 0) > MAX_REGISTRY_TOTAL_BYTES) throw new Error(`Implementation-run registries exceed the ${MAX_REGISTRY_TOTAL_BYTES}-byte aggregate limit.`);
  const runners = parseHostJson(env.AGENTIC_OS_IMPLEMENTATION_RUNNERS_JSON, "AGENTIC_OS_IMPLEMENTATION_RUNNERS_JSON");
  const verifiers = parseHostJson(env.AGENTIC_OS_IMPLEMENTATION_VERIFIERS_JSON, "AGENTIC_OS_IMPLEMENTATION_VERIFIERS_JSON");
  const repositories = parseHostJson(env.AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON, "AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON");
  if (!record(runners) || !record(verifiers) || !Array.isArray(repositories)) throw new Error("Implementation-run runner, verifier, and repository registries have invalid roots.");
  const normalizedRunners = {};
  if (Object.keys(runners).length > 100) throw new Error("Runner registry may contain at most 100 entries.");
  for (const [runnerId, config] of Object.entries(runners)) {
    if (!SAFE_ID.test(runnerId) || runnerId.length > 120 || !record(config)) throw new Error(`Invalid runner registry entry: ${runnerId}`);
    const configErrors = [];
    unknownKeys(config, new Set(["executable", "args", "environment"]), `runner.${runnerId}`, configErrors);
    if (configErrors.length) throw new Error(configErrors.join(" "));
    if (!path.isAbsolute(text(config.executable))) throw new Error(`Runner ${runnerId} executable must be absolute.`);
    const args = Array.isArray(config.args) ? config.args.map(String) : [];
    if (args.length > 64 || Buffer.byteLength(JSON.stringify(args)) > MAX_PROFILE_ARG_BYTES || args.some((arg) => arg.length > 4096 || arg.includes("\0") || /\{\{|\}\}/.test(arg.replace(/\{\{(?:requestPath|workspacePath|runId)\}\}/g, "")) || [...arg.matchAll(/\{\{[^}]+\}\}/g)].some((match) => !ALLOWED_PLACEHOLDERS.has(match[0])))) throw new Error(`Runner ${runnerId} args are invalid or exceed their aggregate byte bound.`);
    const environment = Array.isArray(config.environment) ? [...new Set(config.environment.map(text))] : [];
    if (environment.length > 32 || Buffer.byteLength(JSON.stringify(environment)) > MAX_PROFILE_ENV_BYTES || environment.some((name) => name.length > 128 || !ENVIRONMENT_NAME.test(name))) throw new Error(`Runner ${runnerId} environment allowlist is invalid.`);
    normalizedRunners[runnerId] = { executable: path.resolve(config.executable), args, environment };
  }
  const normalizedVerifiers = {};
  if (Object.keys(verifiers).length > 100) throw new Error("Verifier registry may contain at most 100 entries.");
  for (const [profileId, config] of Object.entries(verifiers)) {
    if (!SAFE_ID.test(profileId) || profileId.length > 120 || !record(config)) throw new Error(`Invalid verifier registry entry: ${profileId}`);
    const configErrors = [];
    unknownKeys(config, new Set(["executable", "args", "environment", "timeoutMs"]), `verifier.${profileId}`, configErrors);
    if (configErrors.length) throw new Error(configErrors.join(" "));
    if (!path.isAbsolute(text(config.executable))) throw new Error(`Verifier ${profileId} executable must be absolute.`);
    const args = Array.isArray(config.args) ? config.args.map(String) : [];
    if (args.length > 64 || Buffer.byteLength(JSON.stringify(args)) > MAX_PROFILE_ARG_BYTES || args.some((arg) => !arg || arg.length > 4096 || arg.includes("\0") || /\{\{|\}\}/.test(arg))) throw new Error(`Verifier ${profileId} args must be exact bounded strings without runtime placeholders and within the aggregate byte bound.`);
    const environment = Array.isArray(config.environment) ? [...new Set(config.environment.map(text))] : [];
    if (environment.length > 32 || Buffer.byteLength(JSON.stringify(environment)) > MAX_PROFILE_ENV_BYTES || environment.some((name) => name.length > 128 || !ENVIRONMENT_NAME.test(name))) throw new Error(`Verifier ${profileId} environment allowlist is invalid.`);
    boundedInteger(config.timeoutMs, 1000, 3600000, `verifier.${profileId}.timeoutMs`, configErrors);
    const executableName = path.basename(config.executable).toLowerCase();
    const lowered = args.map((arg) => arg.toLowerCase());
    const deploymentLike = (executableName === "git" && lowered.includes("push")) || (["npm", "npm-cli.js", "pnpm", "yarn", "bun"].includes(executableName) && lowered.some((arg) => ["publish", "deploy", "release"].includes(arg))) || (["node", "node.exe"].includes(executableName) && lowered.some((arg) => ["-e", "--eval", "-p", "--print"].includes(arg))) || (["sh", "bash", "zsh", "dash"].includes(executableName) && lowered.includes("-c"));
    if (deploymentLike) configErrors.push(`verifier.${profileId} is deployment-like or evaluates caller-shaped code and is forbidden.`);
    if (configErrors.length) throw new Error(configErrors.join(" "));
    normalizedVerifiers[profileId] = { executable: path.resolve(config.executable), args, environment, timeoutMs: config.timeoutMs, cwd: "workspace" };
  }
  if (repositories.length > 50) throw new Error("Repository registry may contain at most 50 entries.");
  const normalizedRepositories = repositories.map((entry, index) => {
    if (!record(entry) || !path.isAbsolute(text(entry.repoRoot)) || !path.isAbsolute(text(entry.worktreeRoot)) || Object.keys(entry).some((key) => !["repoRoot", "worktreeRoot"].includes(key))) throw new Error(`Repository registry entry ${index} is invalid.`);
    return { repoRoot: path.resolve(entry.repoRoot), worktreeRoot: path.resolve(entry.worktreeRoot) };
  });
  const agenticCanvasOsRoot = path.resolve(text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT));
  if (!text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT) || !path.isAbsolute(text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT))) throw new Error("AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT must be an absolute trusted host path.");
  return { runners: normalizedRunners, verifiers: normalizedVerifiers, repositories: normalizedRepositories, agenticCanvasOsRoot };
}

export function loadImplementationRunCoordinationConfig(env = process.env) {
  const repositories = parseHostJson(env.AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON, "AGENTIC_OS_IMPLEMENTATION_REPOSITORIES_JSON");
  if (!Array.isArray(repositories) || repositories.length > 50) throw new Error("Implementation-run repository registry is invalid or exceeds 50 entries.");
  const normalizedRepositories = repositories.map((entry, index) => {
    if (!record(entry) || !path.isAbsolute(text(entry.repoRoot)) || !path.isAbsolute(text(entry.worktreeRoot)) || Object.keys(entry).some((key) => !["repoRoot", "worktreeRoot"].includes(key))) throw new Error(`Repository registry entry ${index} is invalid.`);
    return { repoRoot: path.resolve(entry.repoRoot), worktreeRoot: path.resolve(entry.worktreeRoot) };
  });
  const agenticCanvasOsRoot = path.resolve(text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT));
  if (!text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT) || !path.isAbsolute(text(env.AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT))) throw new Error("AGENTIC_OS_IMPLEMENTATION_ACOS_ROOT must be an absolute trusted host path.");
  return { repositories: normalizedRepositories, agenticCanvasOsRoot };
}

export const digestVerifierProfiles = (profiles) => crypto.createHash("sha256").update(JSON.stringify(profiles)).digest("hex");

async function git(repoRoot, argv) {
  const { stdout } = await execFileAsync("git", ["-C", repoRoot, ...argv], { encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true });
  return stdout.trim();
}
async function policySourceProof(spec, sourceRevision) {
  const configuredPath = path.join(spec.repoRoot, spec.sandboxPolicyPath);
  const [policyPath, repositoryPath] = await Promise.all([fs.realpath(configuredPath), fs.realpath(spec.repoRoot)]);
  const stat = await fs.lstat(configuredPath);
  if (!within(repositoryPath, policyPath) || stat.isSymbolicLink() || !stat.isFile()) throw new Error("sandboxPolicyPath must resolve to a non-symlink regular file inside repoRoot.");
  if (stat.size > MAX_POLICY_BYTES) throw new Error(`sandboxPolicyPath exceeds the ${MAX_POLICY_BYTES}-byte managed-run policy limit.`);
  const tracked = await git(spec.repoRoot, ["ls-files", "--error-unmatch", "--", spec.sandboxPolicyPath]);
  if (tracked !== spec.sandboxPolicyPath) throw new Error("sandboxPolicyPath must be tracked at the planned source revision.");
  const tree = await git(spec.repoRoot, ["ls-tree", sourceRevision, "--", spec.sandboxPolicyPath]);
  const blobSha = tree.match(/^\d+\s+blob\s+([a-f0-9]{40,64})\t/)?.[1] || "";
  const workingBlobSha = await git(spec.repoRoot, ["hash-object", "--", policyPath]);
  if (!blobSha || workingBlobSha !== blobSha) throw new Error("sandboxPolicyPath content must exactly match its blob at the planned source revision.");
  return { path: spec.sandboxPolicyPath, sourceRevision, blobSha, fileProof: { role: "sandbox-policy", ...await fileProof(policyPath) } };
}

export async function assertPinnedImplementationRunPolicy(state, runner, verifiers) {
  const pinned = state.plan.policy;
  if (!pinned?.fileProof || pinned.sourceRevision !== state.plan.sourceRevision) throw new Error("Pinned sandbox policy authority is incomplete.");
  await assertFileProof(pinned.fileProof);
  const source = await policySourceProof(state.spec, state.plan.sourceRevision);
  if (source.blobSha !== pinned.blobSha || source.fileProof.sha256 !== pinned.fileProof.sha256) throw new Error("Sandbox policy source proof changed after preflight.");
  const compiled = await loadAgentSandboxPolicy(state.spec.sandboxPolicyPath, { rootDir: state.spec.repoRoot });
  if (!compiled.ok || compiled.policy.policy_id !== pinned.policyId || compiled.policy_digest !== pinned.policyDigest) throw new Error("Sandbox policy compilation changed after preflight.");
  const operations = [["runner", runner.executable, state.spec.bounds.maxRuntimeMs], ...verifiers.map((profile) => [`verifier ${profile.id}`, profile.executable, profile.timeoutMs])];
  for (const [label, executable, timeoutMs] of operations) if (authorizeAgentSandboxOperation(compiled, { kind: "process.execute", executable, runtime_ms: timeoutMs }, { workspaceRoot: state.spec.repoRoot }).decision !== "allow") throw new Error(`Sandbox policy no longer authorizes ${label}.`);
  for (const [label, names] of [["runner", runner.environment], ...verifiers.map((profile) => [`verifier ${profile.id}`, profile.environment])]) for (const environment of names) if (authorizeAgentSandboxOperation(compiled, { kind: "credentials.use", environment }, { workspaceRoot: state.spec.repoRoot }).decision !== "allow") throw new Error(`Sandbox policy no longer authorizes ${label} environment ${environment}.`);
  for (const allowedPath of state.spec.allowedPaths) if (authorizeAgentSandboxOperation(compiled, { kind: "filesystem.write", path: allowedPath }, { workspaceRoot: state.spec.repoRoot }).decision !== "allow") throw new Error(`Sandbox policy no longer authorizes write path ${allowedPath}.`);
}
const urlLines = (value) => String(value || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
const originHasCredentials = (value) => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.username || parsed.password);
  } catch { return false; }
};
async function readCatalog(agenticCanvasOsRoot) {
  const docsRoot = path.join(agenticCanvasOsRoot, "docs");
  const files = ["FACTS.md", "DICTIONARY-COMMAND.md", "DICTIONARY-SEMANTIC.md", "DICTIONARY-BINDING.md"];
  const contents = await Promise.all(files.map((file) => fs.readFile(path.join(docsRoot, file), "utf8")));
  return buildAgenticCanvasOsDocsCatalog(Object.fromEntries(files.map((file, index) => [file, contents[index]])));
}

export async function supportedImplementationRunAcosRevision() {
  return resolveRuntimeDocsDependency(await readRuntimeReadinessContract()).ref;
}

export async function preflightImplementationRun(spec, { env = process.env, supportedAcosRevision } = {}) {
  const diagnostics = [];
  let host;
  try { host = loadImplementationRunHostConfig(env); } catch (error) { return { ok: false, diagnostics: [{ code: "host_config_invalid", message: error.message }] }; }
  let supportedRevision = "";
  try {
    supportedRevision = supportedAcosRevision ?? await supportedImplementationRunAcosRevision();
    if (!SHA.test(supportedRevision)) throw new Error("The supported ACOS revision must be an exact lowercase 40-character Git SHA.");
  } catch (error) {
    diagnostics.push({ code: "acos_revision_contract_invalid", message: error.message });
  }
  const real = async (candidate, label) => {
    try { return await fs.realpath(candidate); } catch (error) { diagnostics.push({ code: `${label}_unavailable`, message: error.message }); return ""; }
  };
  const [repoRoot, configuredAcosRoot, suppliedAcosRoot, worktreeRoot] = await Promise.all([real(spec.repoRoot, "repo_root"), real(host.agenticCanvasOsRoot, "acos_root"), real(spec.agenticCanvasOsRoot, "acos_root"), real(spec.worktreeRoot, "worktree_root")]);
  const repository = host.repositories.find((entry) => path.resolve(entry.repoRoot) === spec.repoRoot && path.resolve(entry.worktreeRoot) === spec.worktreeRoot);
  if (!repository) diagnostics.push({ code: "repository_not_registered", message: "repoRoot and worktreeRoot must exactly match a trusted host registry entry." });
  if (!configuredAcosRoot || suppliedAcosRoot !== configuredAcosRoot) diagnostics.push({ code: "acos_root_mismatch", message: "agenticCanvasOsRoot must exactly match the trusted host configuration." });
  const runner = host.runners[spec.runnerId];
  if (!runner) diagnostics.push({ code: "runner_not_registered", message: `Runner ${spec.runnerId} is not registered by the host.` });
  const verifiers = spec.verification.map(({ profileId }, index) => {
    const profile = host.verifiers[profileId];
    if (!profile) diagnostics.push({ code: "verifier_not_registered", message: `verification[${index}] profile ${profileId} is not registered by the host.` });
    return profile ? { id: profileId, ...profile } : null;
  });
  const expectedWorktreeRoot = repoRoot ? path.join(path.dirname(repoRoot), ".worktrees", path.basename(repoRoot)) : "";
  if (!worktreeRoot || worktreeRoot !== expectedWorktreeRoot) diagnostics.push({ code: "worktree_root_invalid", message: "worktreeRoot must be the real, non-symlink ACOS-derived .worktrees/<repo-name> root." });
  const runSuffix = crypto.createHash("sha256").update(spec.idempotencyKey).digest("hex").slice(0, 24);
  const scopePrefix = spec.semanticScope.slice(0, 23).replace(/-+$/, "") || "run";
  const acosSemanticScope = `${scopePrefix}-${runSuffix}`;
  const worktreePath = path.join(spec.worktreeRoot, `implementation-${spec.workItem.id}-${runSuffix}`);
  if (path.dirname(worktreePath) !== spec.worktreeRoot || !within(spec.worktreeRoot, worktreePath)) diagnostics.push({ code: "worktree_path_invalid", message: "Derived worktree must be a direct child of the manager-owned root." });
  if (await fs.lstat(worktreePath).then(() => true, () => false)) diagnostics.push({ code: "worktree_exists", message: `Derived worktree already exists: ${worktreePath}` });
  let sourceRevision = "";
  let originUrl = "";
  let originIdentity = null;
  let acosRevision = "";
  let acosScriptProof = null;
  if (repoRoot) {
    try {
      const [top, branch, head, remote, status, fetchOrigin, pushOrigin] = await Promise.all([
        git(repoRoot, ["rev-parse", "--show-toplevel"]), git(repoRoot, ["branch", "--show-current"]),
        git(repoRoot, ["rev-parse", "HEAD"]), git(repoRoot, ["rev-parse", "refs/remotes/origin/main"]), git(repoRoot, ["status", "--porcelain"]),
        git(repoRoot, ["remote", "get-url", "--all", "origin"]), git(repoRoot, ["remote", "get-url", "--push", "--all", "origin"]),
      ]);
      const fetchUrls = urlLines(fetchOrigin);
      const pushUrls = urlLines(pushOrigin);
      sourceRevision = remote;
      originUrl = fetchUrls[0] || "";
      originIdentity = { fetchUrls, pushUrls };
      if (fetchUrls.length !== 1 || pushUrls.length !== 1 || fetchUrls[0] !== pushUrls[0] || [...fetchUrls, ...pushUrls].some(originHasCredentials)) {
        originUrl = "";
        originIdentity = null;
        diagnostics.push({ code: "origin_identity_invalid", message: "origin must have one identical credential-free fetch and push URL." });
      }
      if (path.resolve(top) !== repoRoot || branch !== "main" || head !== remote || status) diagnostics.push({ code: "canonical_repo_not_ready", message: "Registered repoRoot must be clean canonical main exactly at refs/remotes/origin/main." });
      if (!SHA.test(remote)) diagnostics.push({ code: "source_revision_invalid", message: "origin/main did not resolve to an exact SHA." });
    } catch (error) { diagnostics.push({ code: "git_preflight_failed", message: error.message }); }
  }
  if (configuredAcosRoot) {
    try {
      const [acosTop, acosBranch, acosHead, acosRemote, acosStatus] = await Promise.all([
        git(configuredAcosRoot, ["rev-parse", "--show-toplevel"]), git(configuredAcosRoot, ["branch", "--show-current"]),
        git(configuredAcosRoot, ["rev-parse", "HEAD"]), git(configuredAcosRoot, ["rev-parse", "refs/remotes/origin/main"]), git(configuredAcosRoot, ["status", "--porcelain"]),
      ]);
      acosRevision = acosHead;
      if (path.resolve(acosTop) !== configuredAcosRoot || acosBranch !== "main" || acosHead !== acosRemote || acosStatus) diagnostics.push({ code: "acos_source_not_ready", message: "Trusted ACOS root must be clean canonical main exactly at refs/remotes/origin/main." });
      if (supportedRevision && acosHead !== supportedRevision) diagnostics.push({ code: "acos_revision_unsupported", message: `Trusted ACOS HEAD ${acosHead} is not the supported runtime-readiness revision ${supportedRevision}.` });
      const scriptPath = await fs.realpath(path.join(configuredAcosRoot, "scripts", "device-branch.mjs"));
      if (!within(configuredAcosRoot, scriptPath)) diagnostics.push({ code: "acos_script_invalid", message: "ACOS device script must be a regular file inside the trusted root." });
      acosScriptProof = { role: "acos-device-script", ...await fileProof(scriptPath) };
      const catalogTokens = new Set((await readCatalog(configuredAcosRoot)).map((entry) => entry.token));
      for (const token of [spec.invocation.action, spec.invocation.semantic, ...spec.invocation.bindings]) if (!catalogTokens.has(token)) diagnostics.push({ code: "invocation_token_unknown", message: `Invocation token is absent from the exact ACOS catalog: ${token}` });
      for (const token of REQUIRED_TOKENS) if (![spec.invocation.action, spec.invocation.semantic, ...spec.invocation.bindings].includes(token)) diagnostics.push({ code: "invocation_token_required", message: `Invocation must include ${token}.` });
    } catch (error) { diagnostics.push({ code: "invocation_catalog_unavailable", message: error.message }); }
  }
  const executableProofs = [];
  if (runner) {
    try {
      const proof = await executableProof(runner.executable);
      runner.executable = proof.path;
      executableProofs.push({ role: "runner", ...proof });
    } catch (error) { diagnostics.push({ code: "runner_executable_unavailable", message: error.message }); }
  }
  for (let index = 0; index < verifiers.length; index += 1) {
    if (!verifiers[index]) continue;
    try {
      const proof = await executableProof(verifiers[index].executable);
      verifiers[index].executable = proof.path;
      executableProofs.push({ role: `verification[${index}]`, ...proof });
    } catch (error) { diagnostics.push({ code: "verification_executable_unavailable", message: error.message }); }
  }
  for (const allowedPath of spec.allowedPaths) await inspectAllowedPath(repoRoot || spec.repoRoot, allowedPath, diagnostics);
  let sourcePolicyProof = null;
  try { sourcePolicyProof = await policySourceProof(spec, sourceRevision); } catch (error) { diagnostics.push({ code: "sandbox_policy_source_invalid", message: error.message }); }
  const compiledPolicy = await loadAgentSandboxPolicy(spec.sandboxPolicyPath, { rootDir: spec.repoRoot });
  if (!compiledPolicy.ok) diagnostics.push({ code: "sandbox_policy_invalid", message: (compiledPolicy.errors || []).join(" ") });
  if (compiledPolicy.ok && spec.bounds.maxOutputBytes > compiledPolicy.policy.process.max_output_bytes) diagnostics.push({ code: "sandbox_output_bound_exceeded", message: "bounds.maxOutputBytes exceeds the source-backed policy process.max_output_bytes." });
  if (runner && compiledPolicy.ok) {
    for (const [field, executable, timeoutMs] of [["runner", runner.executable, spec.bounds.maxRuntimeMs], ...verifiers.filter(Boolean).map((profile, index) => [`verification[${index}]`, profile.executable, profile.timeoutMs])]) {
      const decision = authorizeAgentSandboxOperation(compiledPolicy, { kind: "process.execute", executable, runtime_ms: timeoutMs }, { workspaceRoot: spec.repoRoot });
      if (decision.decision !== "allow") diagnostics.push({ code: "sandbox_process_denied", message: `${field} executable is denied by the source-backed policy.` });
    }
    for (const environment of runner.environment) {
      const decision = authorizeAgentSandboxOperation(compiledPolicy, { kind: "credentials.use", environment }, { workspaceRoot: spec.repoRoot });
      if (decision.decision !== "allow") diagnostics.push({ code: "sandbox_environment_denied", message: `Runner environment ${environment} is denied by the source-backed policy.` });
    }
    for (const verifier of verifiers.filter(Boolean)) for (const environment of verifier.environment) {
      const decision = authorizeAgentSandboxOperation(compiledPolicy, { kind: "credentials.use", environment }, { workspaceRoot: spec.repoRoot });
      if (decision.decision !== "allow") diagnostics.push({ code: "sandbox_environment_denied", message: `Verifier environment ${environment} is denied by the source-backed policy.` });
    }
    for (const allowedPath of spec.allowedPaths) {
      const decision = authorizeAgentSandboxOperation(compiledPolicy, { kind: "filesystem.write", path: allowedPath }, { workspaceRoot: spec.repoRoot });
      if (decision.decision !== "allow") diagnostics.push({ code: "sandbox_write_denied", message: `allowedPaths entry is denied by the source-backed policy: ${allowedPath}` });
    }
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    sourceRevision,
    originUrl,
    originIdentity,
    acosRevision,
    supportedAcosRevision: supportedRevision,
    acosScriptProof,
    worktreePath,
    acosSemanticScope,
    runner: runner || null,
    verifiers: verifiers.filter(Boolean),
    verifierConfigDigest: digestVerifierProfiles(verifiers.filter(Boolean)),
    executableProofs,
    policy: compiledPolicy.ok && sourcePolicyProof ? { policyId: compiledPolicy.policy.policy_id, policyDigest: compiledPolicy.policy_digest, ...sourcePolicyProof } : null,
    containment: { filesystem: "git-worktree-only", applicationPreflight: true, kernelOrContainerIsolation: "not-supplied" },
  };
}
