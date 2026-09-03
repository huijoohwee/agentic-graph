import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import { CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT } from '@/lib/chatEndpoint'

export const BYTEPLUS_MODELARK_MCP_DOC_AREA = 'BytePlus ModelArk Remote MCP'
export const BYTEPLUS_MODELARK_MCP_DOCS_URL = 'https://docs.byteplus.com/en/docs/ModelArk/1827534'
export const BYTEPLUS_MODELARK_MCP_RESPONSES_DOCS_URL =
  'https://docs.byteplus.com/en/docs/ModelArk/Create_model_request'
export const BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL = 'https://docs.byteplus.com/en/docs/ModelArk/1330310'
export const BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL =
  'https://docs.byteplus.com/en/docs/ModelArk/1666945'
export const BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL =
  'https://docs.byteplus.com/en/docs/ModelArk/1520757'
export const BYTEPLUS_MODELARK_MCP_SEEDANCE_TUTORIAL_DOCS_URL =
  'https://docs.byteplus.com/en/docs/ModelArk/2291680'
export const BYTEPLUS_MODELARK_MCP_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3'
export const BYTEPLUS_MODELARK_MCP_AUTH_ENV = 'ARK_API_KEY'
export const BYTEPLUS_MODELARK_MCP_BETA_HEADER = 'ark-beta-mcp'
export const BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE = 'true'
export const BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL = CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT
export const BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL = 'seedream-4-0-250828'
export const BYTEPLUS_MODELARK_MCP_VIDEO_MODEL_FAMILY = 'Seedance / Dreamina Seedance operator-selected model'
export const BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY = 'byteplus-modelark-media'
export const BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER = '<REMOTE_MCP_SERVER_LABEL>'
export const BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER = '<REMOTE_MCP_STREAMABLE_HTTP_URL>'
export const BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED = '2026-06-15T10:23:10+00:00'
export const BYTEPLUS_MODELARK_MCP_RESPONSES_TOOL_CONFIG_KEY =
  'byteplusModelArkMcp.responses_tool_config'
export const BYTEPLUS_MODELARK_MCP_CODEX_CONFIG_KEY = 'byteplusModelArkMcp.remote_config.codex'
export const BYTEPLUS_MODELARK_MCP_MEDIA_PROFILE_KEY = 'byteplusModelArkMcp.media.profile'

type BytePlusModelArkMcpDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const BYTEPLUS_MODELARK_MCP_TOOLTIP_ROLE = 'BytePlus ModelArk Remote MCP'

export function buildBytePlusModelArkMcpResponsesToolConfigJson(): string {
  return JSON.stringify({
    tools: [
      {
        type: 'mcp',
        server_label: BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
        server_url: BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
        require_approval: 'operator-configured',
      },
    ],
  }, null, 2)
}

export function buildBytePlusModelArkMcpCodexAddCommand(): string {
  return `codex mcp add ${BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY} --url '${BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER}'`
}

export function buildBytePlusModelArkMcpMediaProfileJson(): string {
  return JSON.stringify({
    codexMcpServer: BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY,
    provider: 'byteplus-modelark',
    authEnv: BYTEPLUS_MODELARK_MCP_AUTH_ENV,
    modelArk: {
      baseUrl: BYTEPLUS_MODELARK_MCP_BASE_URL,
      betaHeader: {
        name: BYTEPLUS_MODELARK_MCP_BETA_HEADER,
        value: BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE,
      },
      invocationApi: 'Responses API',
      remoteMcpTransport: 'streamable-http',
    },
    remoteMcp: {
      serverLabelPlaceholder: BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
      serverUrlPlaceholder: BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
      urlSource: 'Operator-selected cloud-deployed MCP or remote MCP marketplace details page',
    },
    mediaGeneration: {
      image: {
        intent: 'image_generation',
        outputKind: 'image',
        docsUrl: BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL,
        defaultModel: BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL,
      },
      audio: {
        intent: 'audio_for_video_generation',
        outputKind: 'audio-conditioned-video-or-generated-video-audio',
        docsUrl: BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL,
        boundary: 'ModelArk video generation supports audio input and generate_audio; this row does not claim a standalone audio-only output API.',
      },
      video: {
        intent: 'video_generation',
        outputKind: 'video',
        docsUrl: BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL,
        modelFamily: BYTEPLUS_MODELARK_MCP_VIDEO_MODEL_FAMILY,
        generateAudioDefault: true,
      },
    },
    boundaries: {
      browserStoresArkApiKey: false,
      browserStoresRemoteMcpSecrets: false,
      codexConfigUsesOperatorUrlPlaceholder: true,
      runtimeReadyAfterOperatorAddsRemoteMcp: true,
    },
  }, null, 2)
}

export function buildBytePlusModelArkMcpReadinessManifestJson(): string {
  return JSON.stringify({
    byteplusModelArkRemoteMcp: {
      docsUrl: BYTEPLUS_MODELARK_MCP_DOCS_URL,
      docsLastUpdated: BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED,
      invocation: {
        api: 'Responses API',
        baseUrl: BYTEPLUS_MODELARK_MCP_BASE_URL,
        model: BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL,
        betaHeader: {
          name: BYTEPLUS_MODELARK_MCP_BETA_HEADER,
          value: BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE,
        },
        authEnv: BYTEPLUS_MODELARK_MCP_AUTH_ENV,
        toolConfig: JSON.parse(buildBytePlusModelArkMcpResponsesToolConfigJson()),
      },
      remoteMcp: {
        urlSource: 'Operator-selected MCP marketplace or remote MCP provider details page',
        transport: 'streamable-http',
        serverUrlPlaceholder: BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
        serverLabelPlaceholder: BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
      },
      codex: {
        serverKey: BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY,
        addCommand: buildBytePlusModelArkMcpCodexAddCommand(),
        mediaProfile: JSON.parse(buildBytePlusModelArkMcpMediaProfileJson()),
      },
      boundaries: {
        browserStoresArkApiKey: false,
        browserStoresRemoteMcpSecrets: false,
        remoteMcpUrlIsOperatorOwned: true,
        approvalPolicyIsOperatorOwned: true,
        deployedUntilOperatorDeploys: false,
      },
    },
  }, null, 2)
}

const BYTEPLUS_MODELARK_MCP_DOC_ROWS: ReadonlyArray<BytePlusModelArkMcpDocRow> = [
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_DOCS_URL,
    responsibility: 'Official BytePlus ModelArk remote MCP documentation source.',
    searchHints: ['Cloud-deployed MCP', 'remote MCP', BYTEPLUS_MODELARK_MCP_DOCS_URL],
  },
  {
    key: 'docs.last_updated',
    typeLabel: 'datetime',
    value: BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED,
    responsibility: 'Doc freshness marker from the BytePlus page used by this SSOT.',
    searchHints: ['Last updated', 'June 15 2026', BYTEPLUS_MODELARK_MCP_DOC_LAST_UPDATED],
  },
  {
    key: 'api.scope',
    typeLabel: 'contract',
    value: 'Responses API only',
    responsibility: 'ModelArk remote MCP invocation surface.',
    notes: 'BytePlus documents cloud-deployed or remote MCP invocation only through the Responses API.',
    searchHints: ['Responses API', 'Create a Responses model request'],
  },
  {
    key: 'base_url',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_BASE_URL,
    responsibility: 'ModelArk API base URL used by the official remote-MCP examples.',
    notes: 'Region can be operator-specific; keep this visible as documentation, not as a forced runtime override.',
    searchHints: ['base_url', 'ark.ap-southeast.bytepluses.com', 'api/v3'],
  },
  {
    key: 'auth.env',
    typeLabel: 'env var',
    value: BYTEPLUS_MODELARK_MCP_AUTH_ENV,
    responsibility: 'Server-managed ModelArk API-key environment variable name.',
    notes: 'The browser surface names the environment variable only; it must not persist the API key value.',
    searchHints: ['ARK_API_KEY', 'api_key', 'server managed'],
  },
  {
    key: 'beta.header',
    typeLabel: 'header',
    value: `${BYTEPLUS_MODELARK_MCP_BETA_HEADER}: ${BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE}`,
    responsibility: 'ModelArk beta header required by the documented MCP test path.',
    searchHints: [BYTEPLUS_MODELARK_MCP_BETA_HEADER, BYTEPLUS_MODELARK_MCP_BETA_HEADER_VALUE],
  },
  {
    key: 'model.default',
    typeLabel: 'model',
    value: BYTEPLUS_MODELARK_MCP_DEFAULT_MODEL,
    responsibility: 'Default model ID shown in the BytePlus remote-MCP examples.',
    notes: 'Supported model eligibility still follows the live ModelArk model list and account permissions.',
    searchHints: ['seed-2-0-lite-260228', 'supported models', BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL],
  },
  {
    key: 'tool.type',
    typeLabel: 'tool kind',
    value: 'mcp',
    responsibility: 'Responses API tool type for cloud-deployed or remote MCP invocation.',
    searchHints: ['tools', 'type', 'mcp'],
  },
  {
    key: 'tool.server_label',
    typeLabel: 'string placeholder',
    value: BYTEPLUS_MODELARK_MCP_SERVER_LABEL_PLACEHOLDER,
    responsibility: 'Operator-owned label for the selected remote MCP server.',
    searchHints: ['server_label', 'remote MCP server label'],
  },
  {
    key: 'tool.server_url',
    typeLabel: 'url placeholder',
    value: BYTEPLUS_MODELARK_MCP_SERVER_URL_PLACEHOLDER,
    responsibility: 'Operator-owned Streamable HTTP URL copied from a remote MCP provider or marketplace.',
    notes: 'No default remote MCP endpoint is embedded because the BytePlus doc tells operators to choose and copy the invocation URL.',
    searchHints: ['server_url', 'MCP invocation URL', 'marketplace', 'Streamable HTTP'],
  },
  {
    key: 'codex.server_key',
    typeLabel: 'string',
    value: BYTEPLUS_MODELARK_MCP_CODEX_SERVER_KEY,
    responsibility: 'Stable local Codex MCP server name for BytePlus ModelArk media-generation routing.',
    searchHints: ['Codex MCP', 'byteplus-modelark-media', 'image audio video generation'],
  },
  {
    key: 'remote_config.codex',
    typeLabel: 'command',
    value: buildBytePlusModelArkMcpCodexAddCommand(),
    responsibility: 'Codex CLI MCP add command template for the operator-supplied ModelArk remote MCP URL.',
    notes: 'The command is runtime-ready after an operator replaces the Streamable HTTP placeholder with the selected remote MCP invocation URL.',
    searchHints: ['codex mcp add', 'remote MCP', 'Streamable HTTP', 'image audio video generation'],
  },
  {
    key: 'tool.require_approval',
    typeLabel: 'policy',
    value: 'operator-configured',
    responsibility: 'Human-approval policy for the selected remote MCP call.',
    notes: 'The official examples cover both no-approval and approval-gated scenarios; agentic-graph leaves this as an operator decision.',
    searchHints: ['require_approval', 'user approval', 'operator configured'],
  },
  {
    key: 'transport.required',
    typeLabel: 'transport',
    value: 'streamable-http',
    responsibility: 'Required MCP transport for ModelArk remote MCP invocation.',
    notes: 'BytePlus documents remote MCP invocation over MCP Streamable HTTP endpoints.',
    searchHints: ['Streamable HTTP', 'remote MCP', 'endpoint'],
  },
  {
    key: 'media.profile',
    typeLabel: 'object',
    value: buildBytePlusModelArkMcpMediaProfileJson(),
    responsibility: 'Agent-readable Codex media-generation profile for BytePlus ModelArk remote MCP use.',
    notes: 'This profile covers image, audio-for-video, and video generation without embedding credentials or a fabricated remote MCP endpoint.',
    searchHints: ['Codex', 'media profile', 'image generation', 'audio generation', 'video generation'],
  },
  {
    key: 'media.image_generation',
    typeLabel: 'capability',
    value: 'image_generation via ModelArk image generation docs',
    responsibility: 'Route Codex image-generation intent to the operator-selected BytePlus ModelArk remote MCP server.',
    searchHints: ['image generation', BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL, BYTEPLUS_MODELARK_MCP_DEFAULT_IMAGE_MODEL],
  },
  {
    key: 'media.audio_generation',
    typeLabel: 'capability',
    value: 'audio_for_video_generation via ModelArk video generation docs',
    responsibility: 'Represent audio intent through ModelArk video-generation audio inputs and generate_audio controls.',
    notes: 'The BytePlus media docs used here support audio inside video generation; this row intentionally avoids a standalone audio-only API claim.',
    searchHints: ['audio', 'generate_audio', 'video generation', BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL],
  },
  {
    key: 'media.video_generation',
    typeLabel: 'capability',
    value: 'video_generation via Seedance / Dreamina Seedance models',
    responsibility: 'Route Codex video-generation intent to the operator-selected BytePlus ModelArk remote MCP server.',
    searchHints: ['video generation', 'Seedance', 'Dreamina', BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL],
  },
  {
    key: 'media.generate_audio',
    typeLabel: 'boolean',
    value: true,
    responsibility: 'Default video-generation audio flag for compatible Seedance family requests.',
    notes: 'Operators still choose the concrete ModelArk model and request options supported by their account.',
    searchHints: ['generate_audio', 'Seedance 2.0', 'Seedance 1.5 Pro'],
  },
  {
    key: 'capability.ecosystem',
    typeLabel: 'capability',
    value: 'broad MCP ecosystem compatibility',
    responsibility: 'Use domain-specific remote MCP tools without implementing each tool locally.',
    searchHints: ['open-source ecosystem', 'domain-specific MCP tools'],
  },
  {
    key: 'capability.multi_turn',
    typeLabel: 'capability',
    value: 'multi-turn MCP tool calls',
    responsibility: 'Let ModelArk feed remote tool results into follow-up model turns for multi-step tasks.',
    searchHints: ['multi-turn tool calls', 'follow-up query'],
  },
  {
    key: 'capability.mixed_tools',
    typeLabel: 'capability',
    value: 'MCP tools plus user-defined functions',
    responsibility: 'Combine remote MCP tools with user-defined functions in the same Responses API request.',
    searchHints: ['mixed calls', 'user-defined functions', 'mcp_call'],
  },
  {
    key: 'limit.default_rpm',
    typeLabel: 'rate limit',
    value: '1000 RPM',
    responsibility: 'Document the account-level default request-per-minute limit for this remote-MCP path.',
    notes: 'Operators should request adjustment from BytePlus if workloads need a higher account limit.',
    searchHints: ['1000 RPM', 'rate limit', 'requests per minute'],
  },
  {
    key: 'billing.tool_calls',
    typeLabel: 'billing',
    value: 'base model token consumption only',
    responsibility: 'Clarify TCO expectations for remote-MCP tool calls.',
    notes: 'BytePlus documents no extra fees for MCP tool calls beyond base model token consumption.',
    searchHints: ['billing', 'token consumption', 'MCP tool calls'],
  },
  {
    key: 'responses_tool_config',
    typeLabel: 'object',
    value: buildBytePlusModelArkMcpResponsesToolConfigJson(),
    responsibility: 'Responses API tool template for operator-supplied remote MCP server details.',
    notes: 'The generated JSON intentionally contains placeholders only, not API keys, remote-provider secrets, or fabricated endpoints.',
    searchHints: ['Responses API', 'tools', 'server_label', 'server_url', 'require_approval'],
  },
  {
    key: 'readiness_manifest',
    typeLabel: 'object',
    value: buildBytePlusModelArkMcpReadinessManifestJson(),
    responsibility: 'Agent-readable remote-MCP readiness contract for dev-only operator review.',
    searchHints: ['readiness manifest', 'BytePlus', 'ModelArk', 'remote MCP'],
  },
  {
    key: 'docs.responses_request',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_RESPONSES_DOCS_URL,
    responsibility: 'BytePlus Responses model request parameter reference.',
    searchHints: ['Create a Responses model request', BYTEPLUS_MODELARK_MCP_RESPONSES_DOCS_URL],
  },
  {
    key: 'docs.model_list',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL,
    responsibility: 'BytePlus ModelArk model list and capability eligibility reference.',
    searchHints: ['Tool use', 'supported models', BYTEPLUS_MODELARK_MCP_MODEL_LIST_URL],
  },
  {
    key: 'docs.image_generation',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL,
    responsibility: 'BytePlus ModelArk image generation API reference for Codex media-generation routing.',
    searchHints: ['image generation', BYTEPLUS_MODELARK_MCP_IMAGE_GENERATION_DOCS_URL],
  },
  {
    key: 'docs.video_generation',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL,
    responsibility: 'BytePlus ModelArk video generation API reference, including generate_audio for compatible models.',
    searchHints: ['video generation', 'generate_audio', BYTEPLUS_MODELARK_MCP_VIDEO_GENERATION_DOCS_URL],
  },
  {
    key: 'docs.seedance_tutorial',
    typeLabel: 'url',
    value: BYTEPLUS_MODELARK_MCP_SEEDANCE_TUTORIAL_DOCS_URL,
    responsibility: 'Dreamina Seedance tutorial reference for multimodal video-generation examples.',
    searchHints: ['Dreamina', 'Seedance', 'audio', 'video', BYTEPLUS_MODELARK_MCP_SEEDANCE_TUTORIAL_DOCS_URL],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('manifest')) return 'json'
  return 'string'
}

export function getBytePlusModelArkMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-byteplus-modelark', rowKey)
}

export const BYTEPLUS_MODELARK_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  BYTEPLUS_MODELARK_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: BYTEPLUS_MODELARK_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['BytePlus ModelArk Responses API'],
      classes: ['Remote MCP'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `byteplusModelArkMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      tooltipRole: BYTEPLUS_MODELARK_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: [
        'byteplus modelark remote mcp',
        'cloud-deployed mcp',
        'responses api mcp tool',
        row.key,
        ...(row.searchHints || []),
      ],
      details,
    }
  })
