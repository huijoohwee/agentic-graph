import { BROWSER_API_TOOL } from "./browser-api-runtime.js"; import { buildOsStatusToolDefinition } from "./os-status-contract.js";
import { buildLocalAgentRuntimeToolDefinition } from "./local-agent-tool-contract.js";
import { buildKnowledgeGraphToolDefinitions } from "./knowledge-graph-tool-contract.js";
import { KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID, KNOWGRPH_AGENT_READY_TOOL_IDS, buildKnowgrphAgentReadyToolContracts } from "../canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs";
import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES as SHARED_KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs";
import { buildKnowgrphMcpNoauthSecuritySchemes } from "../canvas/src/features/agent-ready/mcpAppsReadyContract.mjs";
import { KNOWGRPH_MEMORY_LAYER_MCP_TOOL_NAMES, MEMORY_ADD_INPUT_SCHEMA, MEMORY_ADD_OUTPUT_SCHEMA, PROCEDURAL_MEMORY_EXTRACT_INPUT_SCHEMA, PROCEDURAL_MEMORY_EXTRACT_OUTPUT_SCHEMA, PROMPT_ASSEMBLER_INPUT_SCHEMA, PROMPT_ASSEMBLER_OUTPUT_SCHEMA, USER_MODEL_MATERIALIZE_INPUT_SCHEMA, USER_MODEL_MATERIALIZE_OUTPUT_SCHEMA } from "../canvas/src/features/memory/aiAgentsMemoryLayerContract.mjs";
import { AGENTIC_CANVAS_OS_DOCS_TOOL_DEFINITION } from "./agentic-canvas-os-docs-contract.mjs";
import { buildPersistentMemoryToolDefinitions } from "./persistent-memory-tool-contract.js";
import { REPOSITORY_PACK_TOOL_DEFINITION } from "./repository-pack-contract.js";
import { buildExternalToolGatewayDefinitions } from "./external-tool-gateway-contract.js";
import { buildProbeTreeLocalToolDefinitions } from "./probe-tree-tool-contract.js";
import { buildSmeRiskCopilotLocalToolDefinitions } from "./sme-risk-copilot-tool-contract.js";
import { buildAgentSandboxPolicyToolDefinitions } from "./agent-sandbox-policy-tool-contract.js"; import { VIDEO_WORKFLOW_INPUT_SCHEMA } from "./video-remix/workflow-contract.js";
import { EXPORT_PUBLISH_INPUT_SCHEMA, EXPORT_PUBLISH_OUTPUT_SCHEMA } from "./export-publish-contract.js";
import { buildEcsLocalToolDefinitions } from "./ecs-tool-contract.js";
import { buildLocalRunToolDefinitions } from "./local-run-tool-contract-registrar.js"; import { buildAgentApplicationToolDefinitions } from "./agent-application-tool-contract.js";
import { buildSkillEvolutionToolDefinition } from "./skill-evolution-tool-contract.js";
import { buildStorageSyncLocalToolDefinitions } from "./storage-sync-local-tool-contract.mjs";
import { buildVdeoxplnLocalToolDefinition } from "./vdeoxpln-tool-contract.js";
import { buildVoiceStudioLocalToolDefinition } from "./voice-studio-tool-contract.js";
import { buildGeospatialLayerToolDefinition } from "./geospatial-layer-tool-contract.js";
import { buildPaymentToolDefinitions } from "./payment-tool-contract.js";
import { WORKSPACE_ARTIFACT_TOOL_DEFINITIONS } from "./workspace-artifact-contract.js";
export const KNOWGRPH_LOCAL_MCP_TOOL_NAMES = SHARED_KNOWGRPH_LOCAL_MCP_TOOL_NAMES;

const VIDEO_REMIX_RUN_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "runId", "state", "mode", "approvalGates", "evidencePack", "storyboard", "budgetMeters", "validation"],
  properties: {
    contractVersion: { type: "string" },
    runId: { type: "string" },
    state: { type: "string" },
    mode: { type: "string" },
    approvalGates: {
      type: "array",
      items: { type: "object", additionalProperties: true },
    },
    evidencePack: { type: "object", additionalProperties: true },
    storyboard: { type: "object", additionalProperties: true },
    budgetMeters: { type: "object", additionalProperties: true },
    validation: { type: "object", additionalProperties: true },
  },
});

const SHOWRUNNER_TOOL_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok"],
  properties: {
    ok: { type: "boolean" },
    run_id: { type: "string" },
    run_status: { type: "string" },
    artifact_path: { type: "string" },
    error: { type: "object", additionalProperties: true },
  },
});

const SHOWRUNNER_RUN_ID_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["run_id"], properties: { run_id: { type: "string" } } });

const HTML_VIDEO_RENDER_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["html", "duration_ms", "fps", "width", "height"],
  properties: {
    html: { type: "string" },
    duration_ms: { type: "integer", minimum: 1, maximum: 3600000 },
    fps: { type: "integer", minimum: 1, maximum: 120 },
    width: { type: "integer", minimum: 1, maximum: 7680 },
    height: { type: "integer", minimum: 1, maximum: 4320 },
    css: { type: "string" },
    data: { type: "object", additionalProperties: true },
    engine_hint: { type: "string", maxLength: 255 },
  },
});

const HTML_VIDEO_RENDER_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["ok", "render_job_id", "output_path", "output_manifest_path"],
  properties: {
    ok: { type: "boolean" },
    render_job_id: { type: "string" },
    output_path: { type: ["string", "null"] },
    output_manifest_path: { type: ["string", "null"] },
    output_storage_url: { type: "string" },
    engine_id: { type: "string" },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
});

const ANNOTATION_TASK_IDS = Object.freeze(["caption", "detailed_caption", "more_detailed_caption", "object_detection", "dense_region_caption", "ocr"]);
const ANNOTATION_TASKS_SCHEMA = Object.freeze({ type: "array", items: { type: "string", enum: ANNOTATION_TASK_IDS }, minItems: 1, maxItems: 6 });
const ANNOTATE_IMAGE_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["asset_url", "tasks"], properties: { asset_url: { type: "string", minLength: 1, maxLength: 2048 }, tasks: ANNOTATION_TASKS_SCHEMA, model_hint: { type: "string", maxLength: 255 } } });
const ANNOTATE_VIDEO_FRAME_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["asset_url", "tasks", "frame_timestamp_ms"], properties: { asset_url: { type: "string", minLength: 1, maxLength: 2048 }, tasks: ANNOTATION_TASKS_SCHEMA, frame_timestamp_ms: { type: "integer", minimum: 0 }, model_hint: { type: "string", maxLength: 255 } } });
const ANNOTATE_OUTPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["ok", "annotation_id", "asset_url", "model_id", "schema_version", "tasks"], properties: { ok: { type: "boolean" }, annotation_id: { type: "string" }, asset_url: { type: "string" }, model_id: { type: "string" }, schema_version: { type: "string" }, tasks: { type: "object", additionalProperties: true }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } });
const SEALION_TEXT_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string", minLength: 1, description: "Text to analyze for language, variant, register, and code-switching." } } });
const SEALION_TRANSLATE_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["text", "target_language"], properties: { text: { type: "string", minLength: 1 }, target_language: { type: "string", minLength: 1 }, source_language: { type: "string", default: "auto" }, target_region: { type: "string" }, tone: { type: "string", enum: ["neutral", "formal", "informal", "public_service", "marketing", "legal", "friendly", "urgent"], default: "neutral" }, reading_level: { type: "string", enum: ["plain", "standard", "advanced"], default: "standard" } } });
const SEALION_SAFETY_INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["mode"], properties: { mode: { type: "string", enum: ["prompt_only", "prompt_response", "response_only"] }, prompt: { type: "string" }, response: { type: "string" } } });
const SEALION_TOOL_OUTPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: true, required: ["ok", "tool", "result"], properties: { ok: { type: "boolean" }, tool: { type: "string" }, upstreamUrl: { type: "string" }, result: { type: "object", additionalProperties: true } } });
const PUBLISHED_SOURCE_TOOL_CONTRACTS = buildKnowgrphAgentReadyToolContracts({
  defaultWorkspaceId: KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
}).filter((tool) =>
  [
    KNOWGRPH_AGENT_READY_TOOL_IDS.search,
    KNOWGRPH_AGENT_READY_TOOL_IDS.fetch,
  ].includes(tool.name)
);
const READ_ONLY_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

const LOCAL_PROCESS_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
});

const LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

const LOCAL_IDEMPOTENT_MUTATION_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: true,
});

const BROWSER_API_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
  idempotentHint: false,
});

const EXTERNAL_MUTATING_PROCESS_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: false,
});

const cloneAnnotations = (annotations) => ({ ...(annotations || READ_ONLY_TOOL_ANNOTATIONS) });
const withLocalMcpDescriptorDefaults = (tool, annotations = READ_ONLY_TOOL_ANNOTATIONS) => ({
  ...tool,
  securitySchemes: Array.isArray(tool.securitySchemes) && tool.securitySchemes.length
    ? tool.securitySchemes
    : buildKnowgrphMcpNoauthSecuritySchemes(),
  annotations: tool.annotations && typeof tool.annotations === "object"
    ? { ...tool.annotations }
    : cloneAnnotations(annotations),
});

const buildLocalPublishedSourceToolDefinition = (toolName) => {
  const tool = PUBLISHED_SOURCE_TOOL_CONTRACTS.find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`Missing shared published Source Files tool contract: ${toolName}`);
  }
  return withLocalMcpDescriptorDefaults({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    securitySchemes: tool.securitySchemes,
    annotations: tool.annotations,
  });
};

export const buildKnowgrphLocalMcpToolDefinitions = (args = {}) => {
  const defaultUiHost = String(args.defaultUiHost || "127.0.0.1").trim() || "127.0.0.1";
  const defaultUiPort = Number(args.defaultUiPort || 5173);

  return [
    buildLocalPublishedSourceToolDefinition(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.search),
    buildLocalPublishedSourceToolDefinition(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.fetch),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.uiLaunch,
      description:
        "Use this when a local MCP host needs to launch the Knowgrph Canvas UI (Vite dev server) and return a URL pre-configured for Canvas / Workspace Editor / Geospatial mode.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          target: {
            type: "string",
            enum: ["canvas", "workspaceEditor", "geospatial"],
            default: "canvas",
            description: "Which UI experience to open.",
          },
          host: {
            type: "string",
            description: `Host to bind and open. Default: ${defaultUiHost} (or KNOWGRPH_UI_HOST).`,
          },
          port: {
            type: "number",
            description: `Port for the dev server. Default: ${String(defaultUiPort)} (or KNOWGRPH_UI_PORT).`,
          },
          waitForReady: {
            type: "boolean",
            description: "If true, waits briefly for the port to accept TCP connections before returning.",
            default: true,
          },
        },
      },
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.uiStop,
      description: "Use this when a local MCP host needs to stop the running Knowgrph Canvas dev server if it was started by knowgrph.ui.launch.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults(
      buildGeospatialLayerToolDefinition(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.geospatialCommand),
      LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS,
    ),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.pipeline,
      description:
        "Use this when a local MCP host needs to run the Knowgrph pipeline (GraphData -> A0 CSV/JSON-LD + codebase index artifacts).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: {
            type: "string",
            enum: ["pipeline"],
            default: "pipeline",
            description: "Which pipeline mode to run.",
          },
          inputPath: {
            type: "string",
            description: "Path to an input GraphData JSON file (required when mode=pipeline).",
          },
          outputDir: {
            type: "string",
            description:
              "Directory for outputs. If omitted, defaults to knowgrph_parser's configured output directory.",
          },
          timeoutMs: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
      },
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.graphragPipeline,
      description:
        "Use this when a local MCP host needs to run the GraphRAG pipeline wrapper (attempts `graphrag index`, then emits GraphData + A0 exports).",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          configPath: { type: "string", description: "GraphRAG config YAML path." },
          inputDir: { type: "string", description: "Input directory containing raw docs." },
          outDir: { type: "string", description: "Output directory." },
          graphId: { type: "string", description: "Graph identifier used in emitted workflow doc." },
          timeoutMs: { type: "number", description: "Optional timeout in milliseconds." },
        },
      },
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    ...buildKnowledgeGraphToolDefinitions({ toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES, withDefaults: withLocalMcpDescriptorDefaults, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS, processAnnotations: Object.freeze({ readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true }) }),
    withLocalMcpDescriptorDefaults(
      buildLocalAgentRuntimeToolDefinition(
        KNOWGRPH_LOCAL_MCP_TOOL_NAMES.superagentRun,
      ),
      LOCAL_PROCESS_TOOL_ANNOTATIONS,
    ),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.videoRemixRun,
      description:
        "Use this when a local MCP host needs to produce an approval-gated video-remix run manifest from a reference URL, brief, source cards, storyboard plan, render/checkout gates, token/TCO budget, and failure evidence before any paid provider call.",
      outputSchema: VIDEO_REMIX_RUN_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["referenceUrl", "brief"],
        properties: {
          referenceUrl: {
            type: "string",
            description: "Absolute reference video URL supplied by the creator user.",
          },
          brief: {
            type: "string",
            description: "Creative intent for the remix run.",
          },
          mode: {
            type: "string",
            enum: ["dry-run", "live"],
            default: "dry-run",
            description: "Run mode. live still blocks before spend unless matching approval tokens are supplied.",
          },
          approvals: {
            type: "array",
            items: {
              oneOf: [
                { type: "string" },
                { type: "object", additionalProperties: true },
              ],
            },
            description: "Approval gate ids or token objects. Missing gates keep paid/render/payment/deploy actions blocked.",
          },
          sourceCards: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Already-captured source cards with sourceId, url, platform, title, evidenceLevel, and observedFields; the local runtime never fabricates live Exa results.",
          },
          budgetUsd: {
            type: "number",
            default: 0,
            description: "Run budget cap used for local budget-meter accounting.",
          },
          shotCount: {
            type: "number",
            default: 4,
            description: "Number of storyboard shots to plan, bounded by the runtime.",
          },
          runId: {
            type: "string",
            description: "Optional stable run id.",
          },
          failOnceTool: {
            type: "string",
            description: "Optional tool name for bounded failure-handling injection.",
          },
          maxIterations: {
            type: "number",
            description: "Agent loop iteration budget. Default: 8.",
          },
          workflow: VIDEO_WORKFLOW_INPUT_SCHEMA,
          frontendUrl: {
            type: "string",
            description: "Optional product frontend URL to record in the demo pack after all live gates are approved.",
          },
          backendHealthUrl: {
            type: "string",
            description: "Optional control-plane health URL to record in the demo pack after all live gates are approved.",
          },
        },
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults(BROWSER_API_TOOL, BROWSER_API_TOOL_ANNOTATIONS),
    ...buildStorageSyncLocalToolDefinitions().map((tool) => withLocalMcpDescriptorDefaults(tool)),
    withLocalMcpDescriptorDefaults({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionDetectLanguageVariant, description: "Use this when a local MCP host needs SEA-LION sidecar language, regional variant, register, and code-switching detection before routing Southeast Asian language work.", outputSchema: SEALION_TOOL_OUTPUT_SCHEMA, inputSchema: SEALION_TEXT_INPUT_SCHEMA }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionTranslateLocalize, description: "Use this when a local MCP host needs SEA-LION sidecar translation plus Southeast Asian localization notes from the hosted API.", outputSchema: SEALION_TOOL_OUTPUT_SCHEMA, inputSchema: SEALION_TRANSLATE_INPUT_SCHEMA }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({ name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.sealionSafetyCheck, description: "Use this when a local MCP host needs SEA-LION sidecar advisory SEA-Guard safety classification for Southeast Asian language or culture-sensitive content.", outputSchema: SEALION_TOOL_OUTPUT_SCHEMA, inputSchema: SEALION_SAFETY_INPUT_SCHEMA }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.htmlVideoRender,
      description:
        "Use this when a local MCP host needs to render an HTML + CSS + data document into an MP4 video artifact through the Knowgrph HTML Video Renderer pipeline.",
      outputSchema: HTML_VIDEO_RENDER_OUTPUT_SCHEMA,
      inputSchema: HTML_VIDEO_RENDER_INPUT_SCHEMA,
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.annotateImage,
      description:
        "Use this when a local MCP host needs to run browser-local image annotation into LLM-ready structured JSON without paid inference.",
      outputSchema: ANNOTATE_OUTPUT_SCHEMA,
      inputSchema: ANNOTATE_IMAGE_INPUT_SCHEMA,
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame,
      description:
        "Use this when a local MCP host needs to annotate one browser-extracted video frame into LLM-ready structured JSON without server-side frame extraction.",
      outputSchema: ANNOTATE_OUTPUT_SCHEMA,
      inputSchema: ANNOTATE_VIDEO_FRAME_INPUT_SCHEMA,
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_MEMORY_LAYER_MCP_TOOL_NAMES.add,
      description:
        "Use this when a local MCP host needs to persist an explicitly scoped user, agent, run, or app memory through the Knowgrph memory harness without storing credentials or hardcoded IDs.",
      outputSchema: MEMORY_ADD_OUTPUT_SCHEMA,
      inputSchema: MEMORY_ADD_INPUT_SCHEMA,
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    ...buildPersistentMemoryToolDefinitions({
      toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
      withDefaults: withLocalMcpDescriptorDefaults,
      readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS,
      mutationAnnotations: LOCAL_IDEMPOTENT_MUTATION_TOOL_ANNOTATIONS,
    }),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_MEMORY_LAYER_MCP_TOOL_NAMES.assemblePrompt,
      description:
        "Use this when a local MCP host needs to inject ranked memory results into a bounded system-message context section without exposing internal memory IDs or scores.",
      outputSchema: PROMPT_ASSEMBLER_OUTPUT_SCHEMA,
      inputSchema: PROMPT_ASSEMBLER_INPUT_SCHEMA,
    }, READ_ONLY_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_MEMORY_LAYER_MCP_TOOL_NAMES.extractProcedural,
      description:
        "Use this when a local MCP host needs to convert an existing harness run into a reusable KGC markdown procedural-memory document and optionally persist a scoped summary in the memory store.",
      outputSchema: PROCEDURAL_MEMORY_EXTRACT_OUTPUT_SCHEMA,
      inputSchema: PROCEDURAL_MEMORY_EXTRACT_INPUT_SCHEMA,
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_MEMORY_LAYER_MCP_TOOL_NAMES.materializeUserModel,
      description:
        "Use this when a local MCP host needs a deterministic USER_MODEL markdown document materialized from the scoped in-repo memory store and mirrored into a stable workspace path without external profile infrastructure.",
      outputSchema: USER_MODEL_MATERIALIZE_OUTPUT_SCHEMA,
      inputSchema: USER_MODEL_MATERIALIZE_INPUT_SCHEMA,
    }, LOCAL_PROCESS_TOOL_ANNOTATIONS),
    ...buildProbeTreeLocalToolDefinitions({
      toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
      withDefaults: withLocalMcpDescriptorDefaults,
      readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS,
      processAnnotations: LOCAL_PROCESS_TOOL_ANNOTATIONS,
    }),
    ...buildSmeRiskCopilotLocalToolDefinitions({
      toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
      withDefaults: withLocalMcpDescriptorDefaults,
      readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS,
      processAnnotations: LOCAL_PROCESS_TOOL_ANNOTATIONS,
    }),
    withLocalMcpDescriptorDefaults({
      ...AGENTIC_CANVAS_OS_DOCS_TOOL_DEFINITION,
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticCanvasOsDocsInvoke,
    }, READ_ONLY_TOOL_ANNOTATIONS),
    buildSkillEvolutionToolDefinition({ withDefaults: withLocalMcpDescriptorDefaults }),
    withLocalMcpDescriptorDefaults({
      ...REPOSITORY_PACK_TOOL_DEFINITION,
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.repositoryPack,
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    ...WORKSPACE_ARTIFACT_TOOL_DEFINITIONS.map((definition) => withLocalMcpDescriptorDefaults(definition, definition.annotations)),
    ...buildLocalRunToolDefinitions({ toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES, withDefaults: withLocalMcpDescriptorDefaults }),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.exportPublish,
      description: "Use this when a local MCP host needs to publish a frontmatter-first KGC Markdown artifact to a stable Google Sheet/Slides or Microsoft XLSX/PPTX identity; each run may overwrite remote content, create a revision, and append the local ledger.",
      inputSchema: EXPORT_PUBLISH_INPUT_SCHEMA,
      outputSchema: EXPORT_PUBLISH_OUTPUT_SCHEMA,
    }, EXTERNAL_MUTATING_PROCESS_TOOL_ANNOTATIONS),
    ...buildExternalToolGatewayDefinitions({
      toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES,
      withDefaults: withLocalMcpDescriptorDefaults,
      readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS,
    }),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerStartRun,
      description:
        "Use this when a local MCP host needs to validate a Knowgrph AI Showrunner Creative_Brief and start a bounded dry-run or approval-gated Pipeline_Run.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          brief_path: { type: "string", description: "Workspace Source_File path for a knowgrph-showrunner-brief/v1 document." },
          brief_markdown: { type: "string", description: "Inline knowgrph-showrunner-brief/v1 Markdown." },
          dry_run: { type: "boolean", default: true, description: "When true, deterministic mock turns produce the full artifact structure with zero paid calls." },
        },
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerRunStatus,
      description:
        "Use this when a local MCP host needs to read the current AI Showrunner Pipeline_Run lifecycle state without mutating Creative_State.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: SHOWRUNNER_RUN_ID_INPUT_SCHEMA,
    }, READ_ONLY_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerPostChoice,
      description:
        "Use this when a local MCP host needs to route a player choice signal to the Narrative_Game_Engine message bus for a running showrunner run.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["run_id", "choice_signal"],
        properties: {
          run_id: { type: "string" },
          choice_signal: { type: "string" },
        },
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerSubmitCritique,
      description:
        "Use this when a local MCP host needs to submit critique text for a Writers_Room draft through the showrunner message bus.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["run_id", "draft_version", "critique_text"],
        properties: {
          run_id: { type: "string" },
          draft_version: { type: "number" },
          critique_text: { type: "string" },
        },
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerApproveStage,
      description:
        "Use this when a local MCP host needs to release an AI Showrunner approval or budget gate and resume the Pipeline_Run.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["run_id", "stage_id"],
        properties: {
          run_id: { type: "string" },
          stage_id: { type: "string" },
        },
      },
    }, LOCAL_IDEMPOTENT_PROCESS_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults({
      name: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.showrunnerGetArtifact,
      description:
        "Use this when a local MCP host needs to read the Source_File path for a Showrunner artifact without mutating Creative_State or triggering turns.",
      outputSchema: SHOWRUNNER_TOOL_OUTPUT_SCHEMA,
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["run_id", "artifact_type"],
        properties: {
          run_id: { type: "string" },
          artifact_type: {
            type: "string",
            enum: ["manifest", "failure_report", "narration_manifest", "choice_graph", "revision_history", "cost_log", "state"],
          },
        },
      },
    }, READ_ONLY_TOOL_ANNOTATIONS),
    ...buildAgentSandboxPolicyToolDefinitions({ toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES, withDefaults: withLocalMcpDescriptorDefaults, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS }),
    ...buildEcsLocalToolDefinitions({ withDefaults: withLocalMcpDescriptorDefaults, annotations: LOCAL_PROCESS_TOOL_ANNOTATIONS }),
    ...buildPaymentToolDefinitions().map((definition) => withLocalMcpDescriptorDefaults(definition, definition.annotations)),
    withLocalMcpDescriptorDefaults(buildOsStatusToolDefinition(), READ_ONLY_TOOL_ANNOTATIONS),
    withLocalMcpDescriptorDefaults(
      buildVdeoxplnLocalToolDefinition(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.vdeoxplnList),
      READ_ONLY_TOOL_ANNOTATIONS,
    ),
    ...buildAgentApplicationToolDefinitions({ toolNames: KNOWGRPH_LOCAL_MCP_TOOL_NAMES, withDefaults: withLocalMcpDescriptorDefaults }),
    buildVoiceStudioLocalToolDefinition({ withDefaults: withLocalMcpDescriptorDefaults }),
  ];
};
