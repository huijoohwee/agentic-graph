import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createWorkspaceArtifactRuntime } from "./workspace-artifact-runtime.js";
import { WORKSPACE_ARTIFACT_TOOL_DEFINITIONS, WORKSPACE_PROJECT_OPERATIONS } from "./workspace-artifact-contract.js";

const ECONOMICS = Object.freeze({ networkCalls: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 });
const MAX_BODY = 3 * 1024 * 1024;
const CHUNK = 256 * 1024;
const directory = path.dirname(fileURLToPath(import.meta.url));
const fail = (code, message) => Object.assign(new Error(message), { code });
const failure = (error) => ({ ok: false, error: { code: error.code || "STORAGE_UNAVAILABLE", message: error.message }, economics: ECONOMICS });
const statusFor = (code) => ({ HOST_DENIED: 403, ORIGIN_DENIED: 403, TOKEN_REQUIRED: 403, QUOTA_EXCEEDED: 413,
  VERSION_CONFLICT: 409, RESOURCE_BUSY: 409, PLAN_STALE: 409, NOT_FOUND: 404, RUNTIME_LIMIT_EXCEEDED: 408,
  INVALID_INPUT: 400, UNSUPPORTED: 404, AUTHORIZATION_REQUIRED: 403, FORBIDDEN: 403 })[code] || 500;

// The confined adapter uses the existing artifact owner; it never admits legacy file effects.
const execute = async (runtime, mode, args, rootDir) => {
  if (!args || typeof args !== "object" || Array.isArray(args)
    || !WORKSPACE_PROJECT_OPERATIONS.includes(args.operation)) throw fail("UNSUPPORTED", "Only local project operations are available.");
  if (args.workspaceRoot !== rootDir) throw fail("INVALID_INPUT", "The configured local store is required.");
  return mode === "plan" ? runtime.plan(args) : runtime.apply(args);
};

const readBody = async (request) => {
  const pieces = []; let bytes = 0;
  for await (const piece of request) {
    bytes += piece.length;
    if (bytes > MAX_BODY) throw fail("QUOTA_EXCEEDED", "Encoded request exceeds 3 MiB; draft bytes remain with the caller.");
    pieces.push(piece);
  }
  try {
    const raw = Buffer.concat(pieces).toString("utf8");
    if (!Buffer.from(raw).equals(Buffer.concat(pieces))) throw new Error("Invalid UTF-8");
    return JSON.parse(raw);
  } catch { throw fail("INVALID_INPUT", "A valid UTF-8 JSON request is required."); }
};

const write = async (response, status, value, type = "application/json; charset=utf-8") => {
  response.writeHead(status, { "Content-Type": type });
  const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    if (!response.write(bytes.subarray(offset, offset + CHUNK))) {
      await new Promise((resolve, reject) => {
        const cleanup = () => { response.off("drain", drained); response.off("close", closed); };
        const drained = () => { cleanup(); resolve(); };
        const closed = () => { cleanup(); reject(fail("STORAGE_UNAVAILABLE", "Client disconnected.")); };
        response.once("drain", drained); response.once("close", closed);
      });
    }
  }
  response.end();
};

export const createWorkspaceProjectServer = async ({ rootDir, port = 0 } = {}) => {
  if (typeof rootDir !== "string" || !path.isAbsolute(rootDir)) throw fail("INVALID_INPUT", "An explicit absolute local store directory is required.");
  const stats = await fs.lstat(rootDir);
  if (!stats.isDirectory() || stats.isSymbolicLink() || await fs.realpath(rootDir) !== rootDir) throw fail("INVALID_INPUT", "Store must be a real directory without symlink components.");
  for (const marker of [".git", "HEAD", "objects"]) {
    if (await fs.lstat(path.join(rootDir, marker)).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; })) {
      throw fail("INVALID_INPUT", "Use a dedicated store outside an existing repository.");
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw fail("INVALID_INPUT", "Port must be 0..65535.");
  const token = randomBytes(32).toString("hex");
  const runtime = createWorkspaceArtifactRuntime({ rootDir, env: {} });
  let url;
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
    try {
      const address = new URL(url);
      if (request.headers.host !== address.host) throw fail("HOST_DENIED", "Exact loopback host required.");
      let refererOrigin;
      if (request.headers.referer) {
        try { refererOrigin = new URL(request.headers.referer).origin; } catch { refererOrigin = "invalid"; }
      }
      if ((request.headers.origin && request.headers.origin !== url) || (refererOrigin && refererOrigin !== url)
        || (request.headers["sec-fetch-site"] && !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))) {
        throw fail("ORIGIN_DENIED", "Cross-origin access is unavailable.");
      }
      const route = request.url;
      if (request.method === "GET") {
        if (route === "/session") {
          response.setHeader("Set-Cookie", `workspace-session=${token}; HttpOnly; SameSite=Strict; Path=/`);
          return await write(response, 200, { rootDir, token, zeroSpend: true, store: "localhost-host-git", transport: "loopback-http", economics: ECONOMICS });
        }
        if (route?.startsWith("/export/")) {
          if (!String(request.headers.cookie || "").split(/;\s*/u).includes(`workspace-session=${token}`)) throw fail("TOKEN_REQUIRED", "This local session is required for export.");
          const parsed = new URL(route, url);
          const projectId = decodeURIComponent(parsed.pathname.slice(8));
          const result = await execute(runtime, "plan", { operation: "project-export", workspaceRoot: rootDir, path: projectId,
            ...(parsed.searchParams.has("version") ? { version: parsed.searchParams.get("version") } : {}) }, rootDir);
          response.setHeader("Content-Disposition", `attachment; filename="${projectId}.project.json"`);
          return await write(response, 200, result.data);
        }
        const assets = { "/": ["workspace-project.html", "text/html; charset=utf-8"],
          "/client.js": ["workspace-project-client.js", "text/javascript; charset=utf-8"],
          "/contract.js": ["workspace-artifact-contract.js", "text/javascript; charset=utf-8"] };
        if (Object.hasOwn(assets, route)) {
          const [file, type] = assets[route];
          return await write(response, 200, await fs.readFile(path.join(directory, file), "utf8"), type);
        }
        throw fail("UNSUPPORTED", "Route is unavailable; no remote fallback exists.");
      }
      if (request.method !== "POST") return await write(response, 405, failure(fail("UNSUPPORTED", "Method is unavailable.")));
      if (!["/api/plan", "/api/apply"].includes(route)) throw fail("UNSUPPORTED", "Route is unavailable; no remote fallback exists.");
      if (request.headers["x-workspace-token"] !== token) throw fail("TOKEN_REQUIRED", "This local session token is required.");
      if (!String(request.headers["content-type"] || "").startsWith("application/json")) throw fail("INVALID_INPUT", "Content-Type application/json required.");
      if (Number(request.headers["content-length"] || 0) > MAX_BODY) throw fail("QUOTA_EXCEEDED", "Encoded request exceeds 3 MiB.");
      const args = await readBody(request);
      return await write(response, 200, await execute(runtime, route.slice(5), args, rootDir));
    } catch (error) {
      if (!response.headersSent) await write(response, statusFor(error.code), failure(error));
      else response.destroy();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${server.address().port}`;
  return { server, url, token, runtime, close: () => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve()); server.closeIdleConnections();
  }) };
};

// SDK is already declared by this MIT package and is loaded only for stdio MCP.
export const startWorkspaceProjectStdio = async ({ rootDir }) => {
  const [{ Server }, { StdioServerTransport }, { ListToolsRequestSchema, CallToolRequestSchema }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/index.js"), import("@modelcontextprotocol/sdk/server/stdio.js"), import("@modelcontextprotocol/sdk/types.js"),
  ]);
  const runtime = createWorkspaceArtifactRuntime({ rootDir, env: {} });
  const server = new Server({ name: "agentic-graph-local-project", version: "0.2.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: WORKSPACE_ARTIFACT_TOOL_DEFINITIONS.map((definition) => ({
    ...definition, inputSchema: { ...definition.inputSchema, properties: { ...definition.inputSchema.properties,
      operation: { type: "string", enum: WORKSPACE_PROJECT_OPERATIONS } } },
  })) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      if (!WORKSPACE_ARTIFACT_TOOL_DEFINITIONS.some(({ name }) => name === params.name)) throw fail("UNSUPPORTED", "Unknown tool.");
      const value = await execute(runtime, params.name.endsWith(".plan") ? "plan" : "apply", params.arguments, rootDir);
      return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
    } catch (error) { return { isError: true, content: [{ type: "text", text: JSON.stringify(failure(error)) }] }; }
  });
  await server.connect(new StdioServerTransport());
  return server;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => arg.slice(2).split(/=(.*)/su).slice(0, 2)));
  if (!options.root) { console.error("Use --root=/absolute/dedicated/existing/store [--port=8788] [--stdio]. Zero-spend local mode only."); process.exitCode = 1; }
  else {
    const rootDir = path.resolve(options.root);
    try {
      if (process.argv.includes("--stdio")) await startWorkspaceProjectStdio({ rootDir });
      else {
        const host = await createWorkspaceProjectServer({ rootDir, port: options.port === undefined ? 8788 : Number(options.port) });
        console.log(`Local project workspace: ${host.url}\nStore: ${rootDir}\nZero-spend: no provider, model, or external network calls.`);
        for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => { await host.close(); process.exitCode = 0; });
      }
    } catch (error) { console.error(`${error.code || "STORAGE_UNAVAILABLE"}: ${error.message}`); process.exitCode = 1; }
  }
}
