import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT,
  CHAT_BASE_RESPONSE_CONTRACT_PROMPT,
  CHAT_RESPONSE_BASE_PARAMETER_KEYS_GENERIC,
} from '@/features/chat/chatResponseBaseContract'
import { CHAT_SKILL_OPTIONS, parseChatSkillSlashInvocation } from '@/features/chat/chatSkillRegistry'
import { buildResolvableVarKeySet, validateChatMarkdown } from '@/features/chat/chatMarkdownValidation'
import { isKgcStructuredMarkdown, normalizeKgcAssistantBodyForStorage } from '@/features/chat/chatHistoryWorkspace'
import { normalizeKgcFrontmatterIdentityToFileName } from '@/features/chat/chatHistoryWorkspace.kgc.normalize'
import { extractKgcBlockFromAssistantText } from '@/features/chat/floatingPanelChat/floatingPanelChatKgcPayload'
import {
  resolveChatAgenticGraphAttempt,
  resolveKgcCorrectionInvalidMarkdown,
} from '@/features/chat/floatingPanelChat/floatingPanelChatKgcAttempt'
import { finalizeSubmitTerminalState } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitLifecycle'
import {
  handleSubmitIssueExit,
  resolveSubmitRuntimeFriendlyMessage,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitErrors'
import {
  executeChatSubmitTransportAttempt,
  resolvePreferredFallbackModel,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTransport'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import {
  buildStorageChatRelayDecisionFixture,
  buildSubmitArgsFixture,
} from '@/__tests__/helpers/chatSubmitArgsFixture'
import {
  buildChatSubmitPayloadMessages,
  buildChatSubmitRequestContext,
  createChatSubmitRequestSender,
  resolveChatSubmitTokenLimitKey,
  resolveInitialChatSubmitModel,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import {
  bootstrapAgenticGraphSubmitDraft,
  initializeChatSubmitOptimisticState,
  resolveChatSubmitRequestUrlOrSetError,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight'
import {
  CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR,
  executeFloatingPanelChatSubmitCoordinator,
} from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { useFloatingPanelChatSubmit } from '@/features/chat/floatingPanelChat/useFloatingPanelChatSubmit'
import { createChatAgenticGraphDraftWriter } from '@/features/chat/floatingPanelChat/floatingPanelChatStreaming'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import {
  ensureChatHistoryWorkspaceFilePath,
  toCanonicalKgcWorkspacePath,
  toKgcOutputWorkspacePath,
  toKgcTraceWorkspacePath,
} from '@/features/chat/chatHistoryWorkspace.paths'
import {
  publishLocalChatPipelineSurfaceSnapshot,
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import {
  buildCanonicalKgcTemplateFixtureDocument,
  buildNeutralKgcFixtureDocument,
} from '@/__tests__/helpers/neutralKgcFixture'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'

const readComputingFlowSample = (): string => {
  const p = resolveRepoTestDataPath('markdown-syntax-computing-flow-sample.md')
  return readFileSync(p, 'utf8')
}

const buildBaseTemplateSample = (): string => {
  return buildCanonicalKgcTemplateFixtureDocument()
}

export function testChatResponseContractPromptIncludesMarkdownGuidelineAndSurfaceKeys() {
  const prompt = CHAT_BASE_RESPONSE_CONTRACT_PROMPT

  const requiredSnippets = [
    'markdown syntax guidelines',
    'Storyboard Widget (2D), Multi-dimensional Table, and Kanban',
    '@edge:src:handle→tgt:handle',
    'ONE fenced yaml block with',
    'root key response:',
    'Tier B keys: product, domain, subject, objective, artifact, owner, version, status.',
    'Table cells: never empty',
    'TBD (unknown) or — (not applicable)', 'Persist every generated table or multi-dimensional table', 'YAML block scalar (`output: |-`)', 'Never author or persist table HTML', '`tables[]` records with neutral `columns` and `rows` data', 'V-10 generated tables',
    'Every streamed paragraph must remain relevant to the active query',
    'never output placeholder or example links',
    'GitGraph, Gantt, and Geospatial outputs follow the same rule',
    'typed `flow_diagrams` data (`mermaid_gitgraph`, `mermaid_gantt`)',
    'GeoJSON/FeatureCollection data may live in neutral `geoJson`/`geojson`/coordinate fields',
    'source/card/widget -> safe compute -> Rich Media Panel `outputSrcDoc`',
    'D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode outputs use neutral frontmatter data',
    '`kgCanvas2dRenderer`, `kgCanvasSurfaceMode`, `kgCanvasRenderMode`, `kgCanvas3dMode`, and `kgAsset*`',
    'do not mix them with document version-control GitGraph state, renderer-local Timeline UI, or Geospatial Mode toggles',
  ]
  requiredSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected chat response contract prompt to include: ${snippet}`)
    }
  })

  for (const snippet of [
    'GitGraph, Gantt, and Geospatial requests are dataflow too',
    '`type: mermaid_gitgraph` / `type: mermaid_gantt`',
    'GeoJSON/FeatureCollection payloads',
    'instead of emitting a static copied panel as authority',
    'D3 Graph, Flow Canvas, Dashboard, 3D Mode, and XR Mode requests are frontmatter data too',
  ]) {
    if (!CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT.includes(snippet)) {
      throw new Error(`Expected KGC response contract prompt to include: ${snippet}`)
    }
  }

  CHAT_RESPONSE_BASE_PARAMETER_KEYS_GENERIC.forEach(key => {
    if (!prompt.includes(`\`${key}\``)) {
      throw new Error(`Expected chat response contract prompt to include response key: ${key}`)
    }
  })
}

export function testBuildChatSubmitPayloadMessagesPlacesCorrectionBetweenSystemAndConversation() {
  const payload = buildChatSubmitPayloadMessages({
    systemMessages: [{ role: 'system', content: 'base-system' }],
    conversationMessages: [{ role: 'user', content: 'user-message' }],
    correctionPrompt: 'correction-system',
  })
  if (payload.length !== 3) {
    throw new Error(`Expected payload builder to return three messages, got ${payload.length}`)
  }
  if (payload[1]?.role !== 'system' || payload[1]?.content !== 'correction-system') {
    throw new Error(`Expected correction prompt to be inserted after system messages, got: ${JSON.stringify(payload)}`)
  }
  if (payload[2]?.role !== 'user') {
    throw new Error(`Expected conversation message to remain after correction prompt, got: ${JSON.stringify(payload)}`)
  }
}

export async function testChatStorybuildingSkillPromptIsModularAndPathNeutral() {
  const requiredVariantCommands = ['/storybuilding', '/investment-research-agent', '/sme-care-agent', '/video-agent']
  const resolvedVariantCommands = requiredVariantCommands.map(command => {
    const invocation = parseChatSkillSlashInvocation(`${command} build a useful artifact`)
    return invocation?.query === 'build a useful artifact' ? invocation.skill.slashCommand : null
  })
  if (resolvedVariantCommands.join('|') !== requiredVariantCommands.join('|')) {
    throw new Error(`Expected registered chatResponseBaseContract slash variants, got ${JSON.stringify(resolvedVariantCommands)}`)
  }
  const storybuilding = CHAT_SKILL_OPTIONS.find(option => option.id === 'storybuilding')
  if (!storybuilding) throw new Error('Expected Storybuilding chat skill to be registered')
  const invocation = parseChatSkillSlashInvocation('/storybuilding build source-backed demo')
  if (invocation?.skill.id !== 'storybuilding' || invocation.query !== 'build source-backed demo') {
    throw new Error(`Expected /storybuilding to resolve to Storybuilding with the remaining query, got ${JSON.stringify(invocation)}`)
  }
  if (parseChatSkillSlashInvocation('/unknown build source-backed demo')) {
    throw new Error('Expected unknown slash commands not to resolve a chat skill')
  }
  const prompt = storybuilding.systemPrompt
  for (const snippet of [
    'Variant: Storybuilding.',
    'Treat `/storybuilding` as a chatResponseBaseContract variant invocation',
    'source-backed storybuilding runbook',
    'story/card lineage',
    'validation checklist',
    'existing chat-log/KGC artifact flow', 'YAML block scalar (`output: |-`)', 'Never author or persist table HTML',
  ]) {
    if (!prompt.includes(snippet)) throw new Error(`Expected Storybuilding skill prompt to include: ${snippet}`)
  }
  const forbiddenDemoPath = [
    '',
    'Users',
    'huijoohwee',
    'Documents',
    'GitHub',
    'huijoohwee',
    'docs',
    ['agenticgraph', 'strybldr', 'demo.md'].join('-'),
  ].join('/')
  const forbiddenVideoId = ['77FAn', 'T935', '1E'].join('')
  const forbiddenCredentialKeys = [
    ['VIDEO', 'DB_API', 'KEY'].join('_'),
    ['SENSE', 'NOVA_API', 'KEY'].join('_'),
  ]
  for (const forbidden of [forbiddenDemoPath, forbiddenVideoId, ...forbiddenCredentialKeys]) {
    if (prompt.includes(forbidden)) throw new Error(`Storybuilding prompt must not hardcode demo fixture detail: ${forbidden}`)
  }

  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [
      { id: 'assistant-pending', role: 'assistant', content: '' },
      { id: 'user-1', role: 'user', content: '/storybuilding Generate a Strybldr storybuilding demo runbook from selected source evidence.' },
    ],
    assistantMessageId: 'assistant-pending',
  })
  if (!context.systemMessages.some(message => message.content.includes(prompt) && message.content.includes('chatAgenticGraph KGC contract'))) {
    throw new Error('Expected chatAgenticGraph request context to include the /storybuilding variant prompt')
  }
  const researchContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatHistory' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: '/investment-research-agent compile claims from these notes' }],
    assistantMessageId: 'assistant-pending',
  })
  if (!researchContext.systemMessages.some(message => message.content.includes('/investment-research-agent') && message.content.includes('plain Markdown chat contract'))) {
    throw new Error('Expected plain chat request context to include the /investment-research-agent variant prompt')
  }
  const inactiveSkillContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Plain KGC chat' }],
    assistantMessageId: 'assistant-pending',
  })
  if (inactiveSkillContext.systemMessages.some(message => message.content.includes(prompt) || message.content.includes('/storybuilding'))) {
    throw new Error('Expected Storybuilding variant prompt to require an explicit slash invocation')
  }

  const chatHistoryContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatHistory' }),
    nextMessages: [{ id: 'user-1', role: 'user', content: '/video-agent build a transcript timeline' }],
    assistantMessageId: 'assistant-pending',
  })
  if (!chatHistoryContext.systemMessages.some(message => message.content.includes('/video-agent') && message.content.includes('source metadata, transcript windows, frame evidence'))) {
    throw new Error('Expected /video-agent variant prompt to work with plain chat history')
  }
}

export function testResolveInitialChatSubmitModelFallsBackToProviderDefault() {
  const resolved = resolveInitialChatSubmitModel({
    chatProvider: 'openai',
    chatModel: 'nonexistent-model',
  })
  if (!resolved.providerModelOptions.includes(resolved.effectiveModel)) {
    throw new Error(`Expected initial submit model resolver to fall back to a provider-owned default, got: ${JSON.stringify(resolved)}`)
  }
}

export function testResolveChatSubmitTokenLimitKeyUsesOpenAiCompletionTokens() {
  const key = resolveChatSubmitTokenLimitKey('openai')
  if (key !== 'max_completion_tokens') {
    throw new Error(`Expected OpenAI submit token key to use max_completion_tokens, got: ${key}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorRejectsMissingModel() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: null,
    chatEndpointUrl: 'https://chat.example.test/v1/chat/completions',
    chatProvider: 'openai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected preflight request-url helper to reject missing model, got: ${requestUrl}`)
  }
  if (!errors[0] || connectivity[0] !== 'unknown' || connectivityDetail[0] !== null) {
    throw new Error(`Expected missing-model preflight to write unknown connectivity and error text, got: ${JSON.stringify({ errors, connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorRejectsMissingAgnesByokKey() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'byok',
    chatApiKey: '',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected Agnes BYOK preflight to reject missing API key, got: ${requestUrl}`)
  }
  if (errors[0] !== 'Agnes AI API BYOK requires an API key in Settings.') {
    throw new Error(`Expected Agnes BYOK preflight error text, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected Agnes BYOK preflight to set error connectivity, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorPrefersStorageRelayWhenConfigured() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'ready',
      providerId: 'agnes-ai',
    }),
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== 'https://storage.example.test/api/storage/chat/relay') {
    throw new Error(`Expected chat submit preflight to prefer configured storage relay URL, got ${String(requestUrl)}`)
  }
  if (errors.length > 0 || connectivity.length > 0 || connectivityDetail.length > 0) {
    throw new Error(`Expected relay preflight to succeed without mutating error/connectivity state, got ${JSON.stringify({ errors, connectivity, connectivityDetail })}`)
  }
}

export function testResolveChatSubmitRequestUrlOrSetErrorBlocksStorageRelayWhenWorkspacePolicyDisallowsMode() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const requestUrl = resolveChatSubmitRequestUrlOrSetError({
    chatModel: 'agnes-2.0-flash',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'blocked',
      providerId: 'agnes-ai',
      authMode: 'serverManaged',
      detail: 'Agnes AI server-managed relay is not enabled for this workspace.',
    }),
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
  })
  if (requestUrl !== null) {
    throw new Error(`Expected blocked storage relay preflight to stop submit, got ${String(requestUrl)}`)
  }
  if (errors[0] !== 'Agnes AI server-managed relay is not enabled for this workspace.') {
    throw new Error(`Expected blocked relay preflight to publish the policy error, got ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected blocked relay preflight to set error connectivity, got ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
}

export function testInitializeChatSubmitOptimisticStateInsertsPendingAssistantAndCachesHistory() {
  const errorWrites: Array<string | null> = []
  const connectivityDetailWrites: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  const messageWrites: ChatMessage[][] = []
  const inputWrites: string[] = []
  const loadingWrites: boolean[] = []
  const result = initializeChatSubmitOptimisticState({
    historyKey: 'history-key',
    trimmedInput: 'Generate KGC',
    messages: [{ id: 'm-0', role: 'assistant', content: 'Previous' }],
    setErrorText: value => { errorWrites.push(typeof value === 'function' ? null : value) },
    setConnectivityDetail: value => { connectivityDetailWrites.push(typeof value === 'function' ? null : value) },
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: value => { messageWrites.push(typeof value === 'function' ? [] : value) },
    setInput: value => { inputWrites.push(typeof value === 'function' ? '' : value) },
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
  })
  if (!result.assistantMessageId || !result.traceId.includes(result.assistantMessageId)) {
    throw new Error(`Expected optimistic submit setup to return assistant id and trace id, got: ${JSON.stringify(result)}`)
  }
  if (streamingAssistantWrites.length !== 1 || streamingAssistantWrites[0]?.id !== result.assistantMessageId) {
    throw new Error('Expected optimistic submit setup to create the streaming assistant placeholder')
  }
  if (messageWrites.length !== 1 || messageWrites[0]?.length !== 3) {
    throw new Error(`Expected optimistic submit setup to append user and assistant messages, got: ${JSON.stringify(messageWrites)}`)
  }
  if (errorWrites[0] !== null || connectivityDetailWrites[0] !== null) {
    throw new Error(`Expected optimistic submit setup to clear error text and connectivity detail, got: ${JSON.stringify({ errorWrites, connectivityDetailWrites })}`)
  }
  if (inputWrites[0] !== '' || loadingWrites[0] !== true) {
    throw new Error(`Expected optimistic submit setup to clear input and set loading true, got: ${JSON.stringify({ inputWrites, loadingWrites })}`)
  }
}

export async function testBuildChatSubmitRequestContextBuildsSelectionScopedSystemMessages() {
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatContextScope: 'selection',
    chatSystemPrompt: 'custom-system-prompt',
    markdownText: '---\ntitle: Example\n---\n# Title\nSelected body text',
    currentNode: {
      id: 'node-1',
      label: 'Node 1',
      type: 'text',
      x: 0,
      y: 0,
      properties: {},
      metadata: {},
    },
    graphData: {
      nodes: [],
      edges: [],
      metadata: {},
      type: 'graph',
    },
  })
  const context = await buildChatSubmitRequestContext({
    submitArgs,
    nextMessages: [
      { id: 'assistant-pending', role: 'assistant', content: '' },
      { id: 'user-1', role: 'user', content: 'Generate KGC' },
    ],
    assistantMessageId: 'assistant-pending',
  })
  if (!context.systemMessages.some(message => message.content === 'custom-system-prompt')) {
    throw new Error('Expected request context builder to include the custom system prompt')
  }
  if (!context.systemMessages.some(message => message.content.includes('selected_node'))) {
    throw new Error('Expected request context builder to include packed context system content')
  }
  if (context.conversationMessages.length !== 1 || context.conversationMessages[0]?.content !== 'Generate KGC') {
    throw new Error(`Expected request context builder to exclude the pending assistant placeholder, got: ${JSON.stringify(context.conversationMessages)}`)
  }
}

export async function testCreateChatSubmitRequestSenderBuildsAgenticGraphPayloadWithTokenFloor() {
  let captured: { url: string; body: Record<string, unknown>; headers: Record<string, string> } | null = null
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatMaxCompletionTokens: 32,
  })
  const sender = createChatSubmitRequestSender({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    controller: new AbortController(),
    fetchFn: async (input, init) => {
      captured = {
        url: String(input),
        body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
        headers: (init?.headers || {}) as Record<string, string>,
      }
      return new Response('{}', { status: 200 })
    },
  })
  await sender('model-x', [{ role: 'system', content: 'base-system' }], 'max_completion_tokens')
  if (!captured) {
    throw new Error('Expected request sender helper to invoke fetch')
  }
  if (captured.url !== 'https://chat.example.test/v1/chat/completions') {
    throw new Error(`Expected request sender helper to preserve request URL, got: ${captured.url}`)
  }
  if (captured.body.max_completion_tokens !== 4000) {
    throw new Error(`Expected chatAgenticGraph request sender to raise completion token floor to 4000, got: ${String(captured.body.max_completion_tokens)}`)
  }
  if (captured.body.stream !== true) {
    throw new Error(`Expected request sender helper to force streaming payloads, got: ${String(captured.body.stream)}`)
  }
}

export async function testCreateChatSubmitRequestSenderUsesStorageRelayWhenSessionEnvIsPresent() {
  let capturedRelayRequest: {
    url: string
    method: string
    authorization: string
    requestId: string
    body: Record<string, unknown>
  } | null = null
  const submitArgs = buildSubmitArgsFixture({
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    chatStorageTarget: 'chatAgenticGraph',
    chatEndpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatModel: 'agnes-2.0-flash',
    chatMaxCompletionTokens: 100,
    chatTopP: 0.5,
    storageChatRelayDecision: buildStorageChatRelayDecisionFixture({
      kind: 'ready',
      providerId: 'agnes-ai',
      authMode: 'serverManaged',
    })
  })
  const sender = createChatSubmitRequestSender({
    submitArgs,
    requestUrl: 'https://storage.example.test/api/storage/chat/relay',
    controller: new AbortController(),
    fetchFn: async (input, init) => {
      capturedRelayRequest = {
        url: String(input),
        method: String(init?.method || ''),
        authorization: String(new Headers(init?.headers).get('authorization') || ''),
        requestId: String(new Headers(init?.headers).get('x-client-request-id') || ''),
        body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
      }
      return new Response(JSON.stringify({
        ok: true,
        apiVersion: '2026-05-04',
        workspaceId: 'kgws:test-chat',
        providerId: 'agnes-ai',
        authMode: 'serverManaged',
        upstreamStatus: 200,
        relayStatus: 'allowed',
        body: {
          choices: [{ message: { role: 'assistant', content: 'relay-ok' } }],
        },
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    },
  })
  const response = await sender('agnes-2.0-flash', [{ role: 'user', content: 'ping' }], 'max_tokens')
  const responseJson = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  if (response.status !== 200 || responseJson.choices?.[0]?.message?.content !== 'relay-ok') {
    throw new Error(`Expected storage relay sender to unwrap upstream body into chat payload shape, got ${JSON.stringify({ status: response.status, responseJson })}`)
  }
  if (!capturedRelayRequest) {
    throw new Error('Expected storage relay sender to invoke storage relay URL')
  }
  if (capturedRelayRequest.url !== 'https://storage.example.test/api/storage/chat/relay') {
    throw new Error(`Expected storage relay sender to post to storage relay URL, got ${capturedRelayRequest.url}`)
  }
  if (capturedRelayRequest.method !== 'POST') {
    throw new Error(`Expected storage relay sender to use POST, got ${capturedRelayRequest.method}`)
  }
  if (capturedRelayRequest.authorization !== 'Bearer sess:test') {
    throw new Error(`Expected storage relay sender to forward bearer session token, got ${capturedRelayRequest.authorization}`)
  }
  if (!capturedRelayRequest.requestId.startsWith('kg-chat-')) {
    throw new Error(`Expected storage relay sender to emit a client request id, got ${capturedRelayRequest.requestId}`)
  }
  if (capturedRelayRequest.body.apiVersion !== '2026-05-04') {
    throw new Error(`Expected storage relay sender to use storage API version payload, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.workspaceId !== 'kgws:test-chat') {
    throw new Error(`Expected storage relay sender to pass workspace id from relay decision, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.providerId !== 'agnes-ai') {
    throw new Error(`Expected storage relay sender to pass provider id, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.authMode !== 'serverManaged') {
    throw new Error(`Expected storage relay sender to pass auth mode, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  if (capturedRelayRequest.body.stream !== false) {
    throw new Error(`Expected storage relay sender to force non-stream relay payload, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
  const providerOptions = capturedRelayRequest.body.providerOptions as Record<string, unknown> | null
  if (!providerOptions || providerOptions.max_tokens !== 4000) {
    throw new Error(`Expected storage relay sender to preserve chatAgenticGraph token floor inside provider options, got ${JSON.stringify(capturedRelayRequest.body)}`)
  }
}

export async function testBootstrapAgenticGraphSubmitDraftStreamsTraceWorkspaceAndKeepsCanonicalOutputPath() {
  const streamingWorkspaceWrites: Array<string | null> = []
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const followed: string[] = []
  const resolvedPaths: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T170000Z/kgc_20260522T170000Z.md',
    setChatAgenticGraphWorkspacePath: path => { resolvedPaths.push(path) },
    setStreamingWorkspacePath: value => { streamingWorkspaceWrites.push(typeof value === 'function' ? null : value) },
    setChatWorkspaceStreamingState: value => {
      streamingStates.push({
        path: String(value?.path || '').trim() || null,
        text: String(value?.text || ''),
      })
    },
    followWorkspaceMarkdownPath: path => { followed.push(path) },
  })
  const liveKgcPath = await bootstrapAgenticGraphSubmitDraft({
    submitArgs,
    requestTimestampMs: Date.UTC(2026, 4, 22, 17, 0, 0),
    trimmedInput: 'Generate KGC',
    traceId: 'trace-preflight',
    ensureWorkspacePath: async () => '/workspace/chat/20260522T170000Z/kgc_20260522T170000Z.md',
  })
  if (liveKgcPath !== '/workspace/chat/20260522T170000Z/kgc_20260522T170000Z.md') {
    throw new Error(`Expected preflight bootstrap to resolve the AgenticGraph workspace path, got: ${liveKgcPath}`)
  }
  if (
    streamingWorkspaceWrites.length !== 1 ||
    streamingWorkspaceWrites[0] !== '/workspace/chat/20260522T170000Z/kgc-trace_20260522T170000Z.md'
  ) {
    throw new Error(`Expected preflight bootstrap to point streaming workspace at the KGC trace path, got: ${JSON.stringify(streamingWorkspaceWrites)}`)
  }
  if (
    streamingStates.length !== 1 ||
    streamingStates[0]?.path !== '/workspace/chat/20260522T170000Z/kgc-trace_20260522T170000Z.md' ||
    streamingStates[0]?.text !== '_Streaming..._'
  ) {
    throw new Error(`Expected preflight bootstrap to expose the trace draft in live workspace state, got: ${JSON.stringify(streamingStates)}`)
  }
  if (followed.length !== 1 || followed[0] !== '/workspace/chat/20260522T170000Z/kgc-trace_20260522T170000Z.md') {
    throw new Error(`Expected preflight bootstrap to follow the live KGC trace workspace exactly once, got: ${JSON.stringify(followed)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorFinalizesSimpleChatHistorySuccess() {
  const finalized: Array<{ modelId: string; rawAssistantText: string }> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const terminalResets: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatHistory',
    finalizeAssistantSuccess: async payload => {
      finalized.push({ modelId: payload.modelId, rawAssistantText: payload.rawAssistantText })
    },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })
  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate KGC',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate KGC' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 0, 0),
    traceId: 'trace-coordinator',
    bootstrapDraft: async () => null,
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate KGC' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async args => ({
      response: await args.sendChat('model-a', 'max_completion_tokens'),
      effectiveModel: 'model-a',
      detail: null,
    }),
    createDraftWriter: () => async () => {},
    readAssistantResponse: async () => ({
      assistantText: 'assistant response',
      rawSseEvents: [],
      reasoningSteps: [],
      reasoningPreview: null,
      reasoningStepCount: 0,
      usageSummary: null,
      finishReason: null,
      modelId: 'model-a',
    }),
    finalizeTerminal: () => { terminalResets.push('done') },
  })
  if (finalized.length !== 1 || finalized[0]?.rawAssistantText !== 'assistant response') {
    throw new Error(`Expected coordinator helper to finalize one successful assistant response, got: ${JSON.stringify(finalized)}`)
  }
  if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null) {
    throw new Error(`Expected coordinator helper to mark connectivity ok on success, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
  if (terminalResets.length !== 1) {
    throw new Error(`Expected coordinator helper to perform one terminal reset on success, got: ${terminalResets.length}`)
  }

}

export async function testExecuteFloatingPanelChatSubmitCoordinatorPersistsLiveKgcTraceDrafts() {
  const createDraftWriterCalls: Array<{
    liveKgcPath: string | null
    persistWorkspaceDrafts?: boolean
    traceId: string
  }> = []
  const draftFlushes: Array<{ text: string; force: boolean }> = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatLocalStorageRootPath: '/workspace/chat',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T181000Z/kgc_20260522T181000Z.md',
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate durable KGC',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate durable KGC' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 10, 0),
    traceId: 'trace-durable-stream',
    bootstrapDraft: async () => '/workspace/chat/20260522T181000Z/kgc_20260522T181000Z.md',
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate durable KGC' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async args => ({
      response: await args.sendChat('model-a', 'max_completion_tokens'),
      effectiveModel: 'model-a',
      detail: null,
    }),
    createDraftWriter: draftArgs => {
      createDraftWriterCalls.push({
        liveKgcPath: draftArgs.liveKgcPath,
        persistWorkspaceDrafts: draftArgs.persistWorkspaceDrafts,
        traceId: draftArgs.traceId,
      })
      return async (text, force) => {
        draftFlushes.push({ text, force })
      }
    },
    readAssistantResponse: async streamArgs => {
      await streamArgs.flushDraft('partial durable stream', false)
      return {
        assistantText: 'partial durable stream',
        rawSseEvents: [],
        reasoningSteps: [],
        reasoningPreview: null,
        reasoningStepCount: 0,
        usageSummary: null,
        finishReason: null,
        modelId: 'model-a',
      }
    },
    resolveAgenticGraphAttempt: args => ({
      kind: 'final',
      finalAssistantText: args.assistantText,
      validatedKgc: null,
      status: 'ok',
      validation: {
        stage: 'validated',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: null,
        failedMessage: null,
        correctionPromptPreview: null,
        hasStructuredKgc: false,
        hasStructuredResponseSurface: true,
        hasYamlFrontmatter: false,
        validatedKgcLength: 0,
      },
    }),
  })

  if (createDraftWriterCalls.length !== 1) {
    throw new Error(`Expected coordinator to create one streaming draft writer, got: ${createDraftWriterCalls.length}`)
  }
  const call = createDraftWriterCalls[0]
  if (!call || call.liveKgcPath !== '/workspace/chat/20260522T181000Z/kgc_20260522T181000Z.md') {
    throw new Error(`Expected coordinator to bind stream drafts to the live KGC path, got: ${JSON.stringify(createDraftWriterCalls)}`)
  }
  if (call.persistWorkspaceDrafts !== true) {
    throw new Error(`Expected coordinator to persist live trace drafts for refresh recovery, got: ${JSON.stringify(call)}`)
  }
  if (draftFlushes.length !== 1 || draftFlushes[0]?.text !== 'partial durable stream') {
    throw new Error(`Expected streamed content to flow through the durable draft writer, got: ${JSON.stringify(draftFlushes)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorPublishesValidatedAndAppliedPipelineSnapshots() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const previousFetch = globalThis.fetch
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const resolvedAgenticGraphPaths: string[] = []
  const followedPaths: string[] = []
  const exchangeLog: Array<{ request: string; response: string; status: 'ok' | 'error' | 'aborted'; model: string | null }> = []
  const observedToasts: Array<{ id: string; kind?: string; message: string; actionLabels: string[] }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = (async () => ({ ok: true, status: 200, headers: new Headers() } as Response)) as typeof fetch

    publishLocalChatPipelineSurfaceSnapshot({
      messageCount: 1,
      isLoading: true,
      errorText: null,
      connectivity: 'unknown',
      connectivityDetail: null,
      chatProviderSummary: 'openai:gpt-4.1-mini',
      chatProviderHint: null,
      chatContextScope: 'workspace',
      chatStorageTarget: 'chatAgenticGraph',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      chatHistoryWorkspacePath: null,
      workspaceViewMode: 'workspace',
      editorWorkspacePane: 'markdown',
      markdownDocumentName: null,
      selectedNodeId: null,
      streamingAssistant: { id: 'assistant-pending', text: 'Streaming...' },
      streamingWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      streamFollowPath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      streamDraft: {
        path: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
        text: '_Streaming..._',
      },
    })

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [messages, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [streamingAssistant, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
        pushChatExchangeLog: payload => {
          exchangeLog.push({
            request: payload.request,
            response: payload.response,
            status: payload.status,
            model: payload.model,
          })
        },
        upsertUiToast: toast => {
          observedToasts.push({
            id: toast.id,
            kind: toast.kind,
            message: toast.message,
            actionLabels: Array.isArray(toast.actions) ? toast.actions.map(action => String(action.label || '').trim()) : [],
          })
          useGraphStore.getState().upsertUiToast(toast)
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: { path: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 0, 0) } },
        streamDraftTextRef: { current: { path: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md', text: '_Streaming..._' } },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      void messages
      void streamingAssistant
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) {
      throw new Error('Expected finalize hook harness to expose the submit finalize callback')
    }

    const requestText = 'Generate a canonical KGC document and apply it to Canvas.'
    const canonical = buildNeutralKgcFixtureDocument({
      timestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
      workspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      requestText,
      assistantText: 'Create a neutral KGC pipeline that validates, lands through Source Files, follows the Editor Workspace, and applies to Canvas.',
      expectationLabel: 'neutral coordinator KGC fixture',
    })
    const submitArgs = buildSubmitArgsFixture({
      chatStorageTarget: 'chatAgenticGraph',
      chatLocalStorageRootPath: '/workspace/chat',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
      setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
      followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
      finalizeAssistantSuccess,
      setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
      setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
      abortRef: { current: null },
      streamDraftTextRef: { current: { path: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md', text: '_Streaming..._' } },
      streamFollowRef: { current: { path: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 0, 0) } },
    })

    await act(async () => {
      await executeFloatingPanelChatSubmitCoordinator({
        submitArgs,
        requestUrl: 'https://chat.example.test/v1/chat/completions',
        trimmedInput: requestText,
        assistantMessageId: 'assistant-pending',
        nextMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        requestTimestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
        traceId: 'trace-webmcp-ready',
        bootstrapDraft: async () => '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
        buildRequestContext: async () => ({
          packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
          systemMessages: [{ role: 'system', content: 'base-system' }],
          conversationMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        }),
        createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
        executeTransportAttempt: async args => ({
          response: await args.sendChat('model-a', 'max_completion_tokens'),
          effectiveModel: 'model-a',
          detail: null,
        }),
        createDraftWriter: () => async () => {},
        readAssistantResponse: async () => ({
          assistantText: canonical,
          rawSseEvents: [],
          reasoningSteps: [],
          reasoningPreview: null,
          reasoningStepCount: 0,
          usageSummary: null,
          finishReason: 'stop',
          modelId: 'model-a',
        }),
      })
    })

    const chatPipelineSnapshot = readLocalChatPipelineSurfaceSnapshot()
    const inspectedPipeline = inspectLocalChatPipelineState(chatPipelineSnapshot)
    const graphState = useGraphStore.getState()

    if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null) {
      throw new Error(`Expected coordinator helper to mark connectivity ok during validated KGC finalize, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
    }
    if (inspectedPipeline.kgcValidation.stage !== 'validated' || inspectedPipeline.kgcValidation.hasYamlFrontmatter !== true) {
      throw new Error(`Expected chat pipeline inspection to expose validated YAML-frontmatter KGC state, got: ${JSON.stringify(inspectedPipeline.kgcValidation)}`)
    }
    if (inspectedPipeline.finalize.stage !== 'applied' || inspectedPipeline.finalize.persistedAgenticGraphPath !== '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md') {
      throw new Error(`Expected chat pipeline inspection to expose applied canonical KGC finalize state, got: ${JSON.stringify(inspectedPipeline.finalize)}`)
    }
    if (!followedPaths.includes('/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to follow the canonical AgenticGraph workspace path, got: ${JSON.stringify(followedPaths)}`)
    }
    if (!resolvedAgenticGraphPaths.includes('/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to resolve the canonical AgenticGraph workspace path, got: ${JSON.stringify(resolvedAgenticGraphPaths)}`)
    }
    if (!exchangeLog[0]?.response.includes('/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to log the canonical workspace link in the assistant response, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!exchangeLog[0]?.response.includes('APPLIED · MIRRORED_STORAGE · [Open KGC in Source Files: kgc_20260522T190000Z.md]')) {
      throw new Error(`Expected the successful storage fixture to expose an applied storage-mirrored typed Source Files link in the assistant response, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (observedToasts.some(toast => String(toast.id || '').startsWith('chat-promotion-retry:'))) {
      throw new Error(`Expected successful finalize flow not to emit a promotion retry toast, got: ${JSON.stringify(observedToasts)}`)
    }
    if (
      !String(graphState.markdownDocumentName || '').endsWith('kgc_20260522T190000Z.md') ||
      !String(graphState.markdownDocumentText || '').startsWith('---\n')
    ) {
      throw new Error(`Expected finalize flow to apply the canonical KGC workspace document to the active canvas state, got: ${JSON.stringify({ markdownDocumentName: graphState.markdownDocumentName, markdownDocumentText: graphState.markdownDocumentText?.slice(0, 40) || '' })}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessAppendsWorkspaceDocumentPathSourceLink() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T191500Z/kgc_20260522T191500Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522191500.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        upsertUiToast: useGraphStore.getState().upsertUiToast,
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-memory-user-model',
        requestText: 'Materialize a scoped USER_MODEL document.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            tool: 'agenticgraph.memory.materialize_user_model',
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            document_path: 'data/memory-layer/user-models/user-model-founder.md',
          }, null, 2),
          '```',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 15, 0),
      })
    })

    if (!exchangeLog[0]?.response.includes('/workspace/chat/user-models/user-model-founder.md')) {
      throw new Error(`expected finalize response to include the materialized workspace document path, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!exchangeLog[0]?.response.includes('GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md]')) {
      throw new Error(`expected finalize response to append a generated typed Source Files link for workspace_document_path, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessOrdersWorkspaceArtifactLinksByPriority() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T192000Z/kgc_20260522T192000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522192000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifact-ledger-order',
        requestText: 'Summarize generated artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_path: '/workspace/chat/20260522T192000Z/kgc-trace_20260522T192000Z.md',
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspacePath: '/workspace/chat/20260522T192000Z/kgc-output_20260522T192000Z-report.md',
          }, null, 2),
          '```',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 20, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const userModelIndex = response.indexOf('Open USER_MODEL in Source Files: user-model-founder.md')
    const outputIndex = response.indexOf('Open OUTPUT in Source Files: kgc-output_20260522T192000Z-report.md')
    const traceIndex = response.indexOf('Open TRACE in Source Files: kgc-trace_20260522T192000Z.md')
    if (userModelIndex < 0 || outputIndex < 0 || traceIndex < 0) {
      throw new Error(`expected finalize response to append all typed artifact links, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!(userModelIndex < outputIndex && outputIndex < traceIndex)) {
      throw new Error(`expected typed artifact links to be ordered by priority, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessDedupesWorkspaceArtifactLinksAcrossOverrideAndToolPayload() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522193000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifact-ledger-dedupe',
        requestText: 'Summarize generated user model artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspacePath: 'workspace:/workspace/chat/user-models/user-model-founder.md',
          }, null, 2),
          '```',
        ].join('\n'),
        finalAssistantOverride: [
          '- Materialized profile summary.',
          '- [Open in Source Files: user-model-founder.md](workspace:/workspace/chat/user-models/user-model-founder.md)',
          '- [Open USER_MODEL in Source Files: user-model-founder.md](/workspace/chat/user-models/user-model-founder.md)',
        ].join('\n'),
        timestampMs: Date.UTC(2026, 4, 22, 19, 30, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const matches = response.match(/\[Open [^\]]+ in Source Files: user-model-founder\.md\]\((?:workspace:)?\/workspace\/chat\/user-models\/user-model-founder\.md\)/g) || []
    if (matches.length !== 1) {
      throw new Error(`expected finalize response to dedupe repeated workspace artifact links, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md]')) {
      throw new Error(`expected deduped workspace artifact link to preserve the typed generated ledger label, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessGroupsWorkspaceArtifactLinksIntoArtifactsBlock() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatHistory',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T194000Z/kgc_20260522T194000Z.md',
        chatHistoryWorkspacePath: '/workspace/chat/chh_20260522194000.md',
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-artifacts-block',
        requestText: 'Summarize generated artifacts.',
        modelId: 'model-a',
        rawAssistantText: [
          'Tool result:',
          '```json',
          JSON.stringify({
            workspace_document_path: '/workspace/chat/user-models/user-model-founder.md',
            workspace_path: '/workspace/chat/20260522T194000Z/kgc-trace_20260522T194000Z.md',
          }, null, 2),
          '```',
        ].join('\n'),
        finalAssistantOverride: '- Materialized artifacts successfully.',
        timestampMs: Date.UTC(2026, 4, 22, 19, 40, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    if (!response.includes('Artifacts:\n- GENERATED · [Open USER_MODEL in Source Files: user-model-founder.md](/workspace/chat/user-models/user-model-founder.md)\n- GENERATED · [Open TRACE in Source Files: kgc-trace_20260522T194000Z.md](/workspace/chat/20260522T194000Z/kgc-trace_20260522T194000Z.md)')) {
      throw new Error(`expected finalize response to collect generated workspace links into an Artifacts block, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.startsWith('- Materialized artifacts successfully.\n\nArtifacts:\n')) {
      throw new Error(`expected finalize response to keep narrative content above the Artifacts block, got: ${JSON.stringify(exchangeLog)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testFinalizeAssistantSuccessReportsPromotionFailureDetails() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  const previousFetch = globalThis.fetch
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const exchangeLog: Array<{ response: string }> = []
  const observedToasts: Array<{ id: string; kind?: string; message: string; actionLabels: string[] }> = []

  try {
    process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
    globalThis.fetch = (async () => new Response(JSON.stringify({
      ok: false,
      status: 'failed',
      error: 'github_write_failed',
    }), {
      status: 424,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: () => {},
        pushChatExchangeLog: payload => {
          exchangeLog.push({ response: payload.response })
        },
        upsertUiToast: toast => {
          observedToasts.push({
            id: toast.id,
            kind: toast.kind,
            message: toast.message,
            actionLabels: Array.isArray(toast.actions) ? toast.actions.map(action => String(action.label || '').trim()) : [],
          })
          useGraphStore.getState().upsertUiToast(toast)
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: null },
        streamDraftTextRef: { current: null },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) throw new Error('expected finalize hook harness to expose the callback')

    const requestText = 'Generate a canonical KGC document and report promotion failures.'
    publishLocalChatPipelineSurfaceSnapshot({
      messageCount: 1,
      isLoading: false,
      errorText: null,
      connectivity: 'ok',
      connectivityDetail: null,
      chatProviderSummary: 'openai:gpt-4.1-mini',
      chatProviderHint: null,
      chatContextScope: 'workspace',
      chatStorageTarget: 'chatAgenticGraph',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md',
      chatHistoryWorkspacePath: null,
      workspaceViewMode: 'canvas',
      editorWorkspacePane: 'markdown',
      markdownDocumentName: 'workspace:/docs/promotion-failure.md',
      selectedNodeId: null,
      streamingAssistant: null,
      streamingWorkspacePath: null,
      streamFollowPath: '/workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md',
      streamDraft: null,
    })
    const canonical = buildNeutralKgcFixtureDocument({
      timestampMs: Date.UTC(2026, 4, 22, 19, 50, 0),
      workspacePath: '/workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md',
      requestText,
      assistantText: 'Create a neutral KGC pipeline that persists locally and reports mirror failures in the ledger.',
      expectationLabel: 'promotion failure ledger fixture',
    })

    await act(async () => {
      await finalizeAssistantSuccess({
        assistantMessageId: 'assistant-promotion-failure',
        requestText,
        modelId: 'model-a',
        rawAssistantText: canonical,
        validatedKgc: canonical,
        timestampMs: Date.UTC(2026, 4, 22, 19, 50, 0),
      })
    })

    const response = exchangeLog[0]?.response || ''
    const inspectedPipeline = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    if (!response.includes('PROMOTION_FAILED · [Open KGC in Source Files: kgc_20260522T195000Z.md]')) {
      throw new Error(`expected finalize response to mark the canonical KGC artifact as promotion failed, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Promotion note: mirroring failed (github: github_write_failed; storage: skipped).')) {
      throw new Error(`expected finalize response to include the promotion failure detail note, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.')) {
      throw new Error(`expected finalize response to include a recovery hint for GitHub mirroring failures, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!response.includes('Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md /workspace/chat/20260522T195000Z/kgc-trace_20260522T195000Z.md`')) {
      throw new Error(`expected finalize response to include an exact retry command for the saved local artifacts, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (
      inspectedPipeline.finalize.failureNote !== '- Promotion note: mirroring failed (github: github_write_failed; storage: skipped).'
      || inspectedPipeline.finalize.retryHint !== '- Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.'
      || inspectedPipeline.finalize.retryCommand !== '- Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md /workspace/chat/20260522T195000Z/kgc-trace_20260522T195000Z.md`'
    ) {
      throw new Error(`expected local chat pipeline inspection to expose promotion recovery diagnostics, got: ${JSON.stringify(inspectedPipeline.finalize)}`)
    }
    if (
      inspectedPipeline.promotionRecovery?.available !== true
      || inspectedPipeline.promotionRecovery?.scope !== 'mirror-saved-local-artifacts-only'
      || inspectedPipeline.promotionRecovery?.retryCommand !== '#promotion.retry /workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md /workspace/chat/20260522T195000Z/kgc-trace_20260522T195000Z.md'
      || inspectedPipeline.promotionRecovery?.retryCommandLine !== '- Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md /workspace/chat/20260522T195000Z/kgc-trace_20260522T195000Z.md`'
      || inspectedPipeline.promotionRecovery?.insertionMode !== 'append'
      || inspectedPipeline.promotionRecovery?.reusesSavedLocalArtifacts !== true
      || inspectedPipeline.promotionRecovery?.rerunsValidation !== false
      || inspectedPipeline.promotionRecovery?.reappliesCanvas !== false
      || inspectedPipeline.promotionRecovery?.githubBeforeStorage !== true
      || !Array.isArray(inspectedPipeline.promotionRecovery?.surfaces)
      || !inspectedPipeline.promotionRecovery.surfaces.includes('warning-toast')
    ) {
      throw new Error(`expected local chat pipeline inspection to expose the promotion retry operator contract, got: ${JSON.stringify(inspectedPipeline.promotionRecovery)}`)
    }
    const retryToast = observedToasts.find(toast => toast.id === 'chat-promotion-retry:/workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md') || null
    if (
      !retryToast
      || retryToast.kind !== 'warning'
      || !String(retryToast.message || '').includes('Artifact mirroring failed for the saved local artifacts.')
      || !String(retryToast.message || '').includes('Retry command: `#promotion.retry /workspace/chat/20260522T195000Z/kgc_20260522T195000Z.md /workspace/chat/20260522T195000Z/kgc-trace_20260522T195000Z.md`')
      || !retryToast.actionLabels.includes('Insert Retry Command')
    ) {
      throw new Error(`expected finalize promotion failure to upsert a warning toast with the exact retry command, got: ${JSON.stringify(observedToasts)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testUseFloatingPanelChatSubmitDelegatesToCoordinatorOnce() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const coordinatorCalls: Array<{
    requestUrl: string
    trimmedInput: string
    assistantMessageId: string
    hasStreamingWorkspaceSetter: boolean
    hasStreamingRefs: boolean
    hasFinalizeHandler: boolean
  }> = []
  let submitHandler: React.FormEventHandler<HTMLFormElement> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    const setChatWorkspaceStreamingState = () => {}
    const streamDraftTextRef = { current: null as { path: string; text: string } | null }
    const streamFollowRef = { current: null as { path: string; atMs: number } | null }
    const finalizeAssistantSuccess = async () => {}
    const args = buildSubmitArgsFixture({
      input: '  I can ...#storyboard ../soul.load#media@operator, better in#storyboard  ',
      isLoading: false,
      setChatWorkspaceStreamingState,
      streamDraftTextRef,
      streamFollowRef,
      finalizeAssistantSuccess,
    })

    const HookHarness = () => {
      const handler = useFloatingPanelChatSubmit(args, {
        resolveRequestUrlOrSetError: () => 'https://chat.example.test/v1/chat/completions',
        initializeOptimisticState: () => ({
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          requestTimestampMs: 123,
          traceId: 'trace-1',
          nextMessages: [{ id: 'user-1', role: 'user', content: 'I can ... #storyboard .. /soul.load #media @operator, better in #storyboard' }],
        }),
        executeCoordinator: async payload => {
          coordinatorCalls.push({
            requestUrl: payload.requestUrl,
            trimmedInput: payload.trimmedInput,
            assistantMessageId: payload.assistantMessageId,
            hasStreamingWorkspaceSetter: payload.submitArgs.setChatWorkspaceStreamingState === setChatWorkspaceStreamingState,
            hasStreamingRefs:
              payload.submitArgs.streamDraftTextRef === streamDraftTextRef &&
              payload.submitArgs.streamFollowRef === streamFollowRef,
            hasFinalizeHandler: payload.submitArgs.finalizeAssistantSuccess === finalizeAssistantSuccess,
          })
        },
      })
      React.useEffect(() => {
        submitHandler = handler
      }, [handler])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!submitHandler) {
      throw new Error('Expected hook harness to capture the submit handler')
    }

    await act(async () => {
      await submitHandler!({
        preventDefault: () => void 0,
      } as React.FormEvent<HTMLFormElement>)
    })

    if (coordinatorCalls.length !== 1) {
      throw new Error(`Expected submit hook shell to delegate to coordinator exactly once, got: ${coordinatorCalls.length}`)
    }
    if (
      coordinatorCalls[0]?.requestUrl !== 'https://chat.example.test/v1/chat/completions' ||
      coordinatorCalls[0]?.trimmedInput !== 'I can ... #storyboard .. /soul.load #media @operator, better in #storyboard' ||
      coordinatorCalls[0]?.assistantMessageId !== 'assistant-1' ||
      !coordinatorCalls[0]?.hasStreamingWorkspaceSetter ||
      !coordinatorCalls[0]?.hasStreamingRefs ||
      !coordinatorCalls[0]?.hasFinalizeHandler
    ) {
      throw new Error(`Expected submit hook shell to forward canonical coordinator payload, got: ${JSON.stringify(coordinatorCalls[0])}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restoreDom()
    restoreWindow()
  }
}

export function testChatResponseContractPromptStaysCompatibleWithComputingFlowSample() {
  const sample = readComputingFlowSample()
  const prompt = CHAT_BASE_RESPONSE_CONTRACT_PROMPT

  const sampleSnippets = ['flow:', '@node:', '@edge:', '{{subject}}', 'TBD']
  sampleSnippets.forEach(snippet => {
    if (!sample.includes(snippet)) {
      throw new Error(`Expected computing-flow sample fixture to include snippet: ${snippet}`)
    }
  })

  const promptSnippets = ['flow blocks', '@node:id', '@edge:src:handle→tgt:handle', 'Tier B sentinel keys', 'TBD (unknown)', 'not applicable']
  promptSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected chat response contract prompt to cover sample-compatible token: ${snippet}`)
    }
  })
}

export function testChatKgcResponseContractPromptEnforcesComputingFlowShape() {
  const prompt = CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT
  const template = buildBaseTemplateSample()

  const requiredPromptSnippets = [
    'use canonical structure, not canonical wording',
    'schema guidance only',
    'Stream the final document progressively',
    'Every streamed chunk must stay relevant to the active query',
    'Do not widen a narrow request into a stock "PRD + TAD", "monetization pipeline", or similarly prepackaged deliverable',
    'never emit example, placeholder, or fixture URLs',
    'the answer itself must be the KGC document',
    'exactly one standalone KGC document',
    'Do not return prose plus a partial KGC fragment',
    'do not downgrade to a minimal canvas-preset-only document', 'materialize a neutral dataflow',
    'Do not emit stock labels such as "Request Intent"',
    'graphId, doc_type, date, ai_model, and lang MUST be concrete resolved strings.',
    'title SHOULD resolve when product context is known',
    'Mention stack, payments, geospatial, workflow, or distribution details only when present',
    'pipeline[*].node / flow.nodes[*].id / mermaid: node IDs not in exact sync',
    'flow.subgraphs[*]',
    'flow.subgraphs is the only grouping authoring surface',
    'parser projects flow.subgraphs into kg:subgraphs metadata',
    'Do not add a second grouping registry such as group:, layer:, or clusters: beside flow.subgraphs.',
    'Do not instruct any downstream local graph patch layer to reinterpret the document',
    'Never duplicate headings or restate the same requested subsection twice under different labels',
    'Canvas-preset-only fallback output that omits canonical KGC structural blocks',
    'Parallel grouping channels such as retired `clusters:` or duplicate group registries beside flow.subgraphs',
    'n-trigger, n-pack, n-process, n-validate, n-deliver',
    'V-07', 'V-10', 'Generated tables persist as YAML block-scalar GitHub-flavored Markdown pipe tables.',
    '## Customization Guide',
  ]
  requiredPromptSnippets.forEach(snippet => {
    if (!prompt.includes(snippet)) {
      throw new Error(`Expected KGC response contract prompt to include: ${snippet}`)
    }
  })

  const requiredTemplateSnippets = [
    '$schema: "kgc-pipeline/v1"',
    'runtime:',
    'pipeline:',
    'mermaid: |',
    'flow:',
    '## Customization Guide',
    '@edge:n-validate:correction→n-process:correction',
    '{{runtime.maxRetry}}',
  ]
  requiredTemplateSnippets.forEach(snippet => {
    if (!template.includes(snippet)) {
      throw new Error(`Expected base template fixture to include snippet: ${snippet}`)
    }
  })
}

export function testBaseTemplateFixturePassesKgcStructuredAndValidation() {
  const md = buildBaseTemplateSample()
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error('Expected base template fixture to satisfy KGC structured markdown detection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected base template fixture to validate, got ${first?.ruleId}: ${first?.message}`)
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('kgc-canonical-template-fixture.md', md)
  if (!parsed) throw new Error('Expected base template fixture to parse as a frontmatter flow graph')
}

export function testKgcDeterministicFallbackIsStructuredAndValid() {
  const requestIntent = 'Solo founder bootstrap GTM with Stripe payment checkout integration'
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 12, 34, 56),
    requestText: requestIntent,
    assistantText: 'Focus on external adoption, conversion path, and a reusable planning package.',
  })
  if (!md.includes('subject: "solo founder"')) {
    throw new Error('Expected deterministic fallback to infer a neutral subject when it is explicit in the request')
  }
  if (!md.includes('owner: "solo founder"')) {
    throw new Error('Expected deterministic fallback to project explicit owner from the named actor')
  }
  if (!md.includes('bootstrap execution') || !md.includes('Stripe payment') || !md.includes('checkout')) {
    throw new Error('Expected deterministic fallback to derive a normalized query-shaped objective')
  }
  if (!md.includes('Stripe') || !md.includes('solo founder')) {
    throw new Error('Expected deterministic fallback body to stay request-shaped for actor and payment context')
  }
  if (!md.includes('This document packages `{{artifact}}` for `{{subject}}` around the active request.')) {
    throw new Error('Expected deterministic fallback lead to stay artifact-first instead of pipeline-first')
  }
  if (md.includes('This document turns one request into one reusable pipeline artifact.') || md.includes('The canonical five-node pipeline is applied to the current request:')) {
    throw new Error('Expected deterministic fallback to remove pipeline-self-explanatory lead prose')
  }
  const requiredSections = [
    '## Computing Flow Definition',
    '## Flow Graph',
    '## Pipeline',
    '## PRD — Product Requirements',
    '## TAD — Technical Architecture',
    '## Open Questions',
    '## Customization Guide',
    '### Variable Link Map',
    '### Request Snapshot',
  ]
  requiredSections.forEach(section => {
    if (!md.includes(section)) {
      throw new Error(`Expected deterministic fallback to include required section: ${section}`)
    }
  })
  if (md.includes('This section summarizes product requirements implied by the user request.')) {
    throw new Error('Expected deterministic fallback to remove generic PRD summary boilerplate')
  }
  if (md.includes('This section summarizes architecture boundaries and integration points implied by the user request.')) {
    throw new Error('Expected deterministic fallback to remove generic TAD summary boilerplate')
  }
  if (md.includes('Monetization Focus:') || md.includes('Stack: ')) {
    throw new Error('Expected deterministic fallback to avoid stale canned request-specific labels')
  }
  if (!md.includes('`bg#FAEEDA:status {{status}}` · owner `solo founder`')) {
    throw new Error('Expected deterministic fallback body meta to reflect resolved owner while preserving unresolved status')
  }
  const requiredFrontmatterSnippets = [
    'feedback_arcs:',
    'forward_edges:',
    'subgraphs:',
    'sg-p1',
    'direction:  {key: direction,  type: string,  value: LR}',
    'compute:\n        key: compute\n        type: function\n        value: |',
    'click n-trigger  "#pipeline" "S01 · trigger / input"',
    'sandbox:  {key: sandbox,  type: string,  value: "quickjs-emscripten"}',
  ]
  requiredFrontmatterSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected deterministic fallback frontmatter to include: ${snippet}`)
    }
  })
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error('Expected deterministic fallback to satisfy KGC structured markdown detection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    const first = validation.errors[0]
    throw new Error(`Expected deterministic fallback to validate, got ${first?.ruleId}: ${first?.message}`)
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('kgc-fallback.md', md)
  if (!parsed) throw new Error('Expected deterministic fallback to parse as a frontmatter flow graph')
}

export function testKgcDeterministicFallbackProjectsHeadlessStrybldrResponseFirst() {
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 5, 5, 23, 46, 28),
    workspacePath: '/chat-log/20260605T234628Z/kgc_20260605T234628Z.md',
    requestText: 'Create a headless structured MCP response for 2D Renderer: Storyboard with gitGraph, Gantt frontmatter, inline compute runner, dataflow, and Rich Media Panels.',
    assistantText: [
      '## Provider Stream Trace',
      '',
      'The provider returned reasoning or tool-call trace events but did not return final assistant text.',
      '',
      '- Model: model-a',
      '- SSE events: 12',
      '',
      '### Reasoning and Tool Signals',
      '',
      '- Evaluate Strybldr workflow dataflow and Rich Media Panel outputSrcDoc handoff.',
    ].join('\n'),
  })
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error('Expected headless Strybldr fallback to remain a structured KGC document')
  }
  const responseIndex = md.indexOf('## Response')
  const workflowIndex = md.indexOf('## Computing Flow Definition')
  if (responseIndex < 0 || workflowIndex < 0 || responseIndex > workflowIndex) {
    throw new Error('Expected fallback body to lead with query response projection before workflow metadata')
  }
  const requiredSnippets = [
    'kgCanvas2dRenderer: "storyboard"',
    'kgStrybldrStoryboard: true',
    'response:',
    'status: "trace_only"',
    'markdown_body:',
    'renderer: "storyboard"',
    'This document does not invent the missing answer',
    'mcp-response-headless-compute',
    'mcp-response-rich-media-panel',
    'outputSrcDoc->outputSrcDoc',
    'type: mermaid_gitgraph',
    'type: mermaid_gantt',
    'render_on: [flow_editor, storyboard, strybldr',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected headless Strybldr fallback to include: ${snippet}`)
    }
  })
  const forbiddenDemoBasename = ['agenticgraph', 'strytree', 'demo'].join('-') + '.md'
  const absoluteDemoPathPattern = new RegExp(`/Users/[^\\s\`]+/.*/${forbiddenDemoBasename.replace('.', '\\.')}`)
  if (absoluteDemoPathPattern.test(md)) {
    throw new Error('Expected fallback to avoid hardcoded sample artifact paths')
  }
  const parsed = tryParseMarkdownFrontmatterFlowGraph('kgc-headless-strybldr.md', md)
  if (!parsed) throw new Error('Expected headless Strybldr fallback to parse as a frontmatter flow graph')
  const nodeIds = new Set(parsed.graphData.nodes.map(node => String(node.id || '')))
  if (!nodeIds.has('mcp-response-headless-compute') || !nodeIds.has('mcp-response-rich-media-panel')) {
    throw new Error(`Expected parsed graph to include headless compute and Rich Media Panel nodes, got: ${Array.from(nodeIds).join(', ')}`)
  }
}

export function testChatKgcFinalizeAppliesSavedWorkspaceDocumentToCanvas() {
  const finalizeText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'floatingPanelChat', 'useFinalizeAssistantSuccess.ts'), 'utf8')
  const applyText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'chatKgcCanvasApply.ts'), 'utf8')
  const requiredFinalizeSnippets = [
    'applyChatKgcWorkspaceDocumentToCanvas',
    'await applyChatKgcWorkspaceDocumentToCanvas(agenticgraphPath)',
  ]
  requiredFinalizeSnippets.forEach(snippet => {
    if (!finalizeText.includes(snippet)) throw new Error(`Expected KGC finalize path to include: ${snippet}`)
  })
  const requiredApplySnippets = [
    'applyWorkspaceImportToCanvas', 'shouldApplyImportedCanvasDocumentToGraph',
    'skipComposedGraphApply: true', 'setActiveMarkdownDocument({',
    'applyViewPreset: true',
    'applyToGraph: true',
    'forceApplyToGraph: true',
  ]
  requiredApplySnippets.forEach(snippet => {
    if (!applyText.includes(snippet)) throw new Error(`Expected KGC canvas apply bridge to include: ${snippet}`)
  })
}

export function testKgcIdentityNormalizationEnforcesBaseTemplateScalars() {
  const template = buildBaseTemplateSample().replace(/\r\n/g, '\n')
  const mutated = template
    .replace(/^product:\s+".*"$/m, 'product: "Knowledge Graph Canvas"')
    .replace(/^title:\s+".*"$/m, 'title: "Stale authored title"')
    .replace(/^graphId:\s+".*"$/m, 'graphId: "md:kgc-20260419180222-pipeline"')
    .replace(/^ai_model:\s+".*"$/m, 'ai_model: "model-test-authored"')
    .replace(/date:\s+"{{date}}"/, 'date: "2026-04-19"')
    .replace('# {{product}} · AI Pipeline', '# Knowledge Graph Canvas · AI Pipeline')
    .replace('owner `{{owner}}` · {{date}}', 'owner `{{owner}}` · 2026-04-19')

  const normalized = normalizeKgcFrontmatterIdentityToFileName({
    markdown: mutated,
    workspacePath: '/chat-log/20260419T180222Z/kgc_20260419T180222Z.md',
    timestampMs: Date.UTC(2026, 3, 19, 18, 2, 22),
  })

  if (!normalized.includes('product: "Knowledge Graph Canvas"')) {
    throw new Error('Expected normalized KGC product to preserve authored content')
  }
  if (!normalized.includes('title: "Knowledge Graph Canvas · AI Pipeline — response"')) {
    throw new Error('Expected normalized KGC title to derive from canonical product and doc type')
  }
  if (!normalized.includes('md:kgc-20260419t180222z-pipeline')) {
    throw new Error('Expected normalized KGC graphId to derive from the storage filename')
  }
  if (!normalized.includes('2026-04-19')) {
    throw new Error('Expected normalized KGC date to derive from the storage timestamp')
  }
  if (!normalized.includes('model-test-authored')) {
    throw new Error('Expected normalized KGC ai_model to preserve the authored model identifier')
  }
  if (!normalized.includes('en-US')) {
    throw new Error('Expected normalized KGC lang to preserve the authored language')
  }
  if (!normalized.includes('kgc_20260419T180222Z.md')) {
    throw new Error('Expected normalized KGC self_ref to match workspace filename')
  }
  if (!normalized.includes('# Knowledge Graph Canvas · AI Pipeline')) {
    throw new Error('Expected normalized body H1 to preserve authored body content')
  }
  if (!normalized.includes('owner `{{owner}}` · 2026-04-19')) {
    throw new Error('Expected normalized body meta line to preserve authored body content')
  }
}

export function testKgcWorkspacePathCanonicalizationMapsTraceAndOutputToCanonical() {
  const tracePath = '/chat-log/20260419T180222Z/kgc-trace_20260419T180222Z.md'
  const outputPath = '/chat-log/20260419T180222Z/kgc-output_20260419T180222Z.svg'

  if (toCanonicalKgcWorkspacePath(tracePath) !== '/chat-log/20260419T180222Z/kgc_20260419T180222Z.md') {
    throw new Error('Expected trace path to canonicalize to the runnable KGC markdown path')
  }
  if (toCanonicalKgcWorkspacePath(outputPath) !== '/chat-log/20260419T180222Z/kgc_20260419T180222Z.md') {
    throw new Error('Expected output companion path to canonicalize back to the runnable KGC markdown path')
  }
  if (toKgcTraceWorkspacePath('/chat-log/20260419T180222Z/kgc_20260419T180222Z.md') !== tracePath) {
    throw new Error('Expected canonical KGC path to derive a matching trace companion path')
  }
  if (toKgcOutputWorkspacePath(tracePath, 'png') !== '/chat-log/20260419T180222Z/kgc-output_20260419T180222Z.png') {
    throw new Error('Expected trace path to derive a matching output companion path')
  }
  if (toKgcOutputWorkspacePath(tracePath, 'html', { variant: 'viewer' }) !== '/chat-log/20260419T180222Z/kgc-output_20260419T180222Z-viewer.html') {
    throw new Error('Expected trace path to derive a stable variant output companion path')
  }

  const normalized = normalizeKgcFrontmatterIdentityToFileName({
    markdown: buildBaseTemplateSample(),
    workspacePath: tracePath,
    timestampMs: Date.UTC(2026, 3, 19, 18, 2, 22),
  })
  if (!normalized.includes('kgc_20260419T180222Z.md')) {
    throw new Error('Expected identity normalization to use the canonical KGC filename even when the workspace path points at a trace file')
  }
}

export async function testChatAgenticGraphRejectsLegacyDocsWorkspacePath() {
  resetWorkspaceFsForTests()
  const resolved = await ensureChatHistoryWorkspaceFilePath({
    requestedPath: '/docs/20260527T131514Z/kgc_20260527T131514Z.md',
    timestampMs: Date.UTC(2026, 4, 27, 13, 15, 14),
    storageType: 'chatAgenticGraph',
    defaultLocalRootPath: '/chat-log',
  })
  if (resolved !== '/chat-log/20260527T131514Z/kgc_20260527T131514Z.md') {
    throw new Error(`expected stale docs KGC path to be ignored in favor of chat-log session path, got ${resolved}`)
  }
}

export function testKgcFallbackWithNonEmptyQueryIsNotByteEqualToCanonicalTemplate() {
  const canonicalTemplate = buildBaseTemplateSample().replace(/\r\n/g, '\n').trimEnd()
  const generated = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 20, 14, 10),
    workspacePath: '/chat-log/20260419T201410Z/kgc_20260419T201410Z.md',
    requestText: 'Solo founder bootstrap growth with Stripe checkout and RxDB MapLibre stack',
    assistantText: 'invalid fallback trigger',
  }).replace(/\r\n/g, '\n').trimEnd()

  if (generated === canonicalTemplate) {
    throw new Error('Expected fallback output with non-empty query to differ from canonical template bytes')
  }
}

export function testStructuredKgcIsEnforcedQueryResponsiveBeforePersistence() {
  const canonicalTemplate = buildBaseTemplateSample().replace(/\r\n/g, '\n')
  const requestText = 'Solo founder bootstrap growth with Stripe checkout, RxDB, MapLibre, MCP marketplace'
  const generated = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 19, 21, 1, 10),
    workspacePath: '/chat-log/20260419T210110Z/kgc_20260419T210110Z.md',
    requestText,
    assistantText: canonicalTemplate,
  })
  if (!generated.includes('subject: "solo founder"')) {
    throw new Error('Expected structured KGC to resolve an explicit subject from the request')
  }
  if (!generated.includes('domain: "MCP distribution') || !generated.includes('user-action monetization')) {
    throw new Error('Expected structured KGC to resolve a concise domain from the request')
  }
  if (generated.includes('Request Intent:') || generated.includes('Monetization Focus:') || generated.includes('Stack: ')) {
    throw new Error('Expected structured KGC persistence normalization to avoid stale canned body injections')
  }
  if (generated === canonicalTemplate) {
    throw new Error('Expected structured KGC to differ from the untouched template when request context can resolve Tier B fields')
  }
}

export function testKgcDeterministicFallbackShapesLatestRecommendationQuery() {
  const requestText = 'RECOMMEND: Solo founder; zero budget, bootstrap, organic growth; **Knowledge Graph Canvas** product as MCP for external users, OpenClaw, skills marketplace; Pitch Deck+PRD+TAD, TCO; Use Case -> Problem -> Solution; User Flow+Work Flow+Data Flow; B2C monetization ideas; monetize user actions (subscriptions, pay-per-use, and commerce-like conversion); FOSS RxDB, MapLibre; expose integration with **Stripe payment** flow (payments/checkout)'
  const assistantText = [
    '---',
    'title: "knowledge-graph-canvas · AI Pipeline — PRD + TAD"',
    'graphId: "kgc-knowledge-graph-canvas-prd-tad"',
    '$schema: "kgc-pipeline/v1"',
    'pipeline:',
    'flow:',
  ].join('\n')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 10, 54, 32),
    workspacePath: '/chat-log/20260420T105432Z/kgc_20260420T105432Z.md',
    requestText,
    assistantText,
  })
  const requiredSnippets = [
    'product: "Knowledge Graph Canvas"',
    'artifact: "Pitch Deck + PRD + TAD + TCO"',
    'owner: "solo founder"',
    'status: "recommended"',
    'doc_type: "Pitch Deck + PRD + TAD + TCO"',
    'title: "Knowledge Graph Canvas · AI Pipeline — Pitch Deck + PRD + TAD + TCO"',
    '## Pitch Deck + PRD + TAD + TCO',
    'label: "trigger / input"',
    'label: "context pack"',
    'label: "generate / process"',
    'label: "review / validate"',
    'label: "deliver / persist"',
    'actor: ["{{subject}}", "system"]',
    'actor: ["{{subject}}", "AI"]',
    'user_action: "{{subject}} selects scope; states the active request objective and constraints"',
    'Request injected as user turn; {{subject}} reviews streamed output for fit and clarity',
    'feedback_arcs:',
    'forward_edges:',
    'direction:  {key: direction,  type: string,  value: LR}',
    'computed:   {key: computed,   type: boolean, value: true}',
    'click n-trigger  "#pipeline" "S01 · trigger / input"',
    'click n-deliver  "#pipeline" "S05 · deliver / persist"',
    'seq:    R01',
    'seq:    R06',
    'retry ≤ {{runtime.maxRetry}}× via @edge:n-validate:correction→n-process:correction',
    '### Variable Link Map',
    '### Request Snapshot',
    '`{{product}}`',
    '`{{artifact}}`',
    '`{{subject}}`',
    '### Use Case',
    '### Problem',
    '### Solution',
    '### User Flow',
    '### Work Flow',
    '### Data Flow',
    '### Monetization Surface',
    '### Integration Boundaries',
    'OpenClaw',
    'Stripe',
    'RxDB',
    'MapLibre',
    'subscriptions',
    'pay-per-use',
    'conversion',
    'external users',
    'Stripe can cover checkout, payment confirmation, and post-payment handoff',
    'OpenClaw can cover marketplace listing and demand capture',
    'A user discovers the `{{product}}` offer',
    'unlocks the paid entitlement or action',
    '### Request Snapshot',
    'Canonical output path',
    'kgc_20260420T105432Z.md',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected latest recommendation fallback to include: ${snippet}`)
    }
  })
  if (!md.includes('domain: "MCP distribution + skills marketplace delivery + user-action monetization')) {
    throw new Error('Expected latest recommendation fallback to resolve a bounded but query-shaped domain')
  }
  if (
    !md.includes('objective: "support zero-budget execution; prioritize bootstrap execution; favor organic growth; package Knowledge Graph Canvas as an MCP offer; serve external users; support OpenClaw marketplace packaging; deliver Pitch Deck + PRD + TAD + TCO; evaluate B2C monetization; compare subscription, pay-per-use, and conversion monetization; expose Stripe payment and checkout integration') &&
    !md.includes('integrate Stripe checkout and payment flow')
  ) {
    throw new Error('Expected latest recommendation fallback to resolve a synthesized objective without clipped raw query fragments')
  }
  if (!md.includes('Which user action should trigger Stripe checkout, and what entitlement or fulfillment should follow payment completion?')) {
    throw new Error('Expected latest recommendation fallback to replace generic open questions with request-shaped ones')
  }
  if (!md.includes('S01 captures the active request brief for `{{product}}`')) {
    throw new Error('Expected latest recommendation fallback workflow wording to stay request-first rather than recommendation-first')
  }
  if (!md.includes('The execution contract below supports the current request:')) {
    throw new Error('Expected latest recommendation fallback computing-flow intro to stay request-facing')
  }
  if (md.includes('Recovered partial response signal:') || md.includes('Working response signal:')) {
    throw new Error('Expected malformed structured assistant fragments to be excluded from fallback prose')
  }
  if (md.includes('## {{doc_type}}') || md.includes('Edit Tier B variables (product, domain, subject, objective, artifact, owner, version, status)') || md.includes('This fallback preserves')) {
    throw new Error('Expected latest recommendation fallback to avoid placeholder body projections and generic template carryover')
  }
}

export function testKgcDeterministicFallbackShapesCreativeScriptQueryWithoutTrademarkCarryover() {
  const requestText = 'generate video script inspired by prometheus + jurassic park (FORBID mention/infringe trademark) `video-script-promessic.md`'
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 19, 20, 54),
    workspacePath: '/chat-log/20260420T192054Z/kgc_20260420T192054Z.md',
    requestText,
    assistantText: 'Need a cinematic script draft with awe and danger.',
  })

  const requiredSnippets = [
    'artifact: "video script"',
    'objective: "develop video script; keep the output original and production-ready; avoid direct trademark or franchise references; translate inspiration into high-level tone, pacing, and atmosphere only"',
    '### Request Snapshot',
    '### Request Fit',
    '### Direction',
    '### Guardrails',
    'video-script-promessic.md',
    'high-level inspiration only',
    'avoid direct trademark or franchise references',
    'request_scope',
    'objective_focus',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected creative script fallback to include: ${snippet}`)
    }
  })

  const forbiddenSnippets = [
    'Recommendation Snapshot',
    'OpenClaw marketplace distribution',
    'B2C monetization',
    'prometheus',
    'jurassic park',
  ]
  forbiddenSnippets.forEach(snippet => {
    if (md.toLowerCase().includes(snippet.toLowerCase())) {
      throw new Error(`Expected creative script fallback to avoid: ${snippet}`)
    }
  })
}

export function testKgcDeterministicFallbackStaysNeutralForGenericRequest() {
  const requestText = 'Draft a concise implementation memo for improving offline sync conflict visibility in a local-first workspace'
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 3, 20, 21, 46, 8),
    workspacePath: '/chat-log/20260420T214608Z/kgc_20260420T214608Z.md',
    requestText,
    assistantText: 'Need a short memo with implementation direction and constraints.',
  })

  const requiredSnippets = [
    '### Request Snapshot',
    '### Request Fit',
    '### Direction',
    '### Guardrails',
    '`{{artifact}}`',
    '`{{subject}}`',
    'This document packages `{{artifact}}` for `{{subject}}` around the active request.',
  ]
  requiredSnippets.forEach(snippet => {
    if (!md.includes(snippet)) {
      throw new Error(`Expected generic fallback to include: ${snippet}`)
    }
  })

  const forbiddenSnippets = [
    '### Use Case',
    '### Monetization Surface',
    '### Integration Boundaries',
    'recommendation package',
    'OpenClaw',
    'Stripe',
    'video-script-promessic.md',
    'This document turns one request into one reusable pipeline artifact.',
  ]
  forbiddenSnippets.forEach(snippet => {
    if (md.includes(snippet)) {
      throw new Error(`Expected generic fallback to avoid: ${snippet}`)
    }
  })
}

export function testValidateChatMarkdownRejectsWrappedKgcPreamble() {
  const wrapped = [
    'Here is your KGC document:',
    '',
    buildBaseTemplateSample(),
  ].join('\n')
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: wrapped })
  const validation = validateChatMarkdown({ markdown: wrapped, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject prose-wrapped KGC output')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected wrapped KGC to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('start immediately with YAML frontmatter')) {
    throw new Error(`Expected wrapped KGC validation message to mention the frontmatter envelope, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownRejectsCanvasPresetOnlyFallback() {
  const md = [
    '---',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentSemanticMode: "document"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '# Thin fallback',
    '## Note',
    'This shell mentions `{{subject}}` but omits the canonical KGC contract.',
  ].join('\n')
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject a canvas-preset-only KGC fallback')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected thin canvas-preset fallback to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('minimal canvas-preset-only')) {
    throw new Error(`Expected thin canvas-preset fallback message to mention minimal fallback, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownRejectsParallelGroupingChannelsBesideFlowSubgraphs() {
  const md = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '',
    ].join('\n'),
  )
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected validator to reject parallel grouping channels beside flow.subgraphs')
  }
  if (validation.failedRuleId !== 'V-03') {
    throw new Error(`Expected duplicate grouping channels to fail V-03, got ${validation.failedRuleId || 'unknown'}`)
  }
  if (!validation.errors[0]?.message.includes('flow.subgraphs as the only grouping source of truth')) {
    throw new Error(`Expected duplicate grouping validation message to mention flow.subgraphs SSOT, got: ${validation.errors[0]?.message || 'unknown error'}`)
  }
}

export function testValidateChatMarkdownAcceptsCanonicalFlowSubgraphsWithoutParallelGroupingChannels() {
  const md = buildBaseTemplateSample()
  if (/(^|\n)kg:subgraphs\s*:/m.test(md) || /(^|\n)(?:clusters|groups?|layers?)\s*:/m.test(md)) {
    throw new Error('Expected base template fixture to avoid parallel top-level grouping aliases')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected canonical flow.subgraphs-only KGC to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testNormalizeKgcAssistantBodyForStorageSalvagesWrappedStructuredDocument() {
  const wrapped = [
    'Here is your corrected KGC document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 4, 22, 16, 10, 0),
    workspacePath: '/chat-log/20260522T161000Z/kgc_20260522T161000Z.md',
    requestText: '',
    assistantText: wrapped,
  })
  if (!md.startsWith('---\n')) {
    throw new Error('Expected wrapped structured KGC salvage to start directly with YAML frontmatter')
  }
  if (md.includes('Here is your corrected KGC document.')) {
    throw new Error('Expected wrapped structured KGC salvage to strip wrapper prose before persistence')
  }
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error('Expected wrapped structured KGC salvage to remain structurally parseable')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected wrapped structured KGC salvage to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testNormalizeKgcAssistantBodyForStorageRejectsParallelGroupingStructuredDocument() {
  const invalid = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '  clusters:',
      '    - id: invalid-cluster',
      '      label: "Invalid cluster"',
      '      memberNodeIds: ["n-process"]',
      '',
    ].join('\n'),
  )
  const md = normalizeKgcAssistantBodyForStorage({
    timestampMs: Date.UTC(2026, 4, 22, 16, 12, 0),
    workspacePath: '/chat-log/20260522T161200Z/kgc_20260522T161200Z.md',
    requestText: 'Create a clean response contract for FloatingPanel Chat.',
    assistantText: invalid,
  })
  if (md.includes('invalid-sg') || md.includes('invalid-cluster') || /(^|\n)kg:subgraphs\s*:/m.test(md) || /\n\s+clusters:\s*\n/.test(md)) {
    throw new Error('Expected invalid parallel grouping payload to be rejected instead of mutated into storage')
  }
  if (!isKgcStructuredMarkdown(md)) {
    throw new Error('Expected rejected parallel grouping payload to rebuild a structurally parseable KGC')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: md })
  const validation = validateChatMarkdown({ markdown: md, resolvableVarKeys })
  if (!validation.ok) {
    throw new Error(`Expected canonical rebuilt KGC to validate, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testExtractKgcBlockFromAssistantTextSalvagesWrappedStructuredMarkdownDocument() {
  const wrapped = [
    'Here is your corrected KGC document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const extracted = extractKgcBlockFromAssistantText(wrapped)
  if (!extracted.kgc || !extracted.kgc.startsWith('---\n')) {
    throw new Error('Expected wrapped markdown response to yield a direct structured KGC candidate')
  }
  if (extracted.kgc.includes('Here is your corrected KGC document.')) {
    throw new Error('Expected wrapped markdown recovery to strip wrapper prose from the KGC candidate')
  }
  if (!isKgcStructuredMarkdown(extracted.kgc)) {
    throw new Error('Expected wrapped markdown recovery candidate to remain structurally parseable')
  }
  if (extracted.answer !== 'Here is your corrected KGC document.') {
    throw new Error(`Expected wrapped markdown recovery to preserve only the prose wrapper as answer, got: ${extracted.answer || 'empty'}`)
  }
}

export function testExtractKgcBlockFromAssistantTextPreservesParallelGroupingForValidation() {
  const invalid = buildBaseTemplateSample().replace(
    'flow:\n',
    [
      'kg:subgraphs:',
      '  - {id: invalid-sg, kind: subgraph, label: "Invalid", memberNodeIds: ["n-trigger"], parentId: null}',
      'flow:',
      '  groups:',
      '    - id: invalid-group',
      '      label: "Invalid group"',
      '      memberNodeIds: ["n-process"]',
      '',
    ].join('\n'),
  )
  const extracted = extractKgcBlockFromAssistantText(invalid)
  if (!extracted.kgc) {
    throw new Error('Expected invalid structured document to keep a recovered KGC candidate for validation')
  }
  if (!/(^|\n)kg:subgraphs\s*:/m.test(extracted.kgc) || !/\n\s+groups:\s*\n/.test(extracted.kgc)) {
    throw new Error('Expected recovery to preserve invalid grouping for validator rejection')
  }
  const resolvableVarKeys = buildResolvableVarKeySet({ frontmatter: null, markdown: extracted.kgc })
  const validation = validateChatMarkdown({ markdown: extracted.kgc, resolvableVarKeys })
  if (validation.ok) {
    throw new Error('Expected preserved parallel grouping candidate to fail validation')
  }
  if (!validation.errors[0]?.message.includes('flow.subgraphs as the only grouping source of truth')) {
    throw new Error(`Expected validation to reject parallel grouping, got ${validation.errors[0]?.ruleId}: ${validation.errors[0]?.message}`)
  }
}

export function testResolveKgcCorrectionInvalidMarkdownPrefersRecoveredStructuredKgcCandidate() {
  const wrapped = [
    'Here is your corrected KGC document.',
    '',
    '```markdown',
    buildBaseTemplateSample().trim(),
    '```',
  ].join('\n')
  const extracted = extractKgcBlockFromAssistantText(wrapped)
  const invalidMarkdown = resolveKgcCorrectionInvalidMarkdown({
    rawAssistantText: wrapped,
    extracted,
  })
  if (!invalidMarkdown.startsWith('---\n')) {
    throw new Error('Expected correction invalid-markdown source to start with the recovered KGC document')
  }
  if (invalidMarkdown.includes('Here is your corrected KGC document.')) {
    throw new Error('Expected correction invalid-markdown source to avoid raw wrapper prose when a structured KGC candidate was recovered')
  }
}

export function testResolveKgcCorrectionInvalidMarkdownFallsBackToTrimmedAnswerWhenNoKgcRecovered() {
  const raw = [
    'Here is my explanation first.',
    '',
    'The model did not return a standalone KGC document yet.',
    '',
    'Please retry.',
  ].join('\n')
  const extracted = extractKgcBlockFromAssistantText(raw)
  const invalidMarkdown = resolveKgcCorrectionInvalidMarkdown({
    rawAssistantText: raw,
    extracted,
  })
  if (invalidMarkdown !== raw.trim()) {
    throw new Error(`Expected correction invalid-markdown fallback to use the trimmed extracted answer, got: ${invalidMarkdown}`)
  }
}

export function testResolveChatAgenticGraphAttemptRetriesUsingRecoveredStructuredCandidate() {
  const thinWrapped = [
    'Please fix this KGC document.',
    '',
    '```markdown',
    '---',
    'kgFrontmatterModeEnabled: true',
    'kgDocumentSemanticMode: "document"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '# Thin fallback',
    '## Note',
    'This shell omits the canonical KGC contract.',
    '```',
  ].join('\n')
  const result = resolveChatAgenticGraphAttempt({
    assistantText: thinWrapped,
    packedFrontmatter: null,
    attempt: 1,
    maxValidationAttempts: 2,
  })
  if (result.kind !== 'retry') {
    throw new Error(`Expected thin wrapped KGC attempt to request retry, got ${result.kind}`)
  }
  if (result.correctionPrompt.includes('Please fix this KGC document.')) {
    throw new Error('Expected retry correction prompt to use the recovered KGC candidate, not the raw wrapper prose')
  }
  if (!result.correctionPrompt.includes('kgFrontmatterModeEnabled: true')) {
    throw new Error('Expected retry correction prompt to include the recovered thin KGC candidate for reference')
  }
}

export function testResolveChatAgenticGraphAttemptFinalizesValidatedCanonicalKgc() {
  const canonical = buildNeutralKgcFixtureDocument({
    timestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
    workspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
    requestText: 'Generate a canonical KGC document and apply it to Canvas.',
    assistantText: 'Create a neutral KGC document that finalizes through chatAgenticGraph validation.',
    expectationLabel: 'neutral validated KGC fixture',
  })
  const result = resolveChatAgenticGraphAttempt({
    assistantText: canonical,
    packedFrontmatter: null,
    attempt: 1,
    maxValidationAttempts: 2,
  })
  if (result.kind !== 'final') {
    throw new Error(`Expected canonical KGC attempt to finalize, got ${result.kind}`)
  }
  if (!result.validatedKgc || !result.validatedKgc.startsWith('---\n')) {
    throw new Error('Expected canonical KGC attempt to return validated KGC markdown')
  }
  if (result.finalAssistantText !== canonical) {
    throw new Error('Expected canonical KGC attempt to preserve the assistant text on successful validation')
  }
}

export async function testCreateChatAgenticGraphDraftWriterSkipsDuplicateNonForceWrites() {
  const persisted: string[] = []
  const followed: string[] = []
  const streamingStates: Array<{ path?: string | null; text?: string | null } | null> = []
  const streamDraftTextRef = { current: null as { path: string; text: string } | null }
  const flushDraft = createChatAgenticGraphDraftWriter({
    chatStorageTarget: 'chatAgenticGraph',
    liveKgcPath: '/workspace/chat/kgc.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 16, 30, 0),
    providerSummary: 'openai:gpt',
    userText: 'Generate KGC',
    defaultLocalRootPath: '/workspace',
    traceId: 'trace-stream-test',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followed.push(path) },
    setChatAgenticGraphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => { streamingStates.push(value) },
    persistDraft: async payload => { persisted.push(String(payload.assistantText || '')); return '/workspace/chat/kgc.md' },
  })
  await flushDraft('alpha', false)
  await flushDraft('alpha', false)
  await flushDraft('alpha', true)
  if (persisted.length !== 0) {
    throw new Error(`Expected streaming draft writer to avoid workspace persistence churn, got ${persisted.length} writes`)
  }
  if (followed.length !== 1) {
    throw new Error(`Expected duplicate draft updates to avoid repeated follow-path churn, got ${followed.length}`)
  }
  if (followed[0] !== '/workspace/chat/kgc.md') {
    throw new Error(`Expected live streaming follow path to stay on canonical KGC workspace, got ${JSON.stringify(followed)}`)
  }
  if (streamDraftTextRef.current?.text !== 'alpha') {
    throw new Error(`Expected live streaming draft state to retain the latest text, got: ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (streamDraftTextRef.current?.path !== '/workspace/chat/kgc.md') {
    throw new Error(`Expected live streaming draft state to stay on canonical KGC workspace, got: ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (
    streamingStates.length !== 1 ||
    streamingStates[0]?.text !== 'alpha'
  ) {
    throw new Error(`Expected duplicate non-force updates to land the live editor text once, got: ${JSON.stringify(streamingStates)}`)
  }
}

export async function testCreateChatAgenticGraphDraftWriterRejectsViteDevIndexHtmlDrafts() {
  const viteDevIndexHtml = [
    '<!doctype html><html lang="en">',
    '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>',
    '<script type="module" src="/@vite/client"></script>',
    '<main id="root"></main><script type="module" src="/src/main.tsx?t=123"></script>',
    '</html>',
  ].join('\n')
  const persisted: string[] = []
  const followed: string[] = []
  const streamingStates: Array<{ path?: string | null; text?: string | null } | null> = []
  const streamDraftTextRef = { current: null as { path: string; text: string } | null }
  const flushDraft = createChatAgenticGraphDraftWriter({
    chatStorageTarget: 'chatAgenticGraph',
    liveKgcPath: '/workspace/chat/kgc.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 16, 30, 0),
    providerSummary: 'openai:gpt',
    userText: 'Generate KGC',
    defaultLocalRootPath: '/workspace',
    traceId: 'trace-stream-html-test',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followed.push(path) },
    setChatAgenticGraphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => { streamingStates.push(value) },
    persistDraft: async payload => { persisted.push(String(payload.assistantText || '')); return '/workspace/chat/kgc.md' },
    persistWorkspaceDrafts: true,
  })

  await flushDraft(viteDevIndexHtml, true)

  if (persisted.length !== 0) {
    throw new Error(`Expected Vite dev app-shell HTML draft to avoid workspace persistence, got ${persisted.length} writes`)
  }
  if (followed.length !== 0) {
    throw new Error(`Expected rejected app-shell HTML draft not to move workspace selection, got ${JSON.stringify(followed)}`)
  }
  if (streamDraftTextRef.current?.text !== '') {
    throw new Error(`Expected rejected app-shell HTML draft to clear live draft text, got ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (streamDraftTextRef.current?.path !== '/workspace/chat/kgc.md') {
    throw new Error(`Expected rejected app-shell HTML draft state to clear against canonical KGC workspace, got ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  const lastStreamingState = streamingStates[streamingStates.length - 1]
  if (!lastStreamingState || lastStreamingState.text !== '') {
    throw new Error(`Expected rejected app-shell HTML draft to clear streaming state, got ${JSON.stringify(streamingStates)}`)
  }
  if (lastStreamingState.path !== '/workspace/chat/kgc.md') {
    throw new Error(`Expected rejected app-shell HTML streaming state to stay on canonical KGC workspace, got ${JSON.stringify(streamingStates)}`)
  }
}

export function testFinalizeSubmitTerminalStateResetsLoadingAbortAndStreamingWorkspace() {
  const loadingWrites: boolean[] = []
  const workspaceWrites: Array<string | null> = []
  const liveWorkspaceStreamingWrites: Array<{ path?: string | null; text?: string | null } | null> = []
  const abortRef = { current: new AbortController() as AbortController | null }
  const streamFollowRef = { current: { path: '/workspace/chat/trace.md', atMs: 123 } }
  const streamDraftTextRef = { current: { path: '/workspace/chat/trace.md', text: 'draft' } }
  finalizeSubmitTerminalState({
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    abortRef,
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    setChatWorkspaceStreamingState: value => { liveWorkspaceStreamingWrites.push(value) },
    streamFollowRef,
    streamDraftTextRef,
  })
  if (loadingWrites.length !== 1 || loadingWrites[0] !== false) {
    throw new Error(`Expected terminal lifecycle helper to set loading false once, got: ${JSON.stringify(loadingWrites)}`)
  }
  if (abortRef.current !== null) {
    throw new Error('Expected terminal lifecycle helper to clear abortRef.current')
  }
  if (workspaceWrites.length !== 1 || workspaceWrites[0] !== null) {
    throw new Error(`Expected terminal lifecycle helper to clear streaming workspace path once, got: ${JSON.stringify(workspaceWrites)}`)
  }
  if (liveWorkspaceStreamingWrites.length !== 1 || liveWorkspaceStreamingWrites[0] !== null) {
    throw new Error(`Expected terminal lifecycle helper to clear live workspace streaming state once, got: ${JSON.stringify(liveWorkspaceStreamingWrites)}`)
  }
  if (streamFollowRef.current !== null || streamDraftTextRef.current !== null) {
    throw new Error('Expected terminal lifecycle helper to clear both streaming refs')
  }
}

export function testResolveSubmitRuntimeFriendlyMessageUsesEndpointSpecificNetworkCopy() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: 'Failed to fetch',
    endpointUrl: 'https://chat.example.test/v1',
  })
  if (!friendly.includes('https://chat.example.test/v1')) {
    throw new Error(`Expected network-friendly submit message to include the endpoint URL, got: ${friendly}`)
  }
}

export function testResolveSubmitRuntimeFriendlyMessageUsesPreparationTimeoutCopy() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: `${CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR}:draft-bootstrap`,
    endpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
  })
  if (!friendly.includes('Agnes') || !friendly.includes('preparing the chat request')) {
    throw new Error(`Expected preparation-timeout submit message to use provider-friendly copy, got: ${friendly}`)
  }
}

export function testResolveSubmitRuntimeFriendlyMessageMapsAgnesInvalidTokenForServerManagedAuth() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: '无效的令牌 (request id: abc123)',
    endpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
  })
  if (!friendly.includes('Agnes') || !friendly.includes('server-managed chat proxy API key')) {
    throw new Error(`Expected Agnes invalid-token submit message to explain the server-managed key diagnosis, got: ${friendly}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorFailsOnPreparationTimeout() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const loadingWrites: boolean[] = []
  const workspaceWrites: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  let messages: ChatMessage[] = [
    { id: 'assistant-pending', role: 'assistant', content: '' },
  ]
  const submitArgs = buildSubmitArgsFixture({
    chatProvider: 'agnes-ai',
    chatStorageTarget: 'chatAgenticGraph',
    chatLocalStorageRootPath: '/workspace/chat',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/kgc_20260522T190000Z.md',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate KGC',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate KGC' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
    traceId: 'trace-prep-timeout',
    preparationTimeoutMs: 5,
    bootstrapDraft: () => new Promise<string | null>(() => {}),
  })

  if (!String(errors[0] || '').includes('preparing the chat request')) {
    throw new Error(`Expected coordinator to surface a preparation-timeout error, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected coordinator to mark connectivity error on preparation timeout, got: ${JSON.stringify({ connectivity, connectivityDetail, errors })}`)
  }
  if (loadingWrites[0] !== false || workspaceWrites[0] !== null || streamingAssistantWrites[0] !== null) {
    throw new Error(`Expected coordinator timeout exit to clear loading and streaming state, got: ${JSON.stringify({ loadingWrites, workspaceWrites, streamingAssistantWrites })}`)
  }
  if (!String(messages.find(message => message.id === 'assistant-pending')?.content || '').includes('preparing the chat request')) {
    throw new Error(`Expected coordinator timeout exit to persist the terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
}

export function testHandleSubmitIssueExitReportsMaterializedErrorAndFinalizes() {
  const logs: string[] = []
  const persisted: string[] = []
  const uiLogs: string[] = []
  const historySubTabs: Array<string | null> = []
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  let messages: ChatMessage[] = [
    { id: 'assistant-pending', role: 'assistant' as const, content: '' },
    { id: 'stable', role: 'assistant' as const, content: 'Stable response' },
  ]
  const abortRef = { current: new AbortController() as AbortController | null }
  const streamFollowRef = { current: { path: '/workspace/chat/trace.md', atMs: 1 } }
  const streamDraftTextRef = { current: { path: '/workspace/chat/trace.md', text: 'draft' } }
  const workspaceWrites: Array<string | null> = []
  const loadingWrites: boolean[] = []
  handleSubmitIssueExit({
    assistantMessageId: 'assistant-pending',
    requestText: 'Generate KGC',
    responseText: 'Synthetic submit failure',
    status: 'error',
    modelId: 'gpt-test',
    timestampMs: 42,
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    errorText: 'Synthetic submit failure',
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    connectivity: 'error',
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    connectivityDetail: 'connectivity detail',
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    abortRef,
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    streamFollowRef,
    streamDraftTextRef,
    pushChatExchangeLog: payload => { logs.push(`${payload.status}:${payload.response}`) },
    persistChatExchangeLog: async payload => { persisted.push(`${payload.status}:${payload.response}`) },
    pushUiLog: entry => { uiLogs.push(String(entry.message || '')) },
    requestHistorySubTab: value => { historySubTabs.push(value) },
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    endpointUrl: '/__chat_proxy/v1/chat/completions',
  })
  if (errors[0] !== 'Synthetic submit failure') {
    throw new Error(`Expected issue exit helper to write error text, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== 'connectivity detail') {
    throw new Error(`Expected issue exit helper to write connectivity state, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
  if (logs.length !== 1 || persisted.length !== 1) {
    throw new Error(`Expected issue exit helper to report exactly one log and one persisted issue, got logs=${logs.length}, persisted=${persisted.length}`)
  }
  if (uiLogs.length !== 1 || !uiLogs[0]?.includes('Agnes') || !uiLogs[0]?.includes('Synthetic submit failure')) {
    throw new Error(`Expected issue exit helper to push one Agnes diagnosis into the UI log, got: ${JSON.stringify(uiLogs)}`)
  }
  if (historySubTabs[0] !== 'log') {
    throw new Error(`Expected issue exit helper to bias History toward the Log subtab, got: ${JSON.stringify(historySubTabs)}`)
  }
  if (messages.find(message => message.id === 'assistant-pending')?.content !== 'Synthetic submit failure') {
    throw new Error(`Expected issue exit helper to persist the terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
  if (streamingAssistantWrites[0] !== null || abortRef.current !== null || workspaceWrites[0] !== null || loadingWrites[0] !== false) {
    throw new Error('Expected issue exit helper to clear streaming assistant, abort ref, workspace path, and loading state')
  }
}

export function testHandleSubmitIssueExitCanSkipReportingForEndpointFailure() {
  const logs: string[] = []
  const persisted: string[] = []
  const uiLogs: string[] = []
  let messages: ChatMessage[] = [{ id: 'assistant-pending', role: 'assistant', content: '' }]
  handleSubmitIssueExit({
    assistantMessageId: 'assistant-pending',
    requestText: 'Generate KGC',
    responseText: 'Endpoint status text',
    status: 'error',
    modelId: 'gpt-test',
    timestampMs: 99,
    setStreamingAssistant: () => {},
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
    setErrorText: () => {},
    errorText: 'Endpoint status text',
    setConnectivity: () => {},
    connectivity: 'error',
    setConnectivityDetail: () => {},
    connectivityDetail: 'Chat endpoint returned 500.',
    setIsLoading: () => {},
    abortRef: { current: null },
    setStreamingWorkspacePath: () => {},
    streamFollowRef: { current: null },
    streamDraftTextRef: { current: null },
    pushChatExchangeLog: payload => { logs.push(payload.response) },
    persistChatExchangeLog: async payload => { persisted.push(payload.response) },
    pushUiLog: entry => { uiLogs.push(String(entry.message || '')) },
    requestHistorySubTab: () => {},
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    endpointUrl: '/__chat_proxy/v1/chat/completions',
    shouldReportIssue: false,
  })
  if (logs.length !== 0 || persisted.length !== 0) {
    throw new Error(`Expected endpoint-style issue exit to skip reporting, got logs=${logs.length}, persisted=${persisted.length}`)
  }
  if (uiLogs.length !== 1 || !uiLogs[0]?.includes('Endpoint status text')) {
    throw new Error(`Expected endpoint-style issue exit to still push the diagnosis to the UI log, got: ${JSON.stringify(uiLogs)}`)
  }
  if (messages[0]?.content !== 'Endpoint status text') {
    throw new Error(`Expected endpoint-style issue exit to retain its terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
}

export function testResolvePreferredFallbackModelPrefersProviderOwnedCandidate() {
  const fallback = resolvePreferredFallbackModel({
    providerModelOptions: ['provider-a', 'provider-b'],
    availableModelIds: ['other', 'provider-b', 'provider-c'],
    effectiveModel: 'provider-a',
  })
  if (fallback !== 'provider-b') {
    throw new Error(`Expected preferred fallback helper to pick provider-owned candidate first, got: ${fallback}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptRetriesUnsupportedTokenParameter() {
  const calls: Array<{ model: string; tokenLimitKey: 'max_tokens' | 'max_completion_tokens' }> = []
  const response = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_tokens',
    controller: new AbortController(),
    sendChat: async (model, tokenLimitKey) => {
      calls.push({ model, tokenLimitKey })
      if (calls.length === 1) return new Response('bad token', { status: 400 })
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async res => (res.status === 400 ? "Unsupported parameter: 'max_tokens'" : null),
    providerModelOptions: ['model-a'],
    loadFallbackModelIds: async () => [],
  })
  if (!response.response.ok) {
    throw new Error('Expected token fallback transport attempt to recover to an OK response')
  }
  if (calls.length !== 2 || calls[1]?.tokenLimitKey !== 'max_completion_tokens') {
    throw new Error(`Expected transport helper to retry once with flipped token parameter, got: ${JSON.stringify(calls)}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptFallsBackToPreferredModel() {
  const calls: Array<{ model: string; tokenLimitKey: 'max_tokens' | 'max_completion_tokens' }> = []
  const resolvedModels: string[] = []
  const result = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_completion_tokens',
    controller: new AbortController(),
    sendChat: async (model, tokenLimitKey) => {
      calls.push({ model, tokenLimitKey })
      if (model === 'model-a') return new Response('fallback required', { status: 404 })
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async res => (res.status === 404 ? 'Model not found' : null),
    providerModelOptions: ['model-a', 'model-b'],
    loadFallbackModelIds: async () => ['other-model', 'model-b'],
    onResolvedFallbackModel: modelId => { resolvedModels.push(modelId) },
  })
  if (!result.response.ok || result.effectiveModel !== 'model-b') {
    throw new Error(`Expected transport helper to recover with preferred fallback model, got: ${JSON.stringify({ ok: result.response.ok, effectiveModel: result.effectiveModel })}`)
  }
  if (resolvedModels.length !== 1 || resolvedModels[0] !== 'model-b') {
    throw new Error(`Expected transport helper to notify exactly one resolved fallback model, got: ${JSON.stringify(resolvedModels)}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptRetriesRetryableNetworkErrorOnce() {
  let calls = 0
  const result = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_completion_tokens',
    controller: new AbortController(),
    sendChat: async () => {
      calls += 1
      if (calls === 1) throw new Error('Failed to fetch')
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async () => null,
    providerModelOptions: ['model-a'],
    loadFallbackModelIds: async () => [],
  })
  if (!result.response.ok || calls !== 2) {
    throw new Error(`Expected retryable network transport error to resend once and recover, got calls=${calls}, ok=${result.response.ok}`)
  }
}
