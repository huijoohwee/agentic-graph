import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const DEFAULT_OWNER_APP_URL = "http://127.0.0.1:5175/";
const DEFAULT_GUEST_APP_URL = "http://127.0.0.1:5174/";
const DEFAULT_WORKER_URL = "http://127.0.0.1:8787";
const DEFAULT_WORKSPACE_ID = "kgws:test-room";
const DEFAULT_DOC_PATH = "/docs/workspace-seeds/knowgrph-physics-playground-demo.md";
const DEFAULT_OWNER_TOKEN = "kg_collaboration_owner_local_token";
const DEFAULT_GUEST_TOKEN = "kg_collaboration_guest_local_token";
const DEFAULT_OWNER_RUNTIME_DEVICE = "collaboration-owner-local";
const DEFAULT_GUEST_RUNTIME_DEVICE = "collaboration-guest-local";
const DEFAULT_OWNER_CLIENT_DEVICE_ID = "dev:collaboration-owner-local";
const DEFAULT_GUEST_CLIENT_DEVICE_ID = "dev:collaboration-guest-local";
const CLIENT_DEVICE_ID_PATTERN = /^dev:[A-Za-z0-9:-]{16,128}$/;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emit(log, message) {
  if (typeof log === "function") log(message);
}

function runCommand(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env,
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}`));
    });
    child.once("error", reject);
  });
}

function terminateProcess(child) {
  if (!child || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => resolve();
    child.once("exit", finish);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 2000);
  });
}

function isLocalhost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function readLocalServiceConfig(rawUrl, fallbackUrl) {
  const parsedUrl = new URL(rawUrl || fallbackUrl);
  const fallback = new URL(fallbackUrl);
  const hostname = parsedUrl.hostname || fallback.hostname;
  const port = Number(parsedUrl.port || fallback.port);
  if (!isLocalhost(hostname) || !Number.isFinite(port) || port <= 0) return null;
  return { hostname, port };
}

async function waitForServerReady(url, timeoutMs, options = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: options.headers,
      });
      if (response.ok || (response.status >= 300 && response.status < 400)) {
        if (options.schema) {
          const body = await response.json().catch(() => null);
          if (body?.schema !== options.schema) {
            throw new Error(`unexpected readiness schema at ${url}`);
          }
        }
        return `ready (${response.status})`;
      }
      lastError = new Error(`unexpected HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(1000);
  }
  throw new Error(lastError instanceof Error ? lastError.message : `timed out waiting for ${url}`);
}

async function isServerReady(url, timeoutMs, options) {
  try {
    const reason = await waitForServerReady(url, timeoutMs, options);
    return { ok: true, reason };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function hashToken(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function escapeSqlString(value) {
  return String(value || "").replace(/'/g, "''");
}

function buildLocalCollaborationSeedSql(config) {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const workspaceId = escapeSqlString(config.workspaceId);
  const ownerTokenHash = escapeSqlString(hashToken(config.ownerSessionToken));
  const guestTokenHash = escapeSqlString(hashToken(config.guestSessionToken));
  return [
    `insert or replace into workspaces (id, slug, title, visibility, created_at, updated_at) values ('${workspaceId}', 'test-room', 'Knowgrph Collaboration E2E', 'private', '${nowIso}', '${nowIso}');`,
    `insert or replace into users (id, email, display_name, status, created_at, updated_at) values ('user:collab-owner-local', 'owner.local@knowgrph.test', 'Owner Local', 'active', '${nowIso}', '${nowIso}');`,
    `insert or replace into users (id, email, display_name, status, created_at, updated_at) values ('user:collab-guest-local', 'guest.local@knowgrph.test', 'Guest Local', 'active', '${nowIso}', '${nowIso}');`,
    `insert or replace into workspace_memberships (id, workspace_id, user_id, role, status, invited_by_user_id, created_at, updated_at) values ('membership:collab-owner-local', '${workspaceId}', 'user:collab-owner-local', 'owner', 'active', null, '${nowIso}', '${nowIso}');`,
    `insert or replace into workspace_memberships (id, workspace_id, user_id, role, status, invited_by_user_id, created_at, updated_at) values ('membership:collab-guest-local', '${workspaceId}', 'user:collab-guest-local', 'editor', 'active', 'user:collab-owner-local', '${nowIso}', '${nowIso}');`,
    `insert or replace into auth_sessions (id, user_id, session_hash, expires_at, revoked_at, created_at, updated_at) values ('session:collab-owner-local', 'user:collab-owner-local', '${ownerTokenHash}', '${expiresAt}', null, '${nowIso}', '${nowIso}');`,
    `insert or replace into auth_sessions (id, user_id, session_hash, expires_at, revoked_at, created_at, updated_at) values ('session:collab-guest-local', 'user:collab-guest-local', '${guestTokenHash}', '${expiresAt}', null, '${nowIso}', '${nowIso}');`,
  ].join(" ");
}

async function bootstrapLocalCollaborationAuth(config, log) {
  emit(log, "\n[collaboration-readiness] bootstrapping local collaboration auth\n");
  await runCommand("npx", [
    "--yes",
    "wrangler@latest",
    "d1",
    "migrations",
    "apply",
    "knowgrph-storage",
    "--local",
    "--config",
    "cloudflare/workers/knowgrph-storage/wrangler.toml",
    ...buildLocalCollaborationPersistenceArgs(config),
  ], config.repoRoot);
  await runCommand("npx", [
    "--yes",
    "wrangler@latest",
    "d1",
    "execute",
    "knowgrph-storage",
    "--local",
    "--config",
    "cloudflare/workers/knowgrph-storage/wrangler.toml",
    ...buildLocalCollaborationPersistenceArgs(config),
    "--command",
    buildLocalCollaborationSeedSql(config),
  ], config.repoRoot);
}

function formatBrowserStackError(results, services) {
  const failures = results.filter((result) => !result.ok);
  const lines = [
    "[collaboration-readiness] browser smoke stack failed",
    "The authenticated browser smoke could not reuse or start the full local collaboration stack.",
    "",
    ...failures.map((result) => `- ${result.id}: ${result.readyUrl} (${result.reason})`),
    "",
    "Default local startup commands:",
    ...services.map((service, index) => `${index + 1}. ${service.startupCommand}`),
    "",
    "Override these env vars only when you want to point the browser smoke at an already-running non-default stack:",
    ...services.map((service) => `- ${service.envVar}`),
    "",
    "Then rerun: npm run collaboration:readiness:check",
  ];
  return new Error(lines.join("\n"));
}

function startBrowserService(service, config) {
  if (!service.local) {
    throw new Error(`${service.id} is not using a local URL and cannot be auto-started`);
  }
  if (service.kind === "vite") {
    const serviceEnv = {
      ...config.env,
      KNOWGRPH_RUNTIME_DEVICE: service.runtimeDevice,
      VITE_KNOWGRPH_STORAGE_BASE_URL: config.normalizedWorkerBaseUrl,
      VITE_KNOWGRPH_STORAGE_WORKSPACE_ID: config.workspaceId,
      VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN: service.id === "owner-app" ? config.ownerSessionToken : config.guestSessionToken,
    };
    return spawn(process.execPath, [
      config.viteCliPath,
      "--configLoader",
      "runner",
      "--host",
      service.local.hostname,
      "--port",
      String(service.local.port),
      "--strictPort",
    ], {
      cwd: config.canvasRoot,
      stdio: "inherit",
      env: serviceEnv,
    });
  }
  return spawn(config.npmCommand, buildLocalCollaborationWorkerArgs(config, service.local.port), {
    cwd: config.repoRoot,
    stdio: "inherit",
    env: buildLocalCollaborationWorkerEnv(config),
  });
}

function waitForStartedService(service, child, timeoutMs) {
  return Promise.race([
    waitForServerReady(service.readyUrl, timeoutMs, service.readyOptions),
    new Promise((_, reject) => {
      child.once("exit", (code) => reject(new Error(`${service.id} exited before ready with code ${code ?? "null"}`)));
      child.once("error", reject);
    }),
  ]);
}

export function resolveLocalCollaborationStackConfig({
  repoRoot,
  env = process.env,
  npmCommand = process.platform === "win32" ? "npm.cmd" : "npm",
} = {}) {
  if (!repoRoot) throw new Error("resolveLocalCollaborationStackConfig requires repoRoot");
  const ownerAppUrl = env.KG_COLLABORATION_E2E_OWNER_URL || DEFAULT_OWNER_APP_URL;
  const guestAppUrl = env.KG_COLLABORATION_E2E_GUEST_URL || DEFAULT_GUEST_APP_URL;
  const workerUrl = env.KG_COLLABORATION_E2E_WORKER_URL || DEFAULT_WORKER_URL;
  const normalizedWorkerBaseUrl = String(workerUrl).replace(/\/+$/, "");
  const workspaceId = env.KG_COLLABORATION_E2E_WORKSPACE_ID || DEFAULT_WORKSPACE_ID;
  const documentPath = env.KG_COLLABORATION_E2E_DOC_PATH || DEFAULT_DOC_PATH;
  const normalizedRepoRoot = path.resolve(repoRoot);
  const mutableSourcePath = path.resolve(normalizedRepoRoot, String(documentPath).replace(/^\/+/, ""));
  if (!mutableSourcePath.startsWith(`${normalizedRepoRoot}${path.sep}`)) {
    throw new Error("local collaboration document must resolve inside the repository");
  }
  const ownerSessionToken = env.KG_COLLABORATION_E2E_OWNER_TOKEN || DEFAULT_OWNER_TOKEN;
  const guestSessionToken = env.KG_COLLABORATION_E2E_GUEST_TOKEN || DEFAULT_GUEST_TOKEN;
  const ownerRuntimeDevice = env.KG_COLLABORATION_E2E_OWNER_DEVICE || DEFAULT_OWNER_RUNTIME_DEVICE;
  const guestRuntimeDevice = env.KG_COLLABORATION_E2E_GUEST_DEVICE || DEFAULT_GUEST_RUNTIME_DEVICE;
  const ownerClientDeviceId = env.KG_COLLABORATION_E2E_OWNER_DEVICE_ID || DEFAULT_OWNER_CLIENT_DEVICE_ID;
  const guestClientDeviceId = env.KG_COLLABORATION_E2E_GUEST_DEVICE_ID || DEFAULT_GUEST_CLIENT_DEVICE_ID;
  const configuredPersistencePath = String(env.KG_COLLABORATION_E2E_PERSISTENCE_PATH || "").trim();
  const storagePersistencePath = configuredPersistencePath
    ? path.resolve(repoRoot, configuredPersistencePath)
    : path.join(repoRoot, "cloudflare", "workers", "knowgrph-storage", ".wrangler", "state");
  if (!ownerRuntimeDevice || !guestRuntimeDevice || ownerRuntimeDevice === guestRuntimeDevice) {
    throw new Error("local collaboration runtime devices must be distinct non-empty identities");
  }
  if (
    !CLIENT_DEVICE_ID_PATTERN.test(ownerClientDeviceId)
    || !CLIENT_DEVICE_ID_PATTERN.test(guestClientDeviceId)
    || ownerClientDeviceId === guestClientDeviceId
  ) {
    throw new Error("local collaboration client device ids must be distinct valid dev: identities");
  }
  return {
    repoRoot,
    canvasRoot: path.join(repoRoot, "canvas"),
    viteCliPath: path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
    npmCommand,
    env: {
      ...env,
      VITE_WORKSPACE_MUTABLE_SOURCE_ABS_PATH: mutableSourcePath,
    },
    ownerAppUrl,
    guestAppUrl,
    workerUrl,
    normalizedWorkerBaseUrl,
    storagePersistencePath,
    workspaceId,
    documentPath,
    mutableSourcePath,
    ownerSessionToken,
    guestSessionToken,
    ownerRuntimeDevice,
    guestRuntimeDevice,
    ownerClientDeviceId,
    guestClientDeviceId,
    services: [
      {
        id: "owner-app",
        readyUrl: ownerAppUrl,
        envVar: "KG_COLLABORATION_E2E_OWNER_URL",
        startupCommand: `npm --prefix canvas run dev -- --port ${readLocalServiceConfig(ownerAppUrl, DEFAULT_OWNER_APP_URL)?.port || 5175} --strictPort`,
        kind: "vite",
        runtimeDevice: ownerRuntimeDevice,
        local: readLocalServiceConfig(ownerAppUrl, DEFAULT_OWNER_APP_URL),
      },
      {
        id: "guest-app",
        readyUrl: guestAppUrl,
        envVar: "KG_COLLABORATION_E2E_GUEST_URL",
        startupCommand: `npm --prefix canvas run dev -- --port ${readLocalServiceConfig(guestAppUrl, DEFAULT_GUEST_APP_URL)?.port || 5174} --strictPort`,
        kind: "vite",
        runtimeDevice: guestRuntimeDevice,
        local: readLocalServiceConfig(guestAppUrl, DEFAULT_GUEST_APP_URL),
      },
      {
        id: "storage-worker",
        readyUrl: `${normalizedWorkerBaseUrl}/api/storage/relay/capabilities`,
        readyOptions: {
          headers: {
            authorization: `Bearer ${ownerSessionToken}`,
            origin: new URL(ownerAppUrl).origin,
          },
          schema: "knowgrph-storage-relay-capabilities/v1",
        },
        envVar: "KG_COLLABORATION_E2E_WORKER_URL",
        startupCommand: `npm run storage:worker:dev -- --port ${readLocalServiceConfig(workerUrl, DEFAULT_WORKER_URL)?.port || 8787}`,
        kind: "worker",
        runtimeArgs: ["--local-upstream", new URL(workerUrl).hostname],
        runtimeVars: {
          KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID: workspaceId,
        },
        local: readLocalServiceConfig(workerUrl, DEFAULT_WORKER_URL),
      },
    ],
  };
}

export function buildLocalCollaborationBrowserEnv(config, env = process.env) {
  return {
    ...env,
    KG_COLLABORATION_E2E_WORKSPACE_ID: config.workspaceId,
    KG_COLLABORATION_E2E_DOC_PATH: config.documentPath,
    KG_COLLABORATION_E2E_WORKER_URL: config.normalizedWorkerBaseUrl,
    KG_COLLABORATION_E2E_OWNER_TOKEN: config.ownerSessionToken,
    KG_COLLABORATION_E2E_GUEST_TOKEN: config.guestSessionToken,
    KG_COLLABORATION_E2E_OWNER_DEVICE_ID: config.ownerClientDeviceId,
    KG_COLLABORATION_E2E_GUEST_DEVICE_ID: config.guestClientDeviceId,
  };
}

export function buildLocalCollaborationWorkerEnv(config, env = config.env || process.env) {
  return {
    ...env,
    KNOWGRPH_STORAGE_LOCAL_RUNTIME: "true",
    KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID: config.workspaceId,
  };
}

export function buildLocalCollaborationWorkerArgs(config, port) {
  return [
    "run",
    "storage:worker:dev",
    "--",
    "--port",
    String(port),
    ...buildLocalCollaborationPersistenceArgs(config),
    "--var",
    `KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID:${config.workspaceId}`,
    "--var",
    "KNOWGRPH_STORAGE_LOCAL_RUNTIME:true",
  ];
}

export function buildLocalCollaborationPersistenceArgs(config) {
  return ["--persist-to", config.storagePersistencePath];
}

export async function ensureLocalCollaborationStack(config, { log } = {}) {
  emit(log, "\n[collaboration-readiness] browser smoke stack\n");
  const results = await Promise.all(config.services.map(async (service) => {
    const status = await isServerReady(service.readyUrl, 1500, service.readyOptions);
    return {
      ...service,
      ok: status.ok,
      reason: status.reason,
      reused: status.ok,
      started: false,
      child: null,
    };
  }));
  for (const result of results) {
    emit(log, `- ${result.id}: ${result.readyUrl} -> ${result.reason}${result.reused ? " [reused]" : ""}\n`);
  }
  const missingViteServices = results.filter((result) => !result.ok && result.kind === "vite" && result.local);
  if (missingViteServices.length > 0) {
    emit(log, "\n[collaboration-readiness] preparing canvas dev prerequisites\n");
    await runCommand(config.npmCommand, ["--prefix", "canvas", "run", "predev"], config.repoRoot, config.env);
  }
  if (results.some((result) => !result.ok && result.local)) {
    await bootstrapLocalCollaborationAuth(config, log);
  }
  const startedChildren = [];
  for (const result of results) {
    if (result.ok) continue;
    if (!result.local) {
      result.reason = `not auto-startable; configure ${result.envVar} to a running local stack or restore the default local URL`;
      continue;
    }
    emit(log, `[collaboration-readiness] starting ${result.id} with ${result.startupCommand}\n`);
    result.child = startBrowserService(result, config);
    result.started = true;
    startedChildren.push(result.child);
  }
  for (const result of results) {
    if (!result.started || !result.child) continue;
    try {
      result.reason = await waitForStartedService(result, result.child, 120000);
      result.ok = true;
      emit(log, `- ${result.id}: ${result.readyUrl} -> ${result.reason} [started]\n`);
    } catch (error) {
      result.ok = false;
      result.reason = error instanceof Error ? error.message : String(error);
    }
  }
  if (results.some((result) => !result.ok)) {
    await Promise.all(startedChildren.map((child) => terminateProcess(child)));
    throw formatBrowserStackError(results, config.services);
  }
  return {
    config,
    results,
    startedChildren,
    browserEnv: buildLocalCollaborationBrowserEnv(config, config.env),
    cleanup: async () => {
      await Promise.all(startedChildren.map((child) => terminateProcess(child)));
    },
  };
}
