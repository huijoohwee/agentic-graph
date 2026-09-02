import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  buildAgenticGraphMcpToolDefinitions,
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  AGENT_RUNTIME_TOOL_NAME,
  AGENTICGRAPH_MCP_CONTRACT_VERSION,
  AGENTICGRAPH_MCP_DIRECTOR_TOOL_NAME,
  AGENTICGRAPH_OS_STATUS_TOOL_NAME,
  RUN_NOTE_TOOL_NAME,
} from "./tool-registry.mjs";
import { RUN_NOTE_INPUT, RUN_NOTE_OUTPUT } from "./run-note-tool-schema";
import { listAgentDefinitions } from "../../../contracts/agent-runtime.schema.js";
import {
  AGENTS_PATH,
  AGENT_RUNS_PATH,
  authorizeRuntimeRequest,
  handleAgentRun,
  handleRunsRead,
  runtimeJsonResponse,
} from "./agent-runtime-http";
import { createWorkersAiRunningAgentRuntime } from "./agent-runtime-adapter";
import { hasWorkersAiModelRuntimeConfiguration } from "./agent-runtime-model-resolver.mjs";
import { handleTravelCommerceServiceRoute } from "./travel-commerce-router.mjs";
import { handleTravelCommerceOfferIngress } from "./travel-commerce-ingress.mjs";
import { commerceDiscoveryHttpRoute, dispatchCommerceDiscoveryMcp, executeCommerceDiscoveryTool } from "./commerce-discovery-provider";
import { isCommerceDiscoveryTool, registerCommerceDiscoveryTools } from "./commerce-discovery-tools";
import {
  defaultPersistenceDiagnosticEmitter,
  defaultStageTransitionDiagnosticEmitter,
  dispatchAgenticGraphMcpToolCall,
  RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
  RUN_NOTE_EXECUTION_META_KEY,
  RunManifestStore,
} from "./run-manifest-store.mjs";
import { resolveStageClients, createLiveArgsResolver } from "../../../mcp/video-remix/live-clients.js";

export interface AgenticGraphMcpEnv extends Env {
  AGENTICGRAPH_AGENT_MODEL_ID?: string;
  // task 12.5 env gating: live stage clients are enabled when AGENTICGRAPH_LIVE_CLIENTS
  // is truthy or a provider credential (EXA_API_KEY) is present; otherwise the
  // Director runs against deterministic mocks (zero live/paid calls).
  EXA_API_KEY?: string;
  EXA_MCP_ENDPOINT?: string;
  AI_GATEWAY_CHAT_URL?: string;
  AI_GATEWAY_VIDEO_URL?: string;
  AI_GATEWAY_TOKEN?: string;
  BYTEPLUS_API_KEY?: string;
  BYTEPLUS_CHAT_MODEL?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  RENDER_PROVIDER?: string;
  STRYTREE_RENDER_URL?: string;
  STRYTREE_API_KEY?: string;
  AGENTICGRAPH_PAYMENT_URL?: string;
  AGENTICGRAPH_PAYMENT_API_KEY?: string;
  AGENTICGRAPH_MEDIA_BUCKET?: string;
  AGENTICGRAPH_MEDIA_R2?: R2Bucket;
  // Injectable observability sinks (default to console-backed emitters).
  // `emitPersistenceDiagnostic` is consumed by the RunManifestStore DO
  // (R14.3); `emitStageTransitionDiagnostic` is consumed here on each Director
  // run to emit per-transition diagnostics (R14.5 / Property 27, task 1.5).
  emitPersistenceDiagnostic?: (diagnostic: object) => void;
  emitStageTransitionDiagnostic?: (diagnostic: object) => void;
}

export { RunManifestStore };

const MCP_PATH = "/agenticgraph/control-plane/mcp";
const RUNS_PATH_PREFIX = `${MCP_PATH}/runs/`;

const APPROVAL_TOKEN_INPUT = z.union([
  z.string(),
  z
    .object({
      gateId: z.string(),
      token: z.string().optional(),
      approvalState: z.enum(["approved", "rejected", "pending"]).optional(),
    })
    .passthrough(),
]);

const APPROVALS_INPUT = z.array(APPROVAL_TOKEN_INPUT).optional();

const SOURCE_CARD_INPUT = z
  .object({
    sourceId: z.string(),
    url: z.string().url(),
    platform: z.string().optional(),
    title: z.string().optional(),
    evidenceLevel: z.enum(["A", "B", "C"]).optional(),
    captureTime: z.string().optional(),
    observedFields: z.array(z.string()).optional(),
  })
  .passthrough();

const VIDEO_REMIX_RUN_INPUT = {
  referenceUrl: z.string().url(),
  brief: z.string().min(1).max(5000),
  mode: z.enum(["live", "dry-run"]).default("dry-run"),
  budgetUsd: z.number().min(0.01).max(100000).optional(),
  approvals: APPROVALS_INPUT,
  shotCount: z.number().int().min(1).max(500).optional(),
  sourceCards: z.array(SOURCE_CARD_INPUT).optional(),
  runId: z.string().optional(),
  failOnceTool: z.string().optional(),
  maxIterations: z.number().int().min(1).max(100).optional(),
  frontendUrl: z.string().url().optional(),
  backendHealthUrl: z.string().url().optional(),
};

const RESEARCH_INPUT = {
  referenceUrl: z.string().url(),
  query: z.string().optional(),
  maxResults: z.number().int().min(1).max(10).optional(),
  approvals: APPROVALS_INPUT,
  runId: z.string().optional(),
};

const STORYBOARD_INPUT = {
  brief: z.string().min(1).max(5000),
  evidencePack: z.record(z.string(), z.unknown()),
  shotCount: z.number().int().min(1).max(500).optional(),
  approvals: APPROVALS_INPUT,
  runId: z.string().optional(),
};

const RENDER_INPUT = {
  shots: z
    .array(
      z
        .object({
          shotId: z.string(),
          prompt: z.string().optional(),
          durationS: z.number().min(1).max(120).optional(),
        })
        .passthrough(),
    )
    .min(1)
    .max(500),
  renderGateToken: z.string().optional(),
  approvals: APPROVALS_INPUT,
  runId: z.string().optional(),
};

const PUBLISH_INPUT = {
  assets: z
    .array(
      z
        .object({
          shotId: z.string().optional(),
          assetUrl: z.string().url(),
        })
        .passthrough(),
    )
    .min(1),
  approvals: APPROVALS_INPUT,
  runId: z.string().optional(),
};

const CHECKOUT_INPUT = {
  assetUrl: z.string().url(),
  priceId: z.string().min(1),
  paymentGateToken: z.string().optional(),
  approvals: APPROVALS_INPUT,
  runId: z.string().optional(),
};

const OS_STATUS_INPUT = {
  view: z.enum(["process_list", "capabilities", "cost_summary", "gate_catalog", "circuit_breakers"]),
  cloudflareMcpUrl: z.string().optional(),
};

const AGENTIC_CANVAS_OS_DOCS_INPUT = {
  token: z.string().optional(),
  query: z.string().optional(),
  includeContent: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
};

// ---------------------------------------------------------------------------
// Output schemas (R14.4 / Property 26).
//
// task 1.4: the tool surface must list `agenticgraph.video_remix.run` plus each
// stage tool with BOTH an input schema and an output schema. The HTTP
// `GET /agenticgraph/control-plane/mcp/tools` listing already returns both (it serializes the
// canonical `buildAgenticGraphMcpToolDefinitions()` JSON Schemas). The MCP-native
// `tools/list` only carried input schemas because tools were registered with
// `server.tool(name, description, inputShape, handler)`. Registering each tool
// via `server.registerTool(name, { inputSchema, outputSchema, ... }, handler)`
// makes the native Streamable HTTP listing consistent with the HTTP route.
//
// These Zod output shapes mirror the JSON output schemas in
// `tool-registry.mjs` so the two listing surfaces describe the same contract.
// They are intentionally permissive (every field optional): the same tool can
// return a success payload, an `approval_required` envelope (Property 1 /
// R14.6), or a `deferred_to_director` envelope, and the MCP SDK validates a
// non-error result's `structuredContent` against the registered outputSchema.
// Keeping the shapes permissive lists a descriptive output contract without
// rejecting any of the legitimate envelopes the dispatcher returns.

// Shared envelope fields present on stage-tool responses (approval_required /
// deferred_to_director / error envelopes from `executeAgenticGraphMcpTool`).
const STAGE_OUTPUT_ENVELOPE = {
  status: z.string().optional(),
  ok: z.boolean().optional(),
  gateId: z.string().optional(),
  paidProviderCalls: z.number().optional(),
  runManifestStateChanged: z.boolean().optional(),
  note: z.string().optional(),
  error: z.record(z.string(), z.unknown()).optional(),
} as const;

const VIDEO_REMIX_RUN_OUTPUT = {
  contractVersion: z.string().optional(),
  runId: z.string().optional(),
  state: z.string().optional(),
  mode: z.string().optional(),
  approvalGates: z.array(z.record(z.string(), z.unknown())).optional(),
  stages: z.array(z.record(z.string(), z.unknown())).optional(),
  evidencePack: z.record(z.string(), z.unknown()).optional(),
  storyboard: z.record(z.string(), z.unknown()).optional(),
  render: z.record(z.string(), z.unknown()).optional(),
  commerce: z.record(z.string(), z.unknown()).optional(),
  failureHandling: z.record(z.string(), z.unknown()).optional(),
  budgetMeters: z.record(z.string(), z.unknown()).optional(),
  demoPack: z.record(z.string(), z.unknown()).nullable().optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
  persistence: z.record(z.string(), z.unknown()).optional(),
  // Stage-transition diagnostics emitted on this run (R14.5 / Property 27).
  stageTransitions: z.array(z.record(z.string(), z.unknown())).optional(),
};

const RESEARCH_OUTPUT = {
  ...STAGE_OUTPUT_ENVELOPE,
  evidencePack: z
    .object({
      sources: z.array(z.record(z.string(), z.unknown())).optional(),
      citations: z.array(z.record(z.string(), z.unknown())).optional(),
      summary: z.string().optional(),
    })
    .passthrough()
    .optional(),
};

const STORYBOARD_OUTPUT = {
  ...STAGE_OUTPUT_ENVELOPE,
  canvasDocumentMarkdown: z.string().optional(),
  flow: z
    .object({
      nodes: z.array(z.record(z.string(), z.unknown())).optional(),
      edges: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .passthrough()
    .optional(),
};

const RENDER_OUTPUT = {
  ...STAGE_OUTPUT_ENVELOPE,
  assets: z.array(z.record(z.string(), z.unknown())).optional(),
};

const PUBLISH_OUTPUT = {
  ...STAGE_OUTPUT_ENVELOPE,
  publishedUrls: z.array(z.string()).optional(),
};

const CHECKOUT_OUTPUT = {
  ...STAGE_OUTPUT_ENVELOPE,
  sessionId: z.string().optional(),
  payoutSettled: z.boolean().optional(),
};

const OS_STATUS_OUTPUT = {
  ok: z.boolean().optional(),
  view: z.string().optional(),
  entries: z.array(z.record(z.string(), z.unknown())).optional(),
  truncated: z.boolean().optional(),
  unavailableSources: z.array(z.record(z.string(), z.unknown())).optional(),
  unreachableCatalogs: z.array(z.string()).optional(),
  totalsByHarness: z.record(z.string(), z.object({ estimated_cost_usd: z.number() }).passthrough()).optional(),
  validationFailures: z.array(z.record(z.string(), z.unknown())).optional(),
  costEmissionGaps: z.array(z.record(z.string(), z.unknown())).optional(),
  gates: z.array(z.record(z.string(), z.unknown())).optional(),
  approvalTokenTtlMs: z.number().optional(),
  breakers: z.array(z.record(z.string(), z.unknown())).optional(),
  cost_log: z.record(z.string(), z.unknown()).optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
};

const AGENTIC_CANVAS_OS_DOCS_OUTPUT = {
  ok: z.boolean().optional(),
  docsRoot: z.string().optional(),
  sourceRootUrl: z.string().optional(),
  absoluteDocsRoot: z.string().optional(),
  token: z.string().optional(),
  invocation: z.record(z.string(), z.unknown()).nullable().optional(),
  catalog: z.array(z.record(z.string(), z.unknown())).optional(),
  counts: z.record(z.string(), z.unknown()).optional(),
  truncated: z.boolean().optional(),
  error: z.record(z.string(), z.unknown()).optional(),
};

const AGENT_RUNTIME_INPUT = {
  agentDefinitionId: z.string().optional(),
  invocation: z.string().optional(),
  brief: z.string().min(1).max(20_000),
  mode: z.enum(["dry-run", "live"]).default("dry-run"),
  runId: z.string().min(1).max(128).optional(),
  providerMode: z.enum(["workers-ai", "byteplus-modelark", "mock"]).optional(),
  approvals: APPROVALS_INPUT,
  context: z.record(z.string(), z.unknown()).optional(),
};

const AGENT_RUNTIME_OUTPUT = {
  contractVersion: z.string(),
  runId: z.string(),
  agentDefinitionId: z.string(),
  invocation: z.string(),
  mode: z.enum(["dry-run", "live"]),
  status: z.enum(["planned", "approval_required", "ready", "completed", "blocked"]),
  plan: z.record(z.string(), z.unknown()),
  budgetMeters: z.record(z.string(), z.unknown()),
  modelRuntime: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.record(z.string(), z.unknown()).optional(),
};

type ToolHandlerArgs = Record<string, unknown>;
type ToolCallExtra = {
  _meta?: Record<string, unknown>;
  requestInfo?: { headers?: Record<string, string | string[] | undefined> };
};

type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

async function dispatchToolCall(
  toolName: string,
  args: ToolHandlerArgs,
  env: AgenticGraphMcpEnv,
  extra?: ToolCallExtra,
): Promise<ToolCallResult> {
  if (isCommerceDiscoveryTool(toolName)) {
    return executeCommerceDiscoveryTool(toolName, args ?? {}, env);
  }
  const headers = extra?.requestInfo?.headers ?? {};
  const idempotencyValue = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === "idempotency-key",
  )?.[1];
  const idempotencyHeader = Array.isArray(idempotencyValue)
    ? idempotencyValue[0]
    : idempotencyValue;
  const executionMetadata = extra?._meta?.[RUN_NOTE_EXECUTION_META_KEY];
  const liveClients = resolveStageClients({
    AGENTICGRAPH_LIVE_CLIENTS: env?.AGENTICGRAPH_LIVE_CLIENTS,
    EXA_API_KEY: env?.EXA_API_KEY,
    EXA_MCP_ENDPOINT: env?.EXA_MCP_ENDPOINT,
    AI_GATEWAY_CHAT_URL: env?.AI_GATEWAY_CHAT_URL,
    AI_GATEWAY_VIDEO_URL: env?.AI_GATEWAY_VIDEO_URL,
    AI_GATEWAY_TOKEN: env?.AI_GATEWAY_TOKEN,
    BYTEPLUS_API_KEY: env?.BYTEPLUS_API_KEY,
    BYTEPLUS_CHAT_MODEL: env?.BYTEPLUS_CHAT_MODEL,
    CLOUDFLARE_ACCOUNT_ID: env?.CLOUDFLARE_ACCOUNT_ID,
    RENDER_PROVIDER: env?.RENDER_PROVIDER,
    STRYTREE_RENDER_URL: env?.STRYTREE_RENDER_URL,
    STRYTREE_API_KEY: env?.STRYTREE_API_KEY,
    AGENTICGRAPH_PAYMENT_URL: env?.AGENTICGRAPH_PAYMENT_URL,
    AGENTICGRAPH_PAYMENT_API_KEY: env?.AGENTICGRAPH_PAYMENT_API_KEY,
    AGENTICGRAPH_MEDIA_BUCKET: env?.AGENTICGRAPH_MEDIA_BUCKET,
  }, { r2Client: env?.AGENTICGRAPH_MEDIA_R2 });
  const agentRuntime = createWorkersAiRunningAgentRuntime(env);
  // Single shared dispatch path (run-manifest-store.mjs) used by both the
  // Worker and the Node unit tests so the gate-enforcement + gated-persistence
  // invariants cannot drift between surfaces. Director runs emit stage
  // transition diagnostics (R14.5) and persist the Run_Manifest (R14.2/R14.3);
  // a withheld stage-tool invocation returns its `approval_required` envelope
  // WITHOUT ever reaching the RUN_MANIFEST_STORE namespace, so the persisted
  // Run_Manifest state is left unchanged (R14.6 / Property 1).
  const result = await dispatchAgenticGraphMcpToolCall({
    toolName,
    args: args ?? {},
    namespace: env?.RUN_MANIFEST_STORE,
    emitStageTransitionDiagnostic:
      typeof env?.emitStageTransitionDiagnostic === "function"
        ? env.emitStageTransitionDiagnostic
        : defaultStageTransitionDiagnosticEmitter,
    emitPersistenceDiagnostic:
      typeof env?.emitPersistenceDiagnostic === "function"
        ? env.emitPersistenceDiagnostic
        : defaultPersistenceDiagnosticEmitter,
    readBackPathPrefix: RUNS_PATH_PREFIX,
    // task 12.5: env-gated live/mock pre-resolution. When the Worker env opts
    // into live clients, the Director's args gain `sourceCards` fetched from the
    // live Exa client before execution; otherwise this is a no-op identity and
    // the Director runs against deterministic mocks.
    resolveLiveArgs: createLiveArgsResolver(
      liveClients,
    ),
    runtimeDeps: {
      clients: liveClients,
      agentModelResolver: agentRuntime.modelResolver,
      runningAgentAdapters: agentRuntime.runningAgentAdapters,
    },
    execution: executionMetadata && typeof executionMetadata === "object"
      ? executionMetadata
      : undefined,
    idempotencyHeader,
  });

  return {
    content: [{ type: "text", text: result.text }],
    structuredContent: result.structuredContent as Record<string, unknown>,
    isError: result.ok === false,
  };
}

export class AgenticGraphMcpAgent extends McpAgent<AgenticGraphMcpEnv> {
  server = new McpServer({
    name: "agenticgraph-control-plane",
    version: "0.1.0",
  });

  async init(): Promise<void> {
    const definitions = buildAgenticGraphMcpToolDefinitions();
    const env = this.env;

    // Register every tool with BOTH an input schema and an output schema so
    // the MCP-native `tools/list` exposes the same input+output contract per
    // tool as the HTTP `GET /agenticgraph/control-plane/mcp/tools` listing (R14.4 / Property 26).
    // `registerTool` carries `outputSchema` into the Streamable HTTP tool
    // surface, which `server.tool(...)` cannot.
    const register = (
      name: string,
      inputSchema: z.ZodRawShape,
      outputSchema: z.ZodRawShape,
    ): void => {
      const def = definitions.find((entry) => entry.name === name);
      this.server.registerTool(
        name,
        {
          title: def?.title ?? name,
          description: def?.description ?? name,
          inputSchema,
          outputSchema,
          annotations: def?.annotations,
        },
        async (args: ToolHandlerArgs, extra) => dispatchToolCall(name, args, env, extra),
      );
    };

    register(
      AGENT_RUNTIME_TOOL_NAME,
      AGENT_RUNTIME_INPUT,
      AGENT_RUNTIME_OUTPUT,
    );
    register(
      AGENTICGRAPH_MCP_DIRECTOR_TOOL_NAME,
      VIDEO_REMIX_RUN_INPUT,
      VIDEO_REMIX_RUN_OUTPUT,
    );
    register("agenticgraph.video_remix.research", RESEARCH_INPUT, RESEARCH_OUTPUT);
    register(
      "agenticgraph.video_remix.storyboard",
      STORYBOARD_INPUT,
      STORYBOARD_OUTPUT,
    );
    register("agenticgraph.video_remix.render", RENDER_INPUT, RENDER_OUTPUT);
    register("agenticgraph.video_remix.publish", PUBLISH_INPUT, PUBLISH_OUTPUT);
    register("agenticgraph.video_remix.checkout", CHECKOUT_INPUT, CHECKOUT_OUTPUT);
    register(RUN_NOTE_TOOL_NAME, RUN_NOTE_INPUT, RUN_NOTE_OUTPUT);
    register(AGENTICGRAPH_OS_STATUS_TOOL_NAME, OS_STATUS_INPUT, OS_STATUS_OUTPUT);
    register(AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME, AGENTIC_CANVAS_OS_DOCS_INPUT, AGENTIC_CANVAS_OS_DOCS_OUTPUT);
    registerCommerceDiscoveryTools(register);
  }
}

function buildHealthBody(env: AgenticGraphMcpEnv): Record<string, unknown> {
  return {
    status: "pass",
    service: "agenticgraph-mcp-worker",
    contractVersion: AGENTICGRAPH_MCP_CONTRACT_VERSION,
    transport: "mcp/streamable-http",
    endpoint: `${(env.AGENTICGRAPH_MCP_PUBLIC_BASE_URL ?? "https://airvio.co").replace(/\/+$/, "")}${MCP_PATH}`,
    tools: buildAgenticGraphMcpToolDefinitions().map((tool) => tool.name),
    runManifestPersistence: {
      bound: Boolean(env?.RUN_MANIFEST_STORE),
      readBackEndpoint: `${MCP_PATH}/runs/{id}`,
      deadlineMs: RUN_MANIFEST_PERSISTENCE_DEADLINE_MS,
    },
    agentRuntime: {
      definitions: listAgentDefinitions().map((definition) => definition.id),
      preparedDefinitions: listAgentDefinitions()
        .filter((definition) => definition.modelRequirements)
        .map((definition) => definition.id),
      dryRun: "ready",
      liveAdapter: hasWorkersAiModelRuntimeConfiguration(env) ? "configured" : "blocked_by_configuration",
      endpoint: AGENT_RUNS_PATH,
    },
  };
}

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body, null, 2), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });

export default {
  async fetch(
    request: Request,
    env: AgenticGraphMcpEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    const commerceDiscoveryHttpResponse = await commerceDiscoveryHttpRoute(request, env);
    if (commerceDiscoveryHttpResponse) return commerceDiscoveryHttpResponse;

    const travelOfferResponse = await handleTravelCommerceOfferIngress(request, env, {
      authorize: authorizeRuntimeRequest,
      route: handleTravelCommerceServiceRoute,
    });
    if (travelOfferResponse) return travelOfferResponse;

    const travelCommerceResponse = await handleTravelCommerceServiceRoute(request, env);
    if (travelCommerceResponse) return travelCommerceResponse;

    if (pathname === `${MCP_PATH}/health` || pathname === "/health") {
      return jsonResponse(buildHealthBody(env));
    }

    if (pathname === `${MCP_PATH}/tools` || pathname === "/tools") {
      return jsonResponse({
        contractVersion: AGENTICGRAPH_MCP_CONTRACT_VERSION,
        tools: buildAgenticGraphMcpToolDefinitions(),
      });
    }

    if (request.method === "GET" && pathname === AGENTS_PATH) {
      return runtimeJsonResponse({
        contractVersion: "agenticgraph.agent-definition-registry/v1",
        agents: listAgentDefinitions(),
        runEndpoint: AGENT_RUNS_PATH,
      });
    }

    if (request.method === "POST" && pathname === AGENT_RUNS_PATH) {
      return handleAgentRun(request, env);
    }

    if (
      request.method === "GET" &&
      (pathname === `${MCP_PATH}/runs` || pathname.startsWith(RUNS_PATH_PREFIX))
    ) {
      const tail = pathname.slice(RUNS_PATH_PREFIX.length);
      const runId = tail ? decodeURIComponent(tail.split("/")[0] ?? "") : "";
      return handleRunsRead(request, env, runId);
    }

    if (pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`)) {
      const authorization = await authorizeRuntimeRequest(request, env);
      if (!authorization.ok) {
        return jsonResponse(
          { error: authorization.code, message: "Runtime authorization is required." },
          { status: authorization.status, headers: authorization.status === 401 ? { "www-authenticate": "Bearer" } : undefined },
        );
      }
      // Streamable HTTP transport handled by the Agents SDK McpAgent.
      // `serve` returns a Worker-compatible fetch handler bound to MCP_PATH.
      // The Agents SDK defaults its Durable Object lookup to a binding named
      // `MCP_OBJECT`; this Worker declares the McpAgent DO as `MCP_AGENT` in
      // wrangler.toml (matching `AgenticGraphMcpEnv.MCP_AGENT`), so the binding
      // name must be passed explicitly or `serve` throws at request time.
      return dispatchCommerceDiscoveryMcp(request, env, (boundRequest) =>
        AgenticGraphMcpAgent.serve(MCP_PATH, { binding: "MCP_AGENT" }).fetch(boundRequest, env, ctx));
    }

    return jsonResponse(
      {
        error: "not_found",
        endpoint: MCP_PATH,
        message: `Use POST/GET ${MCP_PATH} for MCP Streamable HTTP transport.`,
      },
      { status: 404 },
    );
  },
};
