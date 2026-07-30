import fs from 'node:fs'
import path from 'node:path'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { TEST_VALIDATION_WORKSPACE_SEED_PATH } from '@/features/workspace-fs/workspaceFs'
import {
  isVideoAgentDemoPresetError,
  loadVideoAgentDemoPreset,
  resolveVideoAgentDemoPresetWorkspacePath,
} from '@/features/chat/videoAgentDemoPreset'
import {
  isPromptPresetCatalogError,
  loadPromptPresetCatalog,
  PROMPT_PRESET_CATALOG_WORKSPACE_PATH,
} from '@/features/chat/promptPresetCatalog'
import {
  buildVideoAgentPresetRunProgressResponse,
  isVideoAgentDemoPresetInvocation,
  persistVideoAgentDemoPresetExchange,
  resolveVideoAgentPresetExecutionPreflight,
  updateVideoAgentDemoPresetAssistantMessage,
} from '@/features/chat/floatingPanelChat/videoAgentDemoPresetSubmit'
import { installWorkflowRunAllRunner, requestWorkflowRunAllFromCommittedCanvas } from '@/features/canvas/workflowRunAllBridge'
import { resolveStoryboardWidgetWorkflowRunGraphSnapshot } from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowRunAll'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'
import { getChatInvocationOptions } from '@/features/chat/chatInvocationRegistry'
import {
  promptCatalogInvocation as invocation,
  promptCatalogMarkdown,
} from '@/__tests__/fixtures/promptPresetCatalogFixture'
import {
  adoptLatestChatHistoryTransition,
  getCachedChatHistory,
  putChatHistoryCache,
  publishChatHistoryTransition,
  resolveChatHistoryPersistenceAction,
  subscribeToChatHistoryCache,
  subscribeToChatHistoryTransition,
} from '@/features/chat/floatingPanelChat/floatingPanelChatRuntime'

const sourcePath = '/docs/video-script.md'

const presetMarkdown = [
  '---',
  'inputs:',
  `  video_generation_demo_script: "workspace:${sourcePath}"`,
  '  prompt_preset_id: "video-agent"',
  '---',
  '',
  '# Video preset',
].join('\n')

export const createPresetWorkspace = async () => {
  const workspace = createMemoryWorkspaceFs()
  await workspace.ensureSeed()
  await workspace.writeFileText(TEST_VALIDATION_WORKSPACE_SEED_PATH, presetMarkdown)
  await workspace.createFolder({ parentPath: '/', name: 'docs' })
  await workspace.createFile({ parentPath: '/docs', name: 'video-script.md', text: '# Source script' })
  await workspace.createFolder({ parentPath: '/', name: 'agentic-canvas-os' })
  await workspace.createFolder({ parentPath: '/agentic-canvas-os', name: 'docs' })
  await workspace.createFile({ parentPath: '/agentic-canvas-os/docs', name: 'PROMPT-PRESETS.md', text: promptCatalogMarkdown })
  return workspace
}

export async function testFloatingPanelChatVideoPresetLoadsSourceBackedInvocation() {
  const workspace = await createPresetWorkspace()
  const result = await loadVideoAgentDemoPreset(workspace)
  if (isVideoAgentDemoPresetError(result)) throw new Error(result.error)
  if (!result.prompt.startsWith(invocation) || !result.prompt.includes('Generate the complete source-backed video package.')) {
    throw new Error(`expected authored executable prompt, got ${result.prompt}`)
  }
  if (result.presetPath !== TEST_VALIDATION_WORKSPACE_SEED_PATH || result.sourcePath !== sourcePath) {
    throw new Error(`expected canonical preset/source paths, got ${JSON.stringify(result)}`)
  }
}

export async function testFloatingPanelChatVideoPresetPrefersCanonicalDocsMirrorAtRuntime() {
  const workspace = await createPresetWorkspace()
  const docsMirrorPath = '/docs/knowgrph-agentic-video-canvas-demo.md'
  await workspace.createFile({
    parentPath: '/docs',
    name: 'knowgrph-agentic-video-canvas-demo.md',
    text: presetMarkdown,
  })
  const runtimePath = await resolveVideoAgentDemoPresetWorkspacePath({
    fs: workspace,
    preferDocsMirror: true,
  })
  const isolatedOverridePath = await resolveVideoAgentDemoPresetWorkspacePath({
    fs: workspace,
    preferDocsMirror: false,
  })
  if (runtimePath !== docsMirrorPath || isolatedOverridePath !== TEST_VALIDATION_WORKSPACE_SEED_PATH) {
    throw new Error(`expected runtime to prefer the canonical docs mirror without changing isolated overrides, got ${JSON.stringify({ runtimePath, isolatedOverridePath })}`)
  }
}

export async function testFloatingPanelChatVideoPresetFailsClosedWithoutSource() {
  const workspace = await createPresetWorkspace()
  await workspace.deleteEntry(sourcePath)
  const result = await loadVideoAgentDemoPreset(workspace)
  if (!isVideoAgentDemoPresetError(result) || !result.error.includes(sourcePath)) {
    throw new Error(`expected missing-source error, got ${JSON.stringify(result)}`)
  }
}

export async function testFloatingPanelChatPromptPresetCatalogFailsClosedOnMissingEntry() {
  const workspace = await createPresetWorkspace()
  await workspace.writeFileText(PROMPT_PRESET_CATALOG_WORKSPACE_PATH, promptCatalogMarkdown.replace('  - id: "investment-research-agent"', '  - id: "sme-care-agent"'))
  const catalog = await loadPromptPresetCatalog(workspace)
  if (!isPromptPresetCatalogError(catalog) || !catalog.error.includes('duplicate ids')) {
    throw new Error(`expected duplicate preset ids to fail closed, got ${JSON.stringify(catalog)}`)
  }
}

export function testFloatingPanelPromptPresetsIsFirstClassViewAfterSkillsCommands() {
  const toolbarSource = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), 'utf8')
  const chatFooterSource = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'FloatingPanelChatSections.tsx'), 'utf8')
  const skillsIndex = toolbarSource.indexOf("{ view: 'skillsCommands'")
  const presetsIndex = toolbarSource.indexOf("{ view: 'promptPresets'")
  const viewIndex = toolbarSource.indexOf("{ view: 'view'")
  if (skillsIndex < 0 || presetsIndex <= skillsIndex || viewIndex <= presetsIndex) {
    throw new Error('expected Prompt Presets immediately after Skills & Commands in FloatingPanel')
  }
  if (!toolbarSource.includes("floatingPanelView === 'promptPresets' && <FloatingPanelPromptPresetsView />")) {
    throw new Error('expected the first-class Prompt Presets FloatingPanel view to render')
  }
  if (chatFooterSource.includes('FloatingPanelChatPromptPresetControl')) {
    throw new Error('Chat footer must not retain the duplicate prompt preset selector')
  }
}

export function testFloatingPanelPromptPresetsViewOwnsCatalogAndChatHandoff() {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'toolbar', 'FloatingPanelPromptPresetsView.tsx'), 'utf8')
  const selectionRuntimeSource = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'promptPresetSelectionRuntime.ts'), 'utf8')
  for (const expected of [
    'defaultPromptPresetSelectionRuntime',
    '...defaultPromptPresetSelectionRuntime',
    'openFloatingPanelChatWithSeedWhenReady({',
    "mode: 'replace'",
    "delivery: 'queuedHandoff'",
    'submit: false',
    'data-kg-floating-panel-prompt-presets-view="true"',
  ]) {
    if (!source.includes(expected)) throw new Error(`Prompt Presets view missing ${expected}`)
  }
  for (const expected of ['loadPromptPresetCatalog()', 'loadPromptPresetInvocation(id)']) {
    if (!selectionRuntimeSource.includes(expected)) throw new Error(`shared Prompt Presets selection runtime missing ${expected}`)
  }
}

export function testFloatingPanelChatVideoPresetInvocationBypassesGenericChat() {
  if (!isVideoAgentDemoPresetInvocation(invocation)) throw new Error('expected canonical video preset invocation')
  const projectedSourceBinding = '/video-agent @video-generation-demo-script @provider.byteplus @text @image @audio @video #spec.low #thinking.type.enabled #token-cap.medium @[video-script.md](https://airvio.co/knowgrph/share/opaque)'
  if (!isVideoAgentDemoPresetInvocation(projectedSourceBinding)) {
    throw new Error('expected the structured source-chip projection to retain preset routing')
  }
  if (isVideoAgentDemoPresetInvocation('/video-agent @video #spec.low unrelated request')) {
    throw new Error('expected unrelated /video-agent requests to retain the generic chat path')
  }
  if (isVideoAgentDemoPresetInvocation('/video-agent note:@video-generation-demo-scripted')) {
    throw new Error('expected source-binding substrings to retain the generic chat path')
  }
  const submitHook = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'floatingPanelChat', 'useFloatingPanelChatSubmit.ts'), 'utf8')
  const presetIndex = submitHook.indexOf('tryActivateVideoAgentDemoPreset')
  const requestIndex = submitHook.indexOf('resolveRequestUrlOrSetError({')
  if (presetIndex < 0 || requestIndex < 0 || presetIndex >= requestIndex) {
    throw new Error('expected source-backed preset activation before generic chat request preflight')
  }
}

export function testFloatingPanelChatVideoPresetExecutionPreflightUsesInvocationProvider() {
  const byok = resolveVideoAgentPresetExecutionPreflight({
    input: invocation,
    chatAuthMode: 'byok',
    chatApiKey: 'test-key',
  })
  if (
    byok.ok === false
    || byok.invocation.provider !== 'byteplus-modelark'
    || byok.invocation.specification !== 'low'
    || byok.invocation.thinkingType !== 'enabled'
    || byok.invocation.tokenCap !== 'medium'
    || byok.invocation.reasoningEffort !== 'medium'
    || byok.invocation.maxCompletionTokens !== 16384
  ) {
    throw new Error(`expected preset execution to use BytePlus low spec with enabled thinking and the default medium token cap, got ${JSON.stringify(byok)}`)
  }
  if (byok.invocation.prompt.includes('#thinking.type') || byok.invocation.prompt.includes('#token-cap')) {
    throw new Error(`expected typed thinking and token-cap grammar to stay out of the provider prompt, got ${byok.invocation.prompt}`)
  }
  const missingByok = resolveVideoAgentPresetExecutionPreflight({
    input: invocation,
    chatAuthMode: 'byok',
    chatApiKey: '',
  })
  if (missingByok.ok !== false || !missingByok.error.includes('BytePlus ModelArk BYOK')) {
    throw new Error(`expected missing BYOK to fail before provider execution, got ${JSON.stringify(missingByok)}`)
  }
  const serverManaged = resolveVideoAgentPresetExecutionPreflight({
    input: invocation,
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
  })
  if (serverManaged.ok === false) {
    throw new Error(`expected server-managed preset execution to pass credential preflight, got ${JSON.stringify(serverManaged)}`)
  }
}

export function testFloatingPanelChatVideoPresetResolvesThinkingAndTokenCapProfiles() {
  const declaredTokens = new Set(getChatInvocationOptions().map(option => option.token))
  for (const token of ['#thinking.type.enabled', '#thinking.type.disabled', '#thinking.type.auto', '#token-cap.low', '#token-cap.medium', '#token-cap.high']) {
    if (!declaredTokens.has(token as `#${string}`)) throw new Error(`composer invocation registry missing ${token}`)
  }
  const tokenProfiles = [
    { token: '#token-cap.low', tokenCap: 'low', reasoningEffort: 'low', maxCompletionTokens: 4096 },
    { token: '#token-cap.medium', tokenCap: 'medium', reasoningEffort: 'medium', maxCompletionTokens: 16384 },
    { token: '#token-cap.high', tokenCap: 'high', reasoningEffort: 'high', maxCompletionTokens: 32768 },
  ] as const
  for (const expected of tokenProfiles) {
    const result = resolveVideoAgentPresetExecutionPreflight({
      input: invocation.replace('#token-cap.medium', expected.token),
      chatAuthMode: 'serverManaged',
      chatApiKey: null,
    })
    if (
      result.ok === false
      || result.invocation.tokenCap !== expected.tokenCap
      || result.invocation.reasoningEffort !== expected.reasoningEffort
      || result.invocation.maxCompletionTokens !== expected.maxCompletionTokens
    ) {
      throw new Error(`unexpected ${expected.token} profile: ${JSON.stringify(result)}`)
    }
  }
  for (const thinkingType of ['enabled', 'disabled', 'auto'] as const) {
    const result = resolveVideoAgentPresetExecutionPreflight({
      input: invocation.replace('#thinking.type.enabled', `#thinking.type.${thinkingType}`),
      chatAuthMode: 'serverManaged',
      chatApiKey: null,
    })
    if (result.ok === false || result.invocation.thinkingType !== thinkingType) {
      throw new Error(`unexpected #thinking.type.${thinkingType} profile: ${JSON.stringify(result)}`)
    }
  }
}

export async function testFloatingPanelChatVideoPresetQueuesCommittedRunAllOwner() {
  let runCount = 0
  let statusMessage = ''
  const acceptedPromise = requestWorkflowRunAllFromCommittedCanvas({
    source: 'chat',
    onStatus: status => { statusMessage = status.message },
  })
  await Promise.resolve()
  const uninstall = installWorkflowRunAllRunner(detail => {
    if (detail.source !== 'chat') throw new Error(`expected Chat run source, got ${String(detail.source)}`)
    detail.onStatus?.({ phase: 'running', message: 'Run All running 1/3: Text', current: 1, total: 3 })
    runCount += 1
  })
  const accepted = await acceptedPromise
  uninstall()
  if (!accepted || runCount !== 1 || statusMessage !== 'Run All running 1/3: Text') {
    throw new Error(`expected the committed Storyboard owner to stream one queued Run all into Chat, got accepted=${String(accepted)} runs=${runCount} status=${statusMessage}`)
  }
}

export function testFloatingPanelChatVideoPresetUsesExactCommittedGraphSnapshot() {
  const staleDraft = { type: 'Graph', nodes: [], edges: [] } as never
  const committedGraph = {
    type: 'Graph',
    nodes: [{ id: 'video_text_generation', type: 'TextGeneration' }],
    edges: [],
  } as never
  const chatSnapshot = resolveStoryboardWidgetWorkflowRunGraphSnapshot({
    detail: { source: 'chat', committedGraphData: committedGraph },
    draftGraphData: staleDraft,
    currentGraphData: staleDraft,
  })
  if (chatSnapshot !== committedGraph) {
    throw new Error('expected Chat-triggered Run all to adopt the exact committed preset graph instead of a stale mounted draft')
  }
  const toolbarSnapshot = resolveStoryboardWidgetWorkflowRunGraphSnapshot({
    detail: { source: 'toolbar' },
    draftGraphData: staleDraft,
    currentGraphData: committedGraph,
  })
  if (toolbarSnapshot !== staleDraft) {
    throw new Error('expected ordinary toolbar Run all to preserve the authored Storyboard draft authority')
  }
}

export function testFloatingPanelChatVideoPresetRunProgressUpdatesAssistantBubble() {
  const historyKey = 'kg:chat:history:video-run-progress'
  const assistantMessageId = 'video-preset-assistant-progress'
  let messages: ChatMessage[] = [
    { id: 'video-preset-user-progress', role: 'user', content: invocation },
    { id: assistantMessageId, role: 'assistant', content: 'Run All starting.' },
  ]
  const content = buildVideoAgentPresetRunProgressResponse({
    startedResponse: 'Loaded the source-backed canvas.',
    status: { phase: 'running', message: 'Run All running 2/3: Image', current: 2, total: 3 },
  })
  updateVideoAgentDemoPresetAssistantMessage({
    assistantMessageId,
    content,
    historyKeys: [historyKey],
    setMessages: value => { messages = typeof value === 'function' ? value(messages) : value },
  })
  if (messages[1]?.content !== content || !messages[1]?.content.includes('Run All running 2/3: Image')) {
    throw new Error(`expected Run All progress inside the initiating assistant bubble, got ${JSON.stringify(messages)}`)
  }
  if (getCachedChatHistory(historyKey)?.[1]?.content !== content) {
    throw new Error('expected live Run All Chat progress to update the shared graph-history cache')
  }
}

export function testFloatingPanelChatNewChatDefersHostArtifactUntilFinalization() {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'FloatingPanelChat.tsx'), 'utf8')
  const start = source.indexOf('const handleNewChat = React.useCallback')
  const end = source.indexOf('const graphLookup = React.useMemo', start)
  const newChatOwner = source.slice(start, end)
  if (start < 0 || end <= start) throw new Error('expected New Chat lifecycle owner')
  if (newChatOwner.includes("writeWorkspaceFileTextEnsuringFile({ path: nextPath, text: '' })")) {
    throw new Error('New Chat must not write an empty canonical workspace artifact')
  }
  if (newChatOwner.includes("mirrorChatWorkspaceFileToHost({ workspacePath: nextPath, text: '' })")) {
    throw new Error('New Chat must not mirror an empty canonical host artifact')
  }
}

export async function testFloatingPanelChatVideoPresetLogsActivationWithoutGeneratedKgc() {
  for (const status of ['ok', 'error'] as const) {
    let messages: ChatMessage[] = []
    let input = '/video-agent @video-generation-demo-script #spec.low'
    const runtimeLogs: Array<{ status: string; response: string }> = []
    const hostLogs: Array<{ status: string; response: string }> = []
    const sourceHistoryKey = `preset-source-${status}`
    const activatedHistoryKey = `preset-activated-${status}`
    putChatHistoryCache(sourceHistoryKey, [])
    putChatHistoryCache(activatedHistoryKey, [])
    const response = status === 'ok' ? 'Activated the source-backed canvas.' : 'Unable to activate the source-backed canvas.'
    await persistVideoAgentDemoPresetExchange({
      input,
      response,
      status,
      timestampMs: status === 'ok' ? 1_720_000_000_000 : 1_720_000_000_001,
      modelId: 'video-agent-preset',
      historyKeys: [sourceHistoryKey, activatedHistoryKey],
      messages,
      setInput: value => { input = typeof value === 'function' ? value(input) : value },
      setMessages: value => { messages = typeof value === 'function' ? value(messages) : value },
      pushChatExchangeLog: payload => { runtimeLogs.push(payload) },
      persistChatExchangeLog: async payload => { hostLogs.push(payload) },
    })
    if (input !== '') throw new Error(`expected ${status} preset input to clear after activation settles`)
    if (messages.length !== 2 || messages[0]?.role !== 'user' || messages[1]?.content !== response) {
      throw new Error(`expected ${status} preset exchange to remain visible, got ${JSON.stringify(messages)}`)
    }
    if (runtimeLogs.length !== 1 || runtimeLogs[0]?.status !== status || runtimeLogs[0]?.response !== response) {
      throw new Error(`expected ${status} preset exchange in the shared runtime log, got ${JSON.stringify(runtimeLogs)}`)
    }
    if (hostLogs.length !== 1 || hostLogs[0]?.status !== status || hostLogs[0]?.response !== response) {
      throw new Error(`expected ${status} preset exchange in the host diagnostic log, got ${JSON.stringify(hostLogs)}`)
    }
    for (const historyKey of [sourceHistoryKey, activatedHistoryKey]) {
      const cached = getCachedChatHistory(historyKey)
      if (cached?.length !== 2 || cached[1]?.content !== response) {
        throw new Error(`expected ${status} preset exchange to survive graph-derived history key handoff at ${historyKey}, got ${JSON.stringify(cached)}`)
      }
    }
  }
  const submitSource = fs.readFileSync(path.join(process.cwd(), 'src', 'features', 'chat', 'floatingPanelChat', 'videoAgentDemoPresetSubmit.ts'), 'utf8')
  const exchangeStart = submitSource.indexOf('export const persistVideoAgentDemoPresetExchange')
  const exchangeEnd = submitSource.indexOf('export const updateVideoAgentDemoPresetAssistantMessage', exchangeStart)
  if (submitSource.slice(exchangeStart, exchangeEnd).includes('finalizeAssistantSuccess')) {
    throw new Error('preset activation must not enter generated-KGC finalization before any provider stage reaches a terminal status')
  }
  if (!submitSource.includes('applyWorkspaceDocumentToCanvas: false')) {
    throw new Error('terminal video-preset finalization must preserve the committed source-backed graph as canvas authority')
  }
  if (!submitSource.includes("source: 'chat'") || !submitSource.includes('onStatus: publishRunStatusToChat')) {
    throw new Error('preset submission must hand the committed source graph to the shared Run all owner')
  }
  for (const expectedSetting of [
    'setChatProvider(preflight.invocation.provider)',
    'setChatThinkingType(preflight.invocation.thinkingType)',
    'setChatReasoningEffort(preflight.invocation.reasoningEffort)',
    'setChatMaxCompletionTokens(preflight.invocation.maxCompletionTokens)',
  ]) {
    if (!submitSource.includes(expectedSetting)) {
      throw new Error(`preset submission must project its typed invocation into the shared generation runtime: ${expectedSetting}`)
    }
  }
  const runAllSource = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'useStoryboardWidgetWorkflowRunAll.ts'), 'utf8')
  const nodeRunnerSource = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const mediaRunnerSource = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowMediaRunHandlers.ts'), 'utf8')
  if (!runAllSource.includes('propagateErrors: true') || !runAllSource.includes("requireDurableMediaPersistence: detail.source === 'chat'")) {
    throw new Error('Chat-triggered Run all must receive terminal node failures and require durable generated-media registration')
  }
  if (!nodeRunnerSource.includes('if (runOptions?.propagateErrors) throw error') || !mediaRunnerSource.includes('durable Media registration did not confirm R2/D1 persistence')) {
    throw new Error('shared node runners must propagate provider and persistence failures to the initiating Chat bubble')
  }
}

export function testFloatingPanelChatHistoryHydrationCannotOverwriteTargetCache() {
  const historyKey = 'kg:chat:history:source-backed-video-demo'
  if (resolveChatHistoryPersistenceAction({
    historyKey,
    pendingHydrationHistoryKey: historyKey,
  }) !== 'skip-hydration-commit') {
    throw new Error('the pre-hydration commit must not persist stale messages over the target graph history')
  }
  if (resolveChatHistoryPersistenceAction({
    historyKey,
    pendingHydrationHistoryKey: null,
  }) !== 'persist') {
    throw new Error('settled graph history must resume normal persistence')
  }
}

export function testFloatingPanelChatHistoryCachePublishesGraphHandoff() {
  const historyKey = 'kg:chat:history:activated-video-demo'
  const published: ChatMessage[][] = []
  const unsubscribe = subscribeToChatHistoryCache(historyKey, messages => {
    published.push(messages)
  })
  const messages: ChatMessage[] = [
    { id: 'video-preset-user', role: 'user', content: '/video-agent' },
    { id: 'video-preset-assistant', role: 'assistant', content: 'Loaded source-backed canvas.' },
  ]
  putChatHistoryCache(historyKey, messages)
  putChatHistoryCache(historyKey, messages.slice())
  unsubscribe()
  putChatHistoryCache(historyKey, [])
  if (published.length !== 1 || published[0]?.[1]?.content !== 'Loaded source-backed canvas.') {
    throw new Error(`expected one deduplicated graph-history handoff publication, got ${JSON.stringify(published)}`)
  }
}

export function testFloatingPanelChatHistoryTransitionPublishesToActiveOwner() {
  const historyKey = 'kg:chat:history:active-video-demo'
  const published: ChatMessage[][] = []
  const messages: ChatMessage[] = [
    { id: 'video-preset-user-active', role: 'user', content: '/video-agent' },
    { id: 'video-preset-assistant-active', role: 'assistant', content: 'Loaded source-backed canvas.' },
  ]
  const returned = publishChatHistoryTransition({ historyKeys: [historyKey], messages })
  const unsubscribe = subscribeToChatHistoryTransition(historyKey, nextMessages => {
    published.push(nextMessages)
  })
  unsubscribe()
  if (returned !== messages || published.length !== 1 || published[0] !== messages) {
    throw new Error(`expected the remounted active history owner to receive the transition, got ${JSON.stringify(published)}`)
  }
}

export function testFloatingPanelChatHistoryTransitionAdoptsGraphKeyCascade() {
  const sourceHistoryKey = 'kg:chat:history:video-cascade-source'
  const committedHistoryKey = 'kg:chat:history:video-cascade-committed'
  const settledHistoryKey = 'kg:chat:history:video-cascade-settled'
  const messages: ChatMessage[] = [
    { id: 'video-preset-user-cascade', role: 'user', content: '/video-agent' },
    { id: 'video-preset-assistant-cascade', role: 'assistant', content: 'Run All starting.' },
  ]
  publishChatHistoryTransition({ historyKeys: [sourceHistoryKey, committedHistoryKey], messages })
  const adopted = adoptLatestChatHistoryTransition({
    historyKey: settledHistoryKey,
    previousHistoryKey: committedHistoryKey,
    currentMessages: messages,
  })
  if (adopted !== messages || getCachedChatHistory(settledHistoryKey) !== messages) {
    throw new Error('expected the visible preset exchange to follow the graph into its settled history key')
  }
  const published: ChatMessage[][] = []
  const unsubscribe = subscribeToChatHistoryTransition(settledHistoryKey, nextMessages => {
    published.push(nextMessages)
  })
  const progressedMessages = messages.map(message => (
    message.id === 'video-preset-assistant-cascade'
      ? { ...message, content: 'Run All running 2/3: Image' }
      : message
  ))
  publishChatHistoryTransition({ historyKeys: [sourceHistoryKey], messages: progressedMessages })
  unsubscribe()
  if (published.length !== 2 || published[1]?.[1]?.content !== 'Run All running 2/3: Image') {
    throw new Error(`expected later Run-all status to reach the adopted Chat owner, got ${JSON.stringify(published)}`)
  }
  const unrelated = adoptLatestChatHistoryTransition({
    historyKey: 'kg:chat:history:unrelated-target',
    previousHistoryKey: 'kg:chat:history:unrelated-source',
    currentMessages: progressedMessages,
  })
  if (unrelated) throw new Error('unrelated graph histories must not adopt the preset transition')
}
