import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import net from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runVideoRemixAsync } from "./video-remix-runtime.js"; import { runShowrunnerLocalTool } from "./showrunner-runtime.js"; import { runOsStatusTool } from "./os-status-runtime.js"; import { callSealionSidecarTool } from "./sealion-sidecar-runtime.js"; import { callBrowserApiRuntime } from "./browser-api-runtime.js"; import { runProbeTreeTool } from "./probe-tree-runtime.js"; import { runSmeRiskCopilotTool } from "./sme-risk-copilot-runtime.js"; import { handleAnnotateImageTool, handleAnnotateVideoFrameTool } from "./annotation-runtime.js"; import { runAgentSandboxPolicyTool } from "./agent-sandbox-policy-runtime.js"; import { runAgenticCanvasOsDocsInvokeTool } from "./agentic-canvas-os-docs-runtime.js"; import { isExternalToolGatewayToolName } from "./external-tool-gateway-contract.js"; import { getExternalToolGatewayRuntime } from "./external-tool-gateway-runtime.js"; import { createDefaultApplicationAdapterRegistry } from "./agent-application-adapter-registry.js"; import { createAgentApplicationRuntime, isAgentApplicationToolName } from "./agent-application-runtime.js"; import { runExportPublishTool } from "./export-publish-runtime.js"; import { createEcsRuntime } from "./ecs-runtime.js"; import { isEcsToolName } from "./ecs-tool-contract.js"; import { createLocalRunRuntimeRegistrar } from "./local-run-runtime-registrar.js"; import { isSkillEvolutionToolName, runSkillEvolutionTool } from "./skill-evolution-runtime.js"; import { createLocalSkillEvolutionRuntime } from "./skill-evolution-local-runtime.js"; import { createVoiceStudioRuntime } from "./voice-studio-runtime.js";
import { createPaymentRuntime } from "./payment-runtime.js";
import {
  createLocalMemoryToolRuntime,
} from "./memory-local-runtime.js";
import { buildKnowgrphLocalMcpToolDefinitions, KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "./local-tool-contract.js";
import { isStorageSyncLocalToolName, runStorageSyncLocalTool } from "./storage-sync-local-runtime.js";
import { runVdeoxplnLocalTool } from "./vdeoxpln-runtime.js";
import { runRepositoryPackTool } from "./repository-pack-runtime.js";
import { runGeospatialLayerTool } from "./geospatial-layer-runtime.js";
import { buildKnowgrphAgentReadyPromptContracts, getKnowgrphAgentReadyPrompt } from "../canvas/src/features/agent-ready/knowgrphAgentReadyPromptContract.mjs";
import { buildKnowgrphAgentReadyResourceTemplateContracts, buildKnowgrphSourceFileResourceReadResult, parseKnowgrphSourceFileResourceUri } from "../canvas/src/features/agent-ready/knowgrphAgentReadyResourceContract.mjs";
import { SITE_ORIGIN } from "../cloudflare/pages/knowgrph-agent-ready-shared.mjs";
import { KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID } from "../canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs";
import { createPublishedAgentReadyToolExecutors } from "../canvas/src/features/agent-ready/publishedToolExecutors.mjs";
import { KNOWGRPH_MCP_APP_RESOURCE_URI, buildKnowgrphMcpAppsCapabilities, buildKnowgrphMcpAppsResourceDescriptor, buildKnowgrphMcpAppsResourceReadResult } from "../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";
import { runLocalAgentRuntime } from "./local-agent-runtime.js";
const MAX_OUTPUT_CHARS = Number(process.env.KNOWGRPH_MCP_MAX_OUTPUT_CHARS ?? "20000"); const DEFAULT_TIMEOUT_MS = Number(process.env.KNOWGRPH_MCP_TIMEOUT_MS ?? "600000"); const KNOWGRPH_HTML_VIDEO_ENGINE = "KNOWGRPH_HTML_VIDEO_ENGINE";
const KNOWGRPH_ROOT = resolveRootDir();
const PYTHON_BIN = process.env.KNOWGRPH_PYTHON?.trim() || "python3";
const LOCAL_MCP_STORAGE_BASE_URL = (
  process.env.KNOWGRPH_MCP_STORAGE_BASE_URL?.trim()
  || process.env.KNOWGRPH_STORAGE_BASE_URL?.trim()
  || SITE_ORIGIN
).replace(/\/+$/, "");
const LOCAL_MCP_DEFAULT_WORKSPACE_ID =
  process.env.KNOWGRPH_MCP_DEFAULT_WORKSPACE_ID?.trim()
  || KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID;
const ALLOW_EXTERNAL_PATHS =
  (process.env.KNOWGRPH_ALLOW_EXTERNAL_PATHS || "").trim().toLowerCase() === "1";
const DEFAULT_UI_HOST = process.env.KNOWGRPH_UI_HOST?.trim() || "127.0.0.1";
const DEFAULT_UI_PORT = Number(process.env.KNOWGRPH_UI_PORT?.trim() || "5173");
const LOCAL_MCP_TOOLS = buildKnowgrphLocalMcpToolDefinitions({ defaultUiHost: DEFAULT_UI_HOST, defaultUiPort: DEFAULT_UI_PORT }); const ECS_RUNTIME = createEcsRuntime({ rootDir: KNOWGRPH_ROOT }); const LOCAL_RUN_RUNTIME = createLocalRunRuntimeRegistrar({ rootDir: KNOWGRPH_ROOT, env: process.env }); const VOICE_STUDIO_RUNTIME = createVoiceStudioRuntime(); let SKILL_EVOLUTION_RUNTIME; const getSkillEvolutionRuntime = () => SKILL_EVOLUTION_RUNTIME ||= createLocalSkillEvolutionRuntime({ rootDir: KNOWGRPH_ROOT, env: process.env }); let AGENT_APPLICATION_RUNTIME; const getAgentApplicationRuntime = () => AGENT_APPLICATION_RUNTIME ||= createAgentApplicationRuntime({ adapterRegistry: createDefaultApplicationAdapterRegistry({ externalGateway: getExternalToolGatewayRuntime() }) });
const PAYMENT_RUNTIME = createPaymentRuntime({ env: process.env });
const MEMORY_RUNTIME = createLocalMemoryToolRuntime({ rootDir: KNOWGRPH_ROOT, env: process.env });
const LOCAL_MCP_PROMPTS = buildKnowgrphAgentReadyPromptContracts();
const LOCAL_MCP_RESOURCE_TEMPLATES = buildKnowgrphAgentReadyResourceTemplateContracts();
const LOCAL_PUBLISHED_SOURCE_TOOL_EXECUTORS = createPublishedAgentReadyToolExecutors({
  toolNames: {
    search: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.search,
    fetch: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fetch,
  },
  defaultWorkspaceId: LOCAL_MCP_DEFAULT_WORKSPACE_ID,
  publicBaseUrl: LOCAL_MCP_STORAGE_BASE_URL,
  buildStorageDocPath: buildPublishedStorageDocPath,
  fetchSourceFilesIndexResponse: () =>
    fetchPublishedStoragePath(buildPublishedStorageSourceFilesIndexPath()),
  fetchStorageMarkdownResponse: (storagePath) =>
    fetchPublishedStoragePath(storagePath),
});

/** @type {null | { pid: number, host: string, port: number, startedAtMs: number }} */
let canvasDevServer = null;

const UI_TARGETS = /** @type {const} */ ({
  canvas: { label: "Canvas", query: "" },
  workspaceEditor: { label: "Workspace Editor", query: "openEditorWorkspace=1" },
  geospatial: { label: "Geospatial", query: "kgGeo=1" },
});
const LOCAL_MCP_APP_URL = buildCanvasUrl({
  host: DEFAULT_UI_HOST,
  port: DEFAULT_UI_PORT,
  target: "canvas",
});
const LOCAL_MCP_APP_TOOL_NAME = KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList;
const LOCAL_MCP_APP_RESOURCE = buildKnowgrphMcpAppsResourceDescriptor({
  appUrl: LOCAL_MCP_APP_URL,
  updatedAt: "local",
});
function resolveRootDir() {
  const envRoot = process.env.KNOWGRPH_ROOT?.trim();
  if (envRoot) return path.resolve(envRoot);
  return process.cwd();
}

function isWithinRoot(absolutePath) {
  const rel = path.relative(KNOWGRPH_ROOT, absolutePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function resolvePathMaybeWithinRoot(maybePath, { allowOutsideRoot = false } = {}) {
  if (typeof maybePath !== "string" || !maybePath.trim()) {
    throw new Error("Path must be a non-empty string.");
  }
  const resolved = path.resolve(KNOWGRPH_ROOT, maybePath);
  if (allowOutsideRoot || ALLOW_EXTERNAL_PATHS) return resolved;
  if (!isWithinRoot(resolved)) {
    throw new Error(
      `Path must be inside KNOWGRPH_ROOT (${KNOWGRPH_ROOT}). Set KNOWGRPH_ALLOW_EXTERNAL_PATHS=1 to override.`
    );
  }
  return resolved;
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const head = text.slice(0, Math.floor(MAX_OUTPUT_CHARS * 0.7));
  const tail = text.slice(text.length - Math.floor(MAX_OUTPUT_CHARS * 0.3));
  return `${head}\n\n…(truncated ${text.length - MAX_OUTPUT_CHARS} chars)…\n\n${tail}`;
}

const buildHtmlVideoMcpFailure = (code, message, engineId = "") => ({
  ok: false,
  render_job_id: "",
  output_path: null,
  output_manifest_path: null,
  ...(engineId ? { engine_id: engineId } : {}),
  error: { code, message },
});

const validateHtmlVideoMcpArgs = (args) => {
  const html = typeof args.html === "string" ? args.html.trim() : "";
  if (!html) return "html must be a non-empty string";
  const ranges = [
    ["duration_ms", 1, 3600000],
    ["fps", 1, 120],
    ["width", 1, 7680],
    ["height", 1, 4320],
  ];
  for (const [field, min, max] of ranges) {
    const value = args[field];
    if (!Number.isInteger(value) || value < min || value > max) {
      return `${field} must be an integer between ${min} and ${max}`;
    }
  }
  if (typeof args.engine_hint === "string" && args.engine_hint.length > 255) return "engine_hint must be at most 255 characters";
  return "";
};

function buildCanvasUrl({ host, port, target }) {
  const base = `http://${host}:${port}/`;
  const t = UI_TARGETS[target] || UI_TARGETS.canvas;
  if (!t.query) return base;
  return `${base}?${t.query}`;
}

function buildPublishedStorageDocPath(canonicalPath, workspaceId = "") {
  const normalizedWorkspaceId = String(workspaceId || "").trim();
  const normalizedCanonicalPath = String(canonicalPath || "").trim();
  return normalizedWorkspaceId
    ? `/api/storage/doc/${encodeURIComponent(normalizedWorkspaceId)}/${encodeURIComponent(normalizedCanonicalPath)}`
    : `/api/storage/doc-default/${encodeURIComponent(normalizedCanonicalPath)}`;
}

function buildPublishedStorageSourceFilesIndexPath() {
  return "/api/storage/source-files";
}

function fetchPublishedStoragePath(storagePath) {
  return fetch(`${LOCAL_MCP_STORAGE_BASE_URL}${storagePath}`, {
    headers: { accept: "text/markdown" },
  });
}

function waitForTcpPort({ host, port, timeoutMs = 8000 }) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => {
        socket.end();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) return resolve(false);
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function startCanvasDevServer({ host, port }) {
  if (canvasDevServer?.pid) {
    return { ok: true, reused: true, pid: canvasDevServer.pid };
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["--prefix", "canvas", "run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"];

  const child = spawn(npmCommand, args, {
    cwd: KNOWGRPH_ROOT,
    env: process.env,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });

  // Detach so MCP call can return immediately.
  child.unref();
  canvasDevServer = { pid: child.pid, host, port, startedAtMs: Date.now() };
  return { ok: true, reused: false, pid: child.pid };
}

function stopProcessGroup(pid) {
  try {
    // On POSIX, negative PID kills the entire process group.
    process.kill(-pid, "SIGTERM");
    return true;
  } catch {
    try {
      process.kill(pid, "SIGTERM");
      return true;
    } catch {
      return false;
    }
  }
}

function runCommand(command, args, { cwd, timeoutMs }) {
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > MAX_OUTPUT_CHARS * 3) {
        stdout = stdout.slice(stdout.length - MAX_OUTPUT_CHARS * 3);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > MAX_OUTPUT_CHARS * 3) {
        stderr = stderr.slice(stderr.length - MAX_OUTPUT_CHARS * 3);
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, effectiveTimeoutMs);

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: typeof code === "number" ? code : null,
        signal: signal || null,
        stdout,
        stderr,
      });
    });
  });
}

async function summarizeArtifacts({ outputDir, extraPaths = [] }) {
  const artifacts = [];
  const candidates = [
    outputDir ? path.join(outputDir, "runtime-events.jsonl") : null,
    outputDir ? path.join(outputDir, "a0.csv") : null,
    outputDir ? path.join(outputDir, "a0.jsonld") : null,
    outputDir ? path.join(outputDir, "state.json") : null,
    outputDir ? path.join(outputDir, "trace.jsonl") : null,
    outputDir ? path.join(outputDir, "final-report.md") : null,
    outputDir ? path.join(outputDir, "artifacts", "canvas", "canvas.graph.json") : null,
    outputDir ? path.join(outputDir, "artifacts", "canvas", "canvas-preview.html") : null,
    outputDir ? path.join(outputDir, "artifacts", "workspace", "rich-media-flow.md") : null,
    ...extraPaths,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      artifacts.push(path.relative(KNOWGRPH_ROOT, candidate));
    }
  }
  return artifacts;
}

function formatCommand(command, args, cwd) {
  const quoted = args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg));
  return `${command} ${quoted.join(" ")}${cwd ? `  (cwd: ${cwd})` : ""}`;
}

const jsonToolResult = (payload, isError = false) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError });

const server = new Server(
  {
    name: "knowgrph-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {
        listChanged: false,
      },
      ...buildKnowgrphMcpAppsCapabilities(),
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: LOCAL_MCP_TOOLS }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [LOCAL_MCP_APP_RESOURCE] }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: LOCAL_MCP_RESOURCE_TEMPLATES }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: LOCAL_MCP_PROMPTS }));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  return getKnowgrphAgentReadyPrompt(request.params?.name, request.params?.arguments || {});
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = String(request.params?.uri || "").trim();
  if (uri === KNOWGRPH_MCP_APP_RESOURCE_URI) {
    return buildKnowgrphMcpAppsResourceReadResult({
      appUrl: LOCAL_MCP_APP_URL,
      updatedAt: "local",
      toolName: LOCAL_MCP_APP_TOOL_NAME,
      toolNames: LOCAL_MCP_TOOLS.map((tool) => tool.name),
    });
  }
  const sourceFileId = parseKnowgrphSourceFileResourceUri(uri);
  if (!sourceFileId) throw new Error(`Unknown resource: ${uri}`);
  const sourceFile = await LOCAL_PUBLISHED_SOURCE_TOOL_EXECUTORS[KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fetch]({ id: sourceFileId });
  return buildKnowgrphSourceFileResourceReadResult({ uri, sourceFile });
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const toolName = request.params?.name;
  const args = request.params?.arguments ?? {};

  try {
    if (PAYMENT_RUNTIME.canHandle(toolName)) {
      const payload = await PAYMENT_RUNTIME.run(toolName, args, { signal: extra?.signal });
      return jsonToolResult(payload, payload.ok === false);
    }
    if (isStorageSyncLocalToolName(toolName)) {
      const payload = runStorageSyncLocalTool(toolName, args);
      return jsonToolResult(payload, true);
    }
    if (isSkillEvolutionToolName(toolName)) {
      const payload = await runSkillEvolutionTool(args, {
        runtime: getSkillEvolutionRuntime(),
        context: { signal: extra?.signal },
      });
      return jsonToolResult(payload, payload.status === "failed");
    }
    if (isAgentApplicationToolName(toolName)) {
      let payload;
      try {
        payload = await getAgentApplicationRuntime().run(toolName, args, { signal: extra?.signal });
      } catch {
        payload = {
          ok: false,
          error: {
            code: "application_runtime_unavailable",
            message: "Application runtime is unavailable because host-owned configuration did not pass validation.",
          },
        };
      }
      return jsonToolResult(payload, payload.ok === false);
    }
    if (LOCAL_RUN_RUNTIME.canHandle(toolName)) {
      const payload = await LOCAL_RUN_RUNTIME.run(toolName, args, { signal: extra?.signal });
      return jsonToolResult(payload, payload.ok === false);
    }
    if (isEcsToolName(toolName)) {
      const payload = await ECS_RUNTIME.run(toolName, args);
      return jsonToolResult(payload, payload.ok === false);
    }
    if (isExternalToolGatewayToolName(toolName)) {
      const payload = await getExternalToolGatewayRuntime().run(toolName, args);
      return jsonToolResult(payload, payload.ok === false);
    }
    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.uiLaunch) {
      const target = typeof args.target === "string" ? args.target : "canvas";
      const host = typeof args.host === "string" && args.host.trim() ? args.host.trim() : DEFAULT_UI_HOST;
      const port = typeof args.port === "number" && Number.isFinite(args.port) ? Number(args.port) : DEFAULT_UI_PORT;
      const waitForReady = typeof args.waitForReady === "boolean" ? args.waitForReady : true;

      const startResult = startCanvasDevServer({ host, port });
      const ready = waitForReady ? await waitForTcpPort({ host, port, timeoutMs: 8000 }) : true;
      const url = buildCanvasUrl({ host, port, target });

      const outputText = [
        `Target: ${String(target)}`,
        `URL: ${url}`,
        `Dev server: ${startResult.reused ? "already running (reused)" : "started"}`,
        `PID: ${String(startResult.pid)}`,
        ready ? "Status: ready" : "Status: starting (port not ready yet; retry in a few seconds)",
        "",
        "Notes:",
        "- Workspace Editor uses query param ?openEditorWorkspace=1",
        "- Geospatial uses query param ?kgGeo=1 (DEV behavior)",
      ].join("\n");

      return { content: [{ type: "text", text: outputText }], isError: false };
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.uiStop) {
      if (!canvasDevServer?.pid) {
        return { content: [{ type: "text", text: "No Canvas dev server is currently tracked as running." }], isError: false };
      }
      const pid = canvasDevServer.pid;
      const ok = stopProcessGroup(pid);
      canvasDevServer = null;
      return {
        content: [{ type: "text", text: ok ? `Stopped Canvas dev server (PID ${pid}).` : `Failed to stop PID ${pid}.` }],
        isError: !ok,
      };
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.geospatialCommand) {
      const payload = runGeospatialLayerTool(args, { host: DEFAULT_UI_HOST, port: DEFAULT_UI_PORT });
      return jsonToolResult(payload, payload.ok === false);
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.pipeline) {
      const mode = typeof args.mode === "string" ? args.mode : "pipeline";
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;

      if (mode === "pipeline") {
        if (typeof args.inputPath !== "string" || !args.inputPath.trim()) {
          throw new Error("Missing required argument: inputPath (mode=pipeline).");
        }
        const inputPath = resolvePathMaybeWithinRoot(args.inputPath, { allowOutsideRoot: false });
        const outputDir =
          typeof args.outputDir === "string" && args.outputDir.trim()
            ? resolvePathMaybeWithinRoot(args.outputDir, { allowOutsideRoot: false })
            : null;

        const cmdArgs = ["-m", "knowgrph_parser", "pipeline", "--mode", "pipeline", "--input", inputPath];
        if (outputDir) cmdArgs.push("--output-dir", outputDir);

        const result = await runCommand(PYTHON_BIN, cmdArgs, { cwd: KNOWGRPH_ROOT, timeoutMs });
        const artifacts = await summarizeArtifacts({ outputDir: outputDir || null });

        const outputText = [
          `KNOWGRPH_ROOT: ${KNOWGRPH_ROOT}`,
          `Command: ${formatCommand(PYTHON_BIN, cmdArgs, KNOWGRPH_ROOT)}`,
          `Exit: ${String(result.code)}${result.signal ? ` (signal: ${result.signal})` : ""}`,
          artifacts.length ? `Artifacts:\n- ${artifacts.join("\n- ")}` : "Artifacts: (none detected)",
          result.stdout.trim() ? `\nSTDOUT:\n${truncate(result.stdout)}` : "",
          result.stderr.trim() ? `\nSTDERR:\n${truncate(result.stderr)}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return { content: [{ type: "text", text: outputText }], isError: result.code !== 0 };
      }

      throw new Error(`Unknown mode: ${mode}`);
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.graphragPipeline) {
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : undefined;
      const cmdArgs = ["-m", "knowgrph_parser", "graphrag-pipeline"];

      const outDir =
        typeof args.outDir === "string" && args.outDir.trim()
          ? resolvePathMaybeWithinRoot(args.outDir, { allowOutsideRoot: false })
          : null;

      if (typeof args.configPath === "string" && args.configPath.trim()) {
        cmdArgs.push("--config", resolvePathMaybeWithinRoot(args.configPath, { allowOutsideRoot: false }));
      }
      if (typeof args.inputDir === "string" && args.inputDir.trim()) {
        cmdArgs.push("--input", resolvePathMaybeWithinRoot(args.inputDir, { allowOutsideRoot: false }));
      }
      if (outDir) {
        cmdArgs.push("--out", outDir);
      }
      if (typeof args.graphId === "string" && args.graphId.trim()) {
        cmdArgs.push("--graph-id", args.graphId.trim());
      }

      const result = await runCommand(PYTHON_BIN, cmdArgs, { cwd: KNOWGRPH_ROOT, timeoutMs });

      const extra = [];
      if (outDir) {
        extra.push(path.join(outDir, "graph.json"));
        extra.push(path.join(outDir, "graphrag-workflow.jsonld"));
      }
      const artifacts = await summarizeArtifacts({ outputDir: outDir || null, extraPaths: extra });

      const outputText = [
        `KNOWGRPH_ROOT: ${KNOWGRPH_ROOT}`,
        `Command: ${formatCommand(PYTHON_BIN, cmdArgs, KNOWGRPH_ROOT)}`,
        `Exit: ${String(result.code)}${result.signal ? ` (signal: ${result.signal})` : ""}`,
        artifacts.length ? `Artifacts:\n- ${artifacts.join("\n- ")}` : "Artifacts: (none detected)",
        result.stdout.trim() ? `\nSTDOUT:\n${truncate(result.stdout)}` : "",
        result.stderr.trim() ? `\nSTDERR:\n${truncate(result.stderr)}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: outputText }], isError: result.code !== 0 };
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.superagentRun) {
      return runLocalAgentRuntime(args, {
        rootDir: KNOWGRPH_ROOT, pythonBin: PYTHON_BIN, resolvePath: resolvePathMaybeWithinRoot,
        runCommand, summarizeArtifacts, formatCommand, truncate, jsonToolResult,
      });
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.videoRemixRun) {
      const result = await runVideoRemixAsync(args, { env: process.env });
      return {
        content: [{ type: "text", text: truncate(result.text) }],
        structuredContent: result.payload,
        isError: !result.payload.validation?.ok,
      };
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.browserApiRun) {
      return await callBrowserApiRuntime(args, { maxOutputChars: MAX_OUTPUT_CHARS });
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.htmlVideoRender) {
      const validationError = validateHtmlVideoMcpArgs(args);
      if (validationError) return jsonToolResult(buildHtmlVideoMcpFailure("invalid_spec", validationError), true);
      const engineId = typeof args.engine_hint === "string" && args.engine_hint.trim()
        ? args.engine_hint.trim()
        : String(process.env[KNOWGRPH_HTML_VIDEO_ENGINE] || "").trim();
      if (!engineId) {
        return jsonToolResult(buildHtmlVideoMcpFailure("engine_not_configured", "KNOWGRPH_HTML_VIDEO_ENGINE is not configured."), true);
      }
      return jsonToolResult(buildHtmlVideoMcpFailure("engine_not_configured", `No local stdio adapter is registered for ${engineId}.`, engineId), true);
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.annotateImage) { const payload = await handleAnnotateImageTool(args); return jsonToolResult(payload, payload.ok === false); }
    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame) { const payload = await handleAnnotateVideoFrameTool(args); return jsonToolResult(payload, payload.ok === false); }
    if (MEMORY_RUNTIME.supports(toolName)) { const payload = await MEMORY_RUNTIME.run(toolName, args); return jsonToolResult(payload, payload.ok === false); } if (VOICE_STUDIO_RUNTIME.canHandle(toolName)) { const payload = await VOICE_STUDIO_RUNTIME.run(toolName, args, { signal: extra?.signal }); return jsonToolResult(payload, payload.ok === false); } if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.exportPublish) { const result = await runExportPublishTool(args, { repoRoot: KNOWGRPH_ROOT, env: process.env }); return jsonToolResult(result.payload, result.isError); } if (typeof toolName === "string" && toolName.startsWith("knowgrph.probe.")) return jsonToolResult(await runProbeTreeTool(toolName, args, { rootDir: KNOWGRPH_ROOT })); if (typeof toolName === "string" && (toolName.startsWith("knowgrph.sme.") || toolName === "sme_care_agent_status")) { const payload = await runSmeRiskCopilotTool(toolName, args); return jsonToolResult(payload, payload.ok === false); }
    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticCanvasOsDocsInvoke) {
      const payload = await runAgenticCanvasOsDocsInvokeTool(args, { rootDir: KNOWGRPH_ROOT, env: process.env });
      return jsonToolResult(payload, payload.ok === false);
    }
    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.repositoryPack) { const payload = await runRepositoryPackTool(args, { rootDir: KNOWGRPH_ROOT, signal: extra?.signal }); return jsonToolResult(payload, payload.ok === false); }
    if ([KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionDetectLanguageVariant, KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionTranslateLocalize, KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionSafetyCheck].includes(toolName)) return jsonToolResult(await callSealionSidecarTool(toolName, args, { env: process.env }));
    if (typeof toolName === "string" && toolName.startsWith("knowgrph.showrunner.")) return runShowrunnerLocalTool(toolName, args, { rootDir: KNOWGRPH_ROOT });
    if (typeof toolName === "string" && toolName.startsWith("knowgrph.sandbox.policy.")) { const payload = await runAgentSandboxPolicyTool(toolName, args, { rootDir: KNOWGRPH_ROOT }); return jsonToolResult(payload, payload.ok === false); }
    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.osStatus) return runOsStatusTool(args.view, args, { rootDir: KNOWGRPH_ROOT, env: process.env }).then((payload) => jsonToolResult(payload, payload.ok === false));
    if (
      toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.search
      || toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fetch
    ) {
      const execute = LOCAL_PUBLISHED_SOURCE_TOOL_EXECUTORS[toolName];
      if (typeof execute !== "function") {
        throw new Error(`Missing local published Source Files executor: ${toolName}`);
      }
      const payload = await execute(args);
      return jsonToolResult(payload);
    }

    if (toolName === KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList) {
      const payload = runVdeoxplnLocalTool(args);
      return jsonToolResult(payload, !payload.validation.ok);
    }

    throw new Error(`Unknown tool: ${toolName}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});
async function main() {
  await LOCAL_RUN_RUNTIME.recover();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`knowgrph-mcp: fatal error: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
