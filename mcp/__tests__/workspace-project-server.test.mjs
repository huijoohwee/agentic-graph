import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createWorkspaceProjectServer } from "../workspace-project-server.js";
import { WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, WORKSPACE_ARTIFACT_APPLY_TOOL_NAME } from "../workspace-artifact-contract.js";

const ECONOMICS = { networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };
const sha = (value) => createHash("sha256").update(value).digest("hex");
const diagnostic = (response) => response.text.replace(/("token"\s*:\s*")[^"]+("\s*[,}])/gu, "$1[redacted]$2");
const fixture = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-project-http-"));
  const rootDir = await fs.realpath(root);
  const service = await createWorkspaceProjectServer({ rootDir, port: 0 });
  t.after(async () => {
    await service.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { ...service, rootDir, origin: new URL(service.url).origin };
};

const request = (service, route, { method = "GET", headers = {}, body, chunks } = {}) => new Promise((resolve, reject) => {
  const target = new URL(route, service.url);
  const req = http.request(target, { method, headers }, (response) => {
    const parts = [];
    response.on("data", (part) => parts.push(part));
    response.on("error", reject);
    response.on("end", () => {
      const text = Buffer.concat(parts).toString("utf8");
      let data;
      try { data = JSON.parse(text); } catch { data = null; }
      resolve({ status: response.statusCode, headers: response.headers, text, data });
    });
  });
  req.on("error", reject);
  if (chunks) for (const part of chunks) req.write(part);
  req.end(body);
});

const post = (service, route, value, options = {}) => request(service, route, {
  method: "POST", body: JSON.stringify(value), ...options,
  headers: { "content-type": "application/json", "x-workspace-token": service.token, origin: service.origin, ...options.headers },
});
const failure = (response, status, code) => {
  assert.equal(response.status, status, diagnostic(response));
  assert.equal(response.data?.ok, false);
  assert.equal(response.data?.error?.code, code, diagnostic(response));
  assert.equal(typeof response.data.error.message, "string");
  assert.deepEqual(response.data.economics, ECONOMICS);
};
const checkpoint = async (service, requestValue) => {
  const planned = await post(service, "/api/plan", requestValue);
  assert.equal(planned.status, 200, planned.text);
  assert.equal(planned.data.ok, true);
  assert.match(planned.data.planDigest, /^[0-9a-f]{64}$/u);
  const applied = await post(service, "/api/apply", { ...requestValue, planDigest: planned.data.planDigest, operatorAuthorized: true });
  assert.equal(applied.status, 200, applied.text);
  assert.equal(applied.data.ok, true);
  assert.match(applied.data.version, /^[0-9a-f]{40}$/u);
  assert.deepEqual(planned.data.economics, ECONOMICS);
  assert.deepEqual(applied.data.economics, ECONOMICS);
  return applied.data;
};

test("local HTTP surface binds only loopback and serves the owned browser without remote assets", async (t) => {
  const service = await fixture(t);
  assert.equal(service.server.address().address, "127.0.0.1");
  assert.equal(new URL(service.url).hostname, "127.0.0.1");
  for (const route of ["/", "/client.js", "/contract.js"]) {
    const response = await request(service, route);
    assert.equal(response.status, 200, `${route}: ${response.text}`);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.ok(response.text.length > 0);
    assert.doesNotMatch(response.text, /(?:src|href)=["']https?:\/\//iu);
    assert.ok(!response.text.includes(service.token), "static assets must not embed session authorization");
  }
});

test("session bootstrap and writes deny cross-site, wrong-host, referer and forged-token requests", async (t) => {
  const service = await fixture(t);
  const session = await request(service, "/session", { headers: { "sec-fetch-site": "same-origin", origin: service.origin } });
  assert.equal(session.status, 200, diagnostic(session));
  assert.ok(session.data.token === service.token, "session must return its own authorization token");
  assert.equal(session.headers["access-control-allow-origin"], undefined);
  assert.match(String(session.headers["cache-control"]), /no-store/u);
  for (const headers of [
    { origin: "https://outside.invalid" },
    { "sec-fetch-site": "cross-site" },
    { referer: "https://outside.invalid/page" },
  ]) failure(await request(service, "/session", { headers }), 403, "ORIGIN_DENIED");
  failure(await request(service, "/session", { headers: { host: "outside.invalid" } }), 403, "HOST_DENIED");
  const value = { operation: "project-list", workspaceRoot: service.rootDir, path: "_" };
  failure(await post(service, "/api/plan", value, { headers: { "x-workspace-token": "" } }), 403, "TOKEN_REQUIRED");
  failure(await post(service, "/api/plan", value, { headers: { "x-workspace-token": "forged" } }), 403, "TOKEN_REQUIRED");
  failure(await post(service, "/api/plan", value, { headers: { origin: "https://outside.invalid" } }), 403, "ORIGIN_DENIED");
  failure(await post(service, "/api/plan", value, { headers: { host: "outside.invalid" } }), 403, "HOST_DENIED");
  assert.deepEqual(await fs.readdir(service.rootDir), [], "denied requests must not write data");
});

test("HTTP validates route, method, JSON, request boundaries and reports typed zero-spend failures", async (t) => {
  const service = await fixture(t);
  failure(await request(service, "/unknown"), 404, "UNSUPPORTED");
  failure(await request(service, "/api/plan", { method: "DELETE", headers: { "x-workspace-token": service.token } }), 405, "UNSUPPORTED");
  failure(await request(service, "/api/plan", {
    method: "POST", body: "{bad", headers: { "content-type": "application/json", "x-workspace-token": service.token },
  }), 400, "INVALID_INPUT");
  failure(await post(service, "/api/plan", { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "../escape", files: [], expectedVersion: "" }), 400, "INVALID_INPUT");
  failure(await post(service, "/api/plan", { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "empty", files: [{ path: "bad.txt", content: "x".repeat(256 * 1024 + 1) }], expectedVersion: "" }), 413, "QUOTA_EXCEEDED");
  failure(await post(service, "/api/plan", { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "total", files: Array.from({ length: 9 }, (_, index) => ({ path: `${index}.txt`, content: "x".repeat(256 * 1024) })), expectedVersion: "" }), 413, "QUOTA_EXCEEDED");
  failure(await post(service, "/api/plan", { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "count", files: Array.from({ length: 101 }, (_, index) => ({ path: `${index}.txt`, content: "x" })), expectedVersion: "" }), 413, "QUOTA_EXCEEDED");
  failure(await request(service, "/api/plan", {
    method: "POST", body: `{"padding":"${"x".repeat(3 * 1024 * 1024)}"}`,
    headers: { "content-type": "application/json", "x-workspace-token": service.token },
  }), 413, "QUOTA_EXCEEDED");
});

test("checkpoint, list, immutable inspection and export return exact bytes through actual HTTP", async (t) => {
  const service = await fixture(t);
  const firstFiles = [{ path: "notes/readme.md", content: "# Exact\r\n雪\r\n" }, { path: "settings.json", content: '{"ready":true}\n' }];
  const first = await checkpoint(service, { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "demo", expectedVersion: "", files: firstFiles, message: "First" });
  const second = await checkpoint(service, { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "demo", expectedVersion: first.version, files: [{ path: "notes/readme.md", content: "Second\n" }], message: "Second" });
  assert.notEqual(first.version, second.version);
  const listed = await post(service, "/api/plan", { operation: "project-list", workspaceRoot: service.rootDir, path: "_" });
  assert.equal(listed.status, 200, listed.text);
  assert.ok(listed.data.data.projects.some((project) => project.id === "demo" && project.version === second.version));
  const inspected = await post(service, "/api/plan", { operation: "project-inspect", workspaceRoot: service.rootDir, path: "demo", version: first.version });
  assert.equal(inspected.status, 200, inspected.text);
  assert.equal(inspected.data.data.version, first.version);
  assert.deepEqual(inspected.data.data.files.map(({ path: filePath, content }) => ({ path: filePath, content })), firstFiles);
  for (const file of inspected.data.data.files) {
    assert.equal(file.digest, sha(file.content));
    assert.equal(file.bytes, Buffer.byteLength(file.content));
  }
  const exported = await post(service, "/api/plan", { operation: "project-export", workspaceRoot: service.rootDir, path: "demo", version: first.version });
  assert.equal(exported.status, 200, exported.text);
  assert.equal(exported.data.data.schemaVersion, "agentic-graph-project-export/v1");
  assert.equal(exported.data.data.version, first.version);
  assert.deepEqual(exported.data.data.files.map(({ path: filePath, content }) => ({ path: filePath, content })), firstFiles);
  assert.deepEqual(exported.data.economics, ECONOMICS);
});

test("competing checkpoint HTTP requests advance one version and reject the losing draft explicitly", async (t) => {
  const service = await fixture(t);
  const initial = await checkpoint(service, { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "race", expectedVersion: "", files: [{ path: "readme.md", content: "base\n" }] });
  const proposals = ["alpha\n", "beta\n"].map((content) => ({ operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "race", expectedVersion: initial.version, files: [{ path: "readme.md", content }] }));
  const plans = await Promise.all(proposals.map((value) => post(service, "/api/plan", value)));
  for (const plan of plans) assert.equal(plan.status, 200, plan.text);
  const results = await Promise.all(proposals.map((value, index) => post(service, "/api/apply", { ...value, planDigest: plans[index].data.planDigest, operatorAuthorized: true })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const winner = results.find((result) => result.status === 200);
  const loser = results.find((result) => result.status === 409);
  assert.equal(loser.data.ok, false);
  assert.equal(typeof loser.data.error.code, "string");
  assert.deepEqual(loser.data.economics, ECONOMICS);
  const current = await post(service, "/api/plan", { operation: "project-inspect", workspaceRoot: service.rootDir, path: "race" });
  assert.equal(current.data.data.version, winner.data.version);
  const original = await post(service, "/api/plan", { operation: "project-inspect", workspaceRoot: service.rootDir, path: "race", version: initial.version });
  assert.equal(original.data.data.files[0].content, "base\n", "racing writes must preserve the prior immutable version");
});

test("export imports exact bytes under a new identity and rejects tampering or unauthorised apply", async (t) => {
  const service = await fixture(t);
  const first = await checkpoint(service, { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "source", expectedVersion: "", files: [{ path: "notes.md", content: "portable\r\n雪\n" }] });
  const exported = await post(service, "/api/plan", { operation: "project-export", workspaceRoot: service.rootDir, path: "source", version: first.version });
  const imported = { operation: "project-import", workspaceRoot: service.rootDir, path: "copy", expectedVersion: "", files: exported.data.data.files };
  failure(await post(service, "/api/plan", { ...imported, files: imported.files.map((file) => ({ ...file, digest: "0".repeat(64) })) }), 400, "INVALID_INPUT");
  const plan = await post(service, "/api/plan", imported);
  assert.equal(plan.status, 200, plan.text);
  const denied = await post(service, "/api/apply", { ...imported, planDigest: plan.data.planDigest, operatorAuthorized: false });
  assert.ok(denied.status >= 400 && denied.status < 500, denied.text);
  assert.equal(denied.data.ok, false);
  assert.deepEqual(denied.data.economics, ECONOMICS);
  const applied = await post(service, "/api/apply", { ...imported, planDigest: plan.data.planDigest, operatorAuthorized: true });
  assert.equal(applied.status, 200, applied.text);
  const copied = await post(service, "/api/plan", { operation: "project-inspect", workspaceRoot: service.rootDir, path: "copy" });
  assert.deepEqual(copied.data.data.files.map(({ path: filePath, content, digest }) => ({ path: filePath, content, digest })), imported.files);
});

test("session-bound attachment download exports an immutable manifest and denies unauthenticated or invalid versions", async (t) => {
  const service = await fixture(t);
  const files = [{ path: "notes.md", content: "# Download\r\n雪\n" }];
  const saved = await checkpoint(service, { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "download", expectedVersion: "", files });
  const route = `/export/download?version=${saved.version}`;
  failure(await request(service, route), 403, "TOKEN_REQUIRED");
  const session = await request(service, "/session");
  assert.equal(session.status, 200, diagnostic(session));
  const rawCookie = session.headers["set-cookie"]?.[0];
  assert.ok(typeof rawCookie === "string", "bootstrap must issue a session cookie");
  assert.ok(/;\s*HttpOnly(?:;|$)/iu.test(rawCookie), "authorization cookie must be HttpOnly");
  assert.ok(/;\s*SameSite=Strict(?:;|$)/iu.test(rawCookie), "authorization cookie must be SameSite Strict");
  const headers = { cookie: rawCookie.split(";")[0] };
  const downloaded = await request(service, route, { headers });
  assert.equal(downloaded.status, 200, diagnostic(downloaded));
  assert.match(String(downloaded.headers["content-disposition"]), /^attachment\s*;/iu);
  assert.match(String(downloaded.headers["content-type"]), /^application\/json/iu);
  assert.equal(downloaded.data.schemaVersion, "agentic-graph-project-export/v1");
  assert.equal(downloaded.data.version, saved.version);
  assert.equal(downloaded.data.projectId, "download");
  assert.deepEqual(downloaded.data.files, files.map((file) => ({ ...file, digest: sha(file.content) })));
  failure(await request(service, "/export/download?version=invalid", { headers }), 400, "INVALID_INPUT");
  failure(await request(service, route, { headers: { ...headers, origin: "https://outside.invalid" } }), 403, "ORIGIN_DENIED");
});

test("bounded transfer chunks preserve UTF-8 across arbitrary HTTP byte boundaries", async (t) => {
  const service = await fixture(t);
  const content = "雪".repeat(50_000);
  const value = { operation: "project-checkpoint", workspaceRoot: service.rootDir, path: "chunks", expectedVersion: "", files: [{ path: "unicode.txt", content }] };
  const bytes = Buffer.from(JSON.stringify(value));
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 4097) chunks.push(bytes.subarray(offset, offset + 4097));
  const planned = await request(service, "/api/plan", { method: "POST", chunks, headers: { "content-type": "application/json", "x-workspace-token": service.token } });
  assert.equal(planned.status, 200, planned.text);
  const applied = await post(service, "/api/apply", { ...value, planDigest: planned.data.planDigest, operatorAuthorized: true });
  assert.equal(applied.status, 200, applied.text);
  const observed = await post(service, "/api/plan", { operation: "project-inspect", workspaceRoot: service.rootDir, path: "chunks" });
  assert.equal(observed.data.data.files[0].content, content);
  assert.equal(observed.data.data.files[0].digest, sha(content));
});

test("hosted, provider and remote operations cannot be enabled through HTTP input", async (t) => {
  const service = await fixture(t);
  const discovery = await post(service, "/api/plan", { operation: "project-discover", workspaceRoot: service.rootDir, path: "_" });
  assert.equal(discovery.status, 200, discovery.text);
  assert.deepEqual(discovery.data.economics, ECONOMICS);
  assert.equal(discovery.data.capabilities.remoteEnabled, false);
  assert.equal(discovery.data.capabilities.provider, "local-native-git");
  for (const operation of ["project-fetch", "project-push", "project-deploy"]) {
    const response = await post(service, "/api/plan", { operation, workspaceRoot: service.rootDir, path: "remote", provider: "hosted", budgetUsd: 1 });
    assert.ok(response.status >= 400 && response.status < 500, response.text);
    assert.equal(response.data.ok, false);
    assert.deepEqual(response.data.economics, ECONOMICS);
  }
  assert.deepEqual(await fs.readdir(service.rootDir), []);
});

test("project dependency closure stays inside the licensed MCP owner and stdio SDK stays lazy", async () => {
  const directory = fileURLToPath(new URL("..", import.meta.url));
  const pending = [path.join(directory, "workspace-project-server.js")];
  const seen = new Set();
  const allowed = new Set(["node:http", "node:fs", "node:fs/promises", "node:path", "node:crypto", "node:url", "node:util", "node:events", "node:child_process"]);
  while (pending.length) {
    const filename = pending.pop();
    if (seen.has(filename)) continue;
    const relative = path.relative(await fs.realpath(directory), await fs.realpath(filename));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `dependency escapes MCP owner: ${filename}`);
    seen.add(filename);
    const source = await fs.readFile(filename, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s+)["']([^"']+)["']/gu)) {
      const specifier = match[1];
      if (specifier.startsWith(".")) pending.push(path.resolve(path.dirname(filename), specifier));
      else assert.ok(allowed.has(specifier), `unapproved dependency ${specifier} in ${path.basename(filename)}`);
    }
    for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/gu)) {
      if (match[1].startsWith(".")) {
        pending.push(path.resolve(path.dirname(filename), match[1]));
        continue;
      }
      assert.equal(path.basename(filename), "workspace-project-server.js", "only stdio adapter may lazy-load dependencies");
      assert.ok(["@modelcontextprotocol/sdk/server/index.js", "@modelcontextprotocol/sdk/server/stdio.js", "@modelcontextprotocol/sdk/types.js"].includes(match[1]));
      assert.ok(match.index > source.indexOf("export const startWorkspaceProjectStdio"), "SDK loads only within optional stdio owner");
    }
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(|\b(?:https?|net|tls)\.(?:request|get|connect)\s*\(/u);
  }
  assert.deepEqual([...seen].map(filename => path.basename(filename)).sort(), [
    "repository-pack-error.js", "repository-pack-git.js", "workspace-artifact-contract.js",
    "workspace-artifact-runtime.js", "workspace-project-runtime.js", "workspace-project-server.js",
  ], "one project owner; additions require an explicit dependency-boundary review");
  const client = await fs.readFile(path.join(directory, "workspace-project-client.js"), "utf8");
  assert.deepEqual([...client.matchAll(/(?:\bfrom\s*|\bimport\s+)["']([^"']+)["']/gu)].map(match => match[1]), ["/contract.js"]);
  assert.doesNotMatch(client, /\bimport\s*\(/u, "no hidden Canvas or alternative project owner");
  const html = await fs.readFile(path.join(directory, "workspace-project.html"), "utf8");
  assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/gu)].map(match => match[1]), ["/client.js"]);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8")).license, "MIT");
  assert.match(await fs.readFile(path.join(directory, "LICENSE"), "utf8"), /Permission is hereby granted, free of charge/u);
  const gitSource = await fs.readFile(path.join(directory, "repository-pack-git.js"), "utf8");
  assert.match(gitSource, /"protocol.allow=never"/u);
  assert.match(gitSource, /\["GIT_CONFIG_GLOBAL", NULL_DEVICE\]/u);
  assert.match(gitSource, /\["GIT_TERMINAL_PROMPT", "0"\]/u);
});

test("isolated stdio MCP exposes the same two tools and completes a zero-spend project checkpoint", { timeout: 30_000 }, async (t) => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"), import("@modelcontextprotocol/sdk/client/stdio.js"),
  ]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-project-stdio-"));
  const rootDir = await fs.realpath(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceRoot = fileURLToPath(new URL("../..", import.meta.url));
  const client = new Client({ name: "workspace-project-stdio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [path.join(sourceRoot, "mcp", "workspace-project-server.js"), `--root=${rootDir}`, "--stdio"], cwd: sourceRoot,
    env: { PATH: String(process.env.PATH || ""), NODE_ENV: "test", GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      CLOUDFLARE_API_TOKEN: "unusable-test-provider-input", AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: "[]" },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += String(chunk).slice(0, 4096 - stderr.length); });
  const options = { timeout: 10_000, maxTotalTimeout: 10_000 };
  const call = (name, args) => client.callTool({ name, arguments: args }, undefined, options);
  const envelope = (response) => response.structuredContent ?? JSON.parse(response.content.find((item) => item.type === "text").text);
  try {
    await client.connect(transport, options);
    const listed = await client.listTools(undefined, options);
    assert.deepEqual(listed.tools.map(({ name }) => name).sort(), [WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, WORKSPACE_ARTIFACT_APPLY_TOOL_NAME].sort(), stderr);
    const discovery = await call(WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, { operation: "project-discover", workspaceRoot: rootDir, path: "_" });
    assert.notEqual(discovery.isError, true, stderr);
    assert.equal(envelope(discovery).capabilities.remoteEnabled, false);
    assert.deepEqual(envelope(discovery).economics, ECONOMICS);
    const value = { operation: "project-checkpoint", workspaceRoot: rootDir, path: "stdio", expectedVersion: "", files: [{ path: "notes.md", content: "# MCP\r\n雪\n" }] };
    const planned = await call(WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, value);
    assert.notEqual(planned.isError, true, stderr);
    const plan = envelope(planned);
    assert.deepEqual(await fs.readdir(rootDir), [], "read-only MCP plan must not create a store");
    const denied = await call(WORKSPACE_ARTIFACT_APPLY_TOOL_NAME, { ...value, planDigest: plan.planDigest, operatorAuthorized: false });
    assert.equal(denied.isError, true);
    assert.equal(envelope(denied).error.code, "FORBIDDEN");
    assert.deepEqual(envelope(denied).economics, ECONOMICS);
    const applied = await call(WORKSPACE_ARTIFACT_APPLY_TOOL_NAME, { ...value, planDigest: plan.planDigest, operatorAuthorized: true });
    assert.notEqual(applied.isError, true, stderr);
    const saved = envelope(applied);
    assert.match(saved.version, /^[0-9a-f]{40}$/u);
    assert.deepEqual(saved.economics, ECONOMICS);
    const exported = await call(WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, { operation: "project-export", workspaceRoot: rootDir, path: "stdio", version: saved.version });
    assert.notEqual(exported.isError, true, stderr);
    assert.deepEqual(envelope(exported).data.files, [{ ...value.files[0], digest: sha(value.files[0].content) }]);
    const unsupported = await call(WORKSPACE_ARTIFACT_PLAN_TOOL_NAME, { operation: "project-push", workspaceRoot: rootDir, path: "stdio" });
    assert.equal(unsupported.isError, true);
    assert.equal(envelope(unsupported).error.code, "UNSUPPORTED");
    assert.deepEqual(envelope(unsupported).economics, ECONOMICS);
  } finally { await client.close().catch(() => undefined); }
});
