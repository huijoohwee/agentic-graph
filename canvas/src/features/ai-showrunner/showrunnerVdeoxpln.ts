import { SHOWRUNNER_MCP_TOOL_NAMES } from './showrunnerMcpTools'
import { SHOWRUNNER_WIDGET_ENTRY } from './showrunnerFlowNode'

export const AGENTICGRAPH_AI_SHOWRUNNER_VDEOXPLN_ID = 'agenticgraph-ai-showrunner' as const

export const AGENTICGRAPH_AI_SHOWRUNNER_VDEOXPLN_ENTRY = Object.freeze({
  id: AGENTICGRAPH_AI_SHOWRUNNER_VDEOXPLN_ID,
  title: 'AgenticGraph AI Showrunner',
  purpose: 'Run provider-neutral multi-agent creative pipelines for podcasts, narrative games, and writers rooms through existing Source Files, memory, MCP, KGC, and Storyboard Widget owners.',
  scope: 'local-stdio-and-browser-local',
  mutation: 'local-approval-gated',
  triggers: ['ai showrunner', 'podcast pipeline', 'narrative game', 'writers room', 'creative state', 'multi-agent orchestration'],
  inputs: ['creative brief markdown', 'run id', 'choice signal', 'critique text', 'operator approval'],
  outputs: ['pipeline run state', 'creative state entries', 'script', 'choice graph', 'revision history', 'artifact manifest'],
  owners: [
    'canvas/src/features/ai-showrunner',
    'canvas/src/features/chat/chatKgcCanvasApply.ts',
    'canvas/src/features/source-files',
    'canvas/src/features/memory/aiAgentsMemoryLayerContract.mjs',
    'canvas/src/lib/graph/semanticKey.ts',
    'mcp/local-tool-contract.js',
    SHOWRUNNER_WIDGET_ENTRY.id,
  ],
  tools: {
    published: [],
    browserLocal: [],
    local: Object.values(SHOWRUNNER_MCP_TOOL_NAMES),
  },
  workflow: [
    'Validate the frontmatter-first Creative_Brief before any agent turn.',
    'Run bounded role turns through dry-run or injected provider-neutral dispatch.',
    'Persist append-only state, token logs, and manifests through Source Files.',
  ],
  aiPolicy: {
    mode: 'optional-via-local-tools',
    maxAttempts: 1,
    tokenBudget: 'pipeline-run-owned',
    fallback: 'Halt at approval or structured error while preserving committed Creative_State.',
  },
  artifactPolicy: {
    persistence: 'source-files',
    graphMaterialization: 'kgc-validation-to-canvas-apply',
    semanticKeyInputs: ['run_id', 'agent_role', 'turn_index', 'content_hash'],
  },
  validation: ['vdeoxpln:check', 'mcpLocalToolContract', 'showrunnerDryRun'],
  publish: ['local-mcp-docs', 'mainpanel-mcp'],
})
