import {
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_GOOGLE_CLOUD,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_QWEN,
  getChatProviderLabel,
} from '@/lib/chatEndpoint'
import { AGENT_DEFINITION_REGISTRY } from '../../../../contracts/agent-runtime.schema.js'

export const AGENTICGRAPH_AGENT_READY_MAIN_PANEL_ENTRY_TABS = [
  'mcp',
  'integrations',
  'commerce',
] as const

export const AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS = [
  'integrations',
  'mcp',
] as const

export const AGENTICGRAPH_SUPERAGENT_RESEARCH_DEMO_SHARE_URL = '/agenticgraph/share/agenticgraph-research-agent-demo'

export const AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS = [
  CHAT_PROVIDER_OPENAI,
  CHAT_PROVIDER_BYTEPLUS,
  CHAT_PROVIDER_AGNES,
  CHAT_PROVIDER_MIROMIND,
  CHAT_PROVIDER_QWEN,
  CHAT_PROVIDER_GOOGLE_CLOUD,
] as const

export const AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS =
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS.map(providerId => getChatProviderLabel(providerId))

export const AGENTICGRAPH_SUPERAGENT_PROVIDER_NODE_IDS = {
  [CHAT_PROVIDER_OPENAI]: 'integration_openai',
  [CHAT_PROVIDER_BYTEPLUS]: 'integration_byteplus',
  [CHAT_PROVIDER_AGNES]: 'integration_agnes',
  [CHAT_PROVIDER_MIROMIND]: 'integration_miromind',
  [CHAT_PROVIDER_QWEN]: 'integration_qwen',
  [CHAT_PROVIDER_GOOGLE_CLOUD]: 'integration_google_cloud',
} as const satisfies Record<(typeof AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS)[number], string>

export const AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID = 'kgra_superagent_harness'

export const AGENTICGRAPH_SUPERAGENT_REVIEW_NODE_ID = 'review_audit'

export const AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID = 'edge_superagent_to_review'

export const AGENTICGRAPH_SUPERAGENT_INTEGRATION_EDGE_TYPE = 'integration_provider_signal'

export const AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_EDGE_TYPE = 'agent_runtime_surface_signal'

export const AGENTICGRAPH_SUPERAGENT_SUBAGENT_EDGE_TYPE = 'agent_subagent_signal'

export const AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER = 'storyboard'

export const AGENTICGRAPH_SUPERAGENT_RICH_MEDIA_OUTPUT_NODE_IDS = [
  'panel_text_research_brief',
  'panel_image_evidence_map',
  'panel_chart_guardrails',
] as const

export const AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID = 'swarm_prediction_world' as const

export const AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_ID = 'edge_superagent_to_swarm_prediction' as const

export const AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_TYPE = 'swarm_seed_signal' as const

export const AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS = [
  'panel_swarm_text_report',
  'panel_swarm_world_image',
  'panel_swarm_prediction_chart',
] as const

export const AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_EDGE_TYPES = [
  'swarm_prediction_report_signal',
  'swarm_world_image_signal',
  'swarm_prediction_chart_html',
] as const

export const AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS = [
  'message_gateway',
  'sandbox',
  'memory',
  'tools',
  'skills',
  'subagents',
] as const

export const AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_TYPE = 'runtime_surface'

export const AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS = {
  message_gateway: 'kgra_runtime_message_gateway',
  sandbox: 'kgra_runtime_sandbox',
  memory: 'kgra_runtime_memory',
  tools: 'kgra_runtime_tools',
  skills: 'kgra_runtime_skills',
  subagents: 'kgra_runtime_subagents',
} as const satisfies Record<(typeof AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS)[number], string>

export const AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_TYPE = 'subagent'

const SUPERAGENT_SURFACE_PROJECTION =
  AGENT_DEFINITION_REGISTRY.profiles['superagent.full.v1'].surfaceProjection

export const AGENTICGRAPH_SUPERAGENT_SUBAGENT_IDS =
  Object.freeze([...SUPERAGENT_SURFACE_PROJECTION.subagents])

export const AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS: Readonly<Record<string, string>> =
  Object.freeze(Object.fromEntries(AGENTICGRAPH_SUPERAGENT_SUBAGENT_IDS.map(subagentId => [
    subagentId,
    `kgra_subagent_${subagentId}`,
  ])))

export const AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES =
  Object.freeze([...SUPERAGENT_SURFACE_PROJECTION.taskCapabilities])

export const AGENTICGRAPH_SUPERAGENT_TASK_LEVELS = [
  'quick_triage',
  'bounded_compile',
  'deep_research',
  'parallel_build',
] as const
