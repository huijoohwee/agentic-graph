import {
  invokeAgenticOsDocsMcpBridge,
} from '@/features/agent-ready/agenticOsDocsMcpClient'
import {
  AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS,
  normalizeAgenticOsDocsMcpInvocationTokens,
  type AgenticOsDocsMcpBridgeSuccess,
  type AgenticOsDocsMcpInvocationResolution,
} from '@/features/agent-ready/agenticOsDocsMcpBridgeContract'
import {
  CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT,
  CHAT_BASE_RESPONSE_CONTRACT_PROMPT,
} from './chatResponseBaseContract'
import {
  extractChatResponseStructuredSurface,
  type ChatResponseStructuredSurface,
} from './chatResponseStructuredContent'
import {
  buildChatInvocationSystemPrompt,
} from './chatInvocationRegistry'
import {
  buildAgenticOsRuntimeInvocationSystemPrompt,
  buildRuntimeInvocationRoutingSystemPrompt,
  collectAgenticOsRuntimeInvocations,
} from './chatRuntimeInvocationProfile'
import {
  resolveChatRuntimeInvocationProviderMessageText,
} from './chatRuntimeInvocationQuery'
import {
  buildChatSkillInvocationSystemPrompt,
  parseChatSkillSlashInvocation,
} from './chatSkillRegistry'

export const HEADLESS_RESPONSE_RUN_SCHEMA = 'agentic-graph-headless-response-run/v1' as const

export type HeadlessResponseSource =
  | { kind: 'chat'; id: string }
  | { kind: 'widget'; id: string }

export type HeadlessResponseContract = 'plain' | 'kgc'

export type HeadlessResponseSystemMessage = {
  role: 'system'
  content: string
}

export type HeadlessResponsePreparation = {
  runId: string
  source: HeadlessResponseSource
  requestText: string
  providerText: string
  responseContract: HeadlessResponseContract
  systemMessages: HeadlessResponseSystemMessage[]
  invocation: {
    tokens: string[]
    mcpResponse: AgenticOsDocsMcpBridgeSuccess | null
  }
}

export type HeadlessResponseRunResult = {
  schema: typeof HEADLESS_RESPONSE_RUN_SCHEMA
  runId: string
  source: HeadlessResponseSource
  status: 'ok' | 'error'
  requestText: string
  providerText: string
  responseContract: HeadlessResponseContract
  responseText: string
  structuredSurface: ChatResponseStructuredSurface | null
  invocation: {
    tokens: string[]
    tool: string | null
    mcpInvoked: boolean
    resolutions: AgenticOsDocsMcpInvocationResolution[]
  }
  output: {
    modelId: string | null
    artifactPath: string | null
  }
}

export type HeadlessResponseRunReceipt = {
  schema: typeof HEADLESS_RESPONSE_RUN_SCHEMA
  runId: string
  source: HeadlessResponseSource
  status: 'ok' | 'error'
  responseContract: HeadlessResponseContract
  invocation: {
    tokens: string[]
    tool: string | null
    mcpInvoked: boolean
  }
  output: {
    modelId: string | null
    artifactPath: string | null
  }
}

export function isHeadlessResponseRunResult(value: unknown): value is HeadlessResponseRunResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Partial<HeadlessResponseRunResult>
  const source = result.source as Partial<HeadlessResponseSource> | undefined
  const invocation = result.invocation as Partial<HeadlessResponseRunResult['invocation']> | undefined
  const output = result.output as Partial<HeadlessResponseRunResult['output']> | undefined
  return result.schema === HEADLESS_RESPONSE_RUN_SCHEMA
    && typeof result.runId === 'string'
    && (source?.kind === 'chat' || source?.kind === 'widget')
    && typeof source.id === 'string'
    && (result.status === 'ok' || result.status === 'error')
    && typeof result.requestText === 'string'
    && typeof result.providerText === 'string'
    && (result.responseContract === 'plain' || result.responseContract === 'kgc')
    && typeof result.responseText === 'string'
    && Array.isArray(invocation?.tokens)
    && Array.isArray(invocation?.resolutions)
    && typeof invocation?.mcpInvoked === 'boolean'
    && (invocation?.tool === null || typeof invocation?.tool === 'string')
    && (output?.modelId === null || typeof output?.modelId === 'string')
    && (output?.artifactPath === null || typeof output?.artifactPath === 'string')
    && (result.structuredSurface === null || (
      typeof result.structuredSurface === 'object' && !Array.isArray(result.structuredSurface)
    ))
}

export function isHeadlessResponseRunReceipt(value: unknown): value is HeadlessResponseRunReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const receipt = value as Partial<HeadlessResponseRunReceipt>
  const source = receipt.source as Partial<HeadlessResponseSource> | undefined
  const invocation = receipt.invocation as Partial<HeadlessResponseRunReceipt['invocation']> | undefined
  const output = receipt.output as Partial<HeadlessResponseRunReceipt['output']> | undefined
  const tokens = Array.isArray(invocation?.tokens) ? invocation.tokens : []
  const normalizedTokens = normalizeAgenticOsDocsMcpInvocationTokens(tokens)
  return receipt.schema === HEADLESS_RESPONSE_RUN_SCHEMA
    && typeof receipt.runId === 'string'
    && (source?.kind === 'chat' || source?.kind === 'widget')
    && typeof source.id === 'string'
    && (receipt.status === 'ok' || receipt.status === 'error')
    && (receipt.responseContract === 'plain' || receipt.responseContract === 'kgc')
    && normalizedTokens.length === tokens.length
    && normalizedTokens.every((token, index) => token === tokens[index])
    && typeof invocation?.mcpInvoked === 'boolean'
    && (invocation?.tool === null || typeof invocation?.tool === 'string')
    && (output?.modelId === null || typeof output?.modelId === 'string')
    && (output?.artifactPath === null || typeof output?.artifactPath === 'string')
}

export function projectHeadlessResponseRunReceipt(
  result: HeadlessResponseRunResult,
  artifactPathOverride?: string | null,
): HeadlessResponseRunReceipt {
  const artifactPath = artifactPathOverride === undefined
    ? result.output.artifactPath
    : String(artifactPathOverride || '').trim() || null
  return {
    schema: result.schema,
    runId: result.runId,
    source: result.source,
    status: result.status,
    responseContract: result.responseContract,
    invocation: {
      tokens: normalizeAgenticOsDocsMcpInvocationTokens(result.invocation.tokens),
      tool: result.invocation.tool,
      mcpInvoked: result.invocation.mcpInvoked,
    },
    output: {
      modelId: result.output.modelId,
      artifactPath,
    },
  }
}

type PrepareHeadlessResponseRunArgs = {
  runId: string
  source: HeadlessResponseSource
  requestText: string
  providerText?: string
  responseContract: HeadlessResponseContract
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
  provider: string
  model: string | null
}

type PrepareHeadlessResponseRunDependencies = {
  invokeDocsMcp?: typeof invokeAgenticOsDocsMcpBridge
}

const toSystemMessage = (content: string): HeadlessResponseSystemMessage | null => {
  const normalized = String(content || '').trim()
  return normalized ? { role: 'system', content: normalized } : null
}

const buildDocsMcpEvidencePrompt = (response: AgenticOsDocsMcpBridgeSuccess | null): string => {
  if (!response) return ''
  return [
    'Agentic OS docs MCP resolution evidence:',
    '- This is source-backed invocation metadata only; it is not proof that a command or external tool executed.',
    JSON.stringify({
      tool: response.tool,
      mcpInvoked: response.mcpInvoked,
      invocations: response.invocations.map(invocation => ({
        token: invocation.token,
        ok: invocation.ok,
        kind: invocation.kind,
        label: invocation.label,
        summary: invocation.summary,
        sourcePath: invocation.sourcePath,
        error: invocation.error,
      })),
    }),
  ].join('\n')
}

export async function prepareHeadlessResponseRun(
  args: PrepareHeadlessResponseRunArgs,
  dependencies: PrepareHeadlessResponseRunDependencies = {},
): Promise<HeadlessResponsePreparation> {
  const runId = String(args.runId || '').trim()
  const requestText = String(args.requestText || '').trim()
  const sourceId = String(args.source.id || '').trim()
  if (!runId) throw new Error('Headless response preparation requires a run ID.')
  if (!sourceId) throw new Error('Headless response preparation requires a source ID.')
  if (!requestText) throw new Error('Headless response preparation requires request text.')

  const recognizedInvocations = collectAgenticOsRuntimeInvocations(requestText)
  const tokens = normalizeAgenticOsDocsMcpInvocationTokens(
    recognizedInvocations.map(invocation => invocation.token),
  )
  if (tokens.length !== recognizedInvocations.length) {
    throw new Error(
      `Headless response runs support at most ${AGENTIC_OS_DOCS_MCP_MAX_INVOCATION_TOKENS} unique Agentic OS invocation tokens.`,
    )
  }
  const invokeDocsMcp = dependencies.invokeDocsMcp || invokeAgenticOsDocsMcpBridge
  const mcpResponse = tokens.length > 0
    ? await invokeDocsMcp({ invocationTokens: tokens })
    : null
  const failedInvocation = mcpResponse?.invocations.find(invocation => invocation.ok !== true)
  if (failedInvocation) {
    throw new Error(failedInvocation.error || `MCP invocation ${failedInvocation.token} did not resolve.`)
  }

  const baseContract = args.responseContract === 'kgc'
    ? CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT
    : CHAT_BASE_RESPONSE_CONTRACT_PROMPT
  const invocationPrompt = buildChatInvocationSystemPrompt({
    userQuery: requestText,
    chatProvider: args.provider,
    chatModel: args.model,
  })
  const agenticOsPrompt = buildAgenticOsRuntimeInvocationSystemPrompt(requestText)
  const routingPrompt = buildRuntimeInvocationRoutingSystemPrompt(requestText)
  const skillInvocation = parseChatSkillSlashInvocation(requestText)
  const skillPrompt = skillInvocation
    ? buildChatSkillInvocationSystemPrompt({
        invocation: skillInvocation,
        chatStorageTarget: args.chatStorageTarget,
      })
    : ''
  const systemMessages = [
    baseContract,
    invocationPrompt,
    agenticOsPrompt,
    routingPrompt,
    skillPrompt,
    buildDocsMcpEvidencePrompt(mcpResponse),
  ].map(toSystemMessage).filter((message): message is HeadlessResponseSystemMessage => Boolean(message))

  return {
    runId,
    source: { ...args.source, id: sourceId },
    requestText,
    providerText: String(args.providerText || '').trim()
      || resolveChatRuntimeInvocationProviderMessageText(requestText),
    responseContract: args.responseContract,
    systemMessages,
    invocation: { tokens, mcpResponse },
  }
}

export function buildHeadlessResponseProviderPrompt(
  prepared: HeadlessResponsePreparation,
): string {
  return prepared.providerText
}

export function finalizeHeadlessResponseRun(args: {
  prepared: HeadlessResponsePreparation
  responseText: string
  status?: 'ok' | 'error'
  modelId?: string | null
  artifactPath?: string | null
}): HeadlessResponseRunResult {
  const responseText = String(args.responseText || '')
  const mcpResponse = args.prepared.invocation.mcpResponse
  return {
    schema: HEADLESS_RESPONSE_RUN_SCHEMA,
    runId: args.prepared.runId,
    source: args.prepared.source,
    status: args.status === 'error' ? 'error' : 'ok',
    requestText: args.prepared.requestText,
    providerText: args.prepared.providerText,
    responseContract: args.prepared.responseContract,
    responseText,
    structuredSurface: extractChatResponseStructuredSurface(responseText),
    invocation: {
      tokens: [...args.prepared.invocation.tokens],
      tool: mcpResponse?.tool || null,
      mcpInvoked: mcpResponse?.mcpInvoked === true,
      resolutions: mcpResponse ? [...mcpResponse.invocations] : [],
    },
    output: {
      modelId: String(args.modelId || '').trim() || null,
      artifactPath: String(args.artifactPath || '').trim() || null,
    },
  }
}
