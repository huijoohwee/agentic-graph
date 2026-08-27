import { buildChatInvocationSystemPrompt, parseChatInvocationDirectives } from '@/features/chat/chatInvocationRegistry'
import { parseNativeImportUrlInvocation } from '@/features/chat/nativeImportUrlInvocation'
import { buildAgenticGraphVdeoxplnChatSystemPrompt, buildAgenticGraphVdeoxplnRoutingPlan } from '@/features/agent-ready/agenticgraphVdeoxplnContract.mjs'
import {
  AGENTIC_OS_DOCS_GITHUB_ROOT_URL,
} from '@/features/agentic-os/agenticOsDocInvocations'
import {
  buildFloatingPanelChatComposerDisplayText,
  buildFloatingPanelChatComposerOverlayParts,
  deleteFloatingPanelChatComposerProjectedTokenDisplayRange,
} from '@/features/chat/floatingPanelChat/FloatingPanelChatComposerMediaOverlay'
import { replaceChatComposerTrigger, resolveChatComposerTrigger } from '@/features/chat/floatingPanelChat/chatComposerTrigger'
import { buildUploadedMediaInlineCommandCandidate } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import type { UploadedMediaStorageResult } from '@/lib/storage/uploadedMediaStorage'
export function testAgenticOsInvocationsUsePublicSourceLinks() {
  if (!AGENTIC_OS_DOCS_GITHUB_ROOT_URL.startsWith('https://github.com/huijoohwee/agentic-canvas-os/')) {
    throw new Error(`expected the invocation source root to use the Agentic Canvas OS repository, got ${AGENTIC_OS_DOCS_GITHUB_ROOT_URL}`)
  }
  if (AGENTIC_OS_DOCS_GITHUB_ROOT_URL.includes('/Users/') || AGENTIC_OS_DOCS_GITHUB_ROOT_URL.includes('localhost')) {
    throw new Error(`expected a portable invocation source root, got ${AGENTIC_OS_DOCS_GITHUB_ROOT_URL}`)
  }
}
export function testFloatingPanelChatComposerTriggerRangesStayInlineAndNeutral() {
  const slash = resolveChatComposerTrigger('Review /story', 13)
  if (!slash || slash.kind !== 'slash' || slash.query !== 'story') {
    throw new Error(`expected slash trigger at the caret, got ${JSON.stringify(slash)}`)
  }
  const slashReplacement = replaceChatComposerTrigger({ text: 'Review /story', trigger: slash, replacement: '/storybuilding ' })
  if (slashReplacement.text !== 'Review /storybuilding ') {
    throw new Error(`expected only the active slash token to be replaced, got ${JSON.stringify(slashReplacement)}`)
  }
  const variable = resolveChatComposerTrigger('Use @pro', 8)
  if (!variable || variable.kind !== 'variable' || variable.query !== 'pro') {
    throw new Error(`expected variable trigger at the caret, got ${JSON.stringify(variable)}`)
  }
  const variableReplacement = replaceChatComposerTrigger({ text: 'Use @pro #media', trigger: variable, replacement: '![project](https://example.com/project.png)' })
  if (variableReplacement.text !== 'Use ![project](https://example.com/project.png) #media') {
    throw new Error(`expected shared @ token insertion to add one boundary space, got ${JSON.stringify(variableReplacement)}`)
  }
  const invocation = resolveChatComposerTrigger('Recall #memory.sea', 18)
  if (!invocation || invocation.kind !== 'keyword' || invocation.query !== 'memory.sea') {
    throw new Error(`expected runtime invocation trigger at the caret, got ${JSON.stringify(invocation)}`)
  }
  const invocationReplacement = replaceChatComposerTrigger({ text: 'Recall #memory.sea  next', trigger: invocation, replacement: '#memory.search ' })
  if (invocationReplacement.text !== 'Recall #memory.search next') throw new Error(`expected shared # token insertion to normalize trailing spacing, got ${JSON.stringify(invocationReplacement)}`)
}
export function testFloatingPanelChatIngestCommandUsesCanonicalNativeParser() {
  const parsed = parseNativeImportUrlInvocation('/ingest-url @url:https://example.com/source.md @reference-policy #canvas')
  if (parsed?.url !== 'https://example.com/source.md') {
    throw new Error(`expected canonical ingest command parsing, got ${JSON.stringify(parsed)}`)
  }
  if (parseNativeImportUrlInvocation('/ingest-url https://example.com/source.md') !== null) {
    throw new Error('expected the legacy direct-URL ingest shape to remain rejected')
  }
  if (parseNativeImportUrlInvocation('/ingest-url @url:https://example.com/source.md @reference-policy #canvas extra') !== null) {
    throw new Error('expected extra invocation operands to remain rejected')
  }
}
export function testFloatingPanelChatMemoryInvocationBuildsExternalRuntimeContract() {
  const directives = parseChatInvocationDirectives('Use #memory.search with #memory.extract, #memory.user_model, #promotion.retry, #media, #mcp, and #model for this request.')
  if (directives.map(directive => directive.id).join(',') !== 'memory.search,memory.extract,memory.user_model,promotion.retry,media,mcp,model') {
    throw new Error(`expected ordered deduplicated invocation directives, got ${JSON.stringify(directives)}`)
  }
  const invocationPrompt = buildChatInvocationSystemPrompt({
    userQuery: 'Use #memory.search with #memory.extract, #memory.user_model, #promotion.retry, #media, #mcp, and #model for this request.',
    chatProvider: 'openai',
    chatModel: 'gpt-5-nano',
  })
  for (const expected of ['agenticgraph.memory.search', 'agenticgraph.memory.extract_procedural', 'agenticgraph.memory.materialize_user_model', 'openai / gpt-5-nano', 'explicit user_id', 'output_dir rooted inside AGENTICGRAPH_ROOT', 'deterministic USER_MODEL markdown', 'stable workspace path under the local chat root', 'exact workspace artifact paths', 'reuses the saved local workspace artifact as-is', 'media references present', 'never claim execution']) {
    if (!invocationPrompt.includes(expected)) throw new Error(`expected invocation prompt to include ${expected}`)
  }
  const agenticOsOverlay = buildFloatingPanelChatComposerOverlayParts('/runtime-ready.check #frontmatter @operator')
  const agenticOsOverlayTokens = agenticOsOverlay.parts.flatMap(part => part.kind === 'invocation' ? [`${part.tokenKind}:${part.text}`] : [])
  if (!agenticOsOverlay.hasOverlay || JSON.stringify(agenticOsOverlayTokens) !== JSON.stringify(['slash:/runtime-ready.check', 'keyword:#frontmatter', 'binding:@operator'])) {
    throw new Error(`expected /, #, and @ Agentic OS tokens to render invocation chip metrics, got ${JSON.stringify(agenticOsOverlay)}`)
  }
  const chatRegistryOverlay = buildFloatingPanelChatComposerOverlayParts('/ingest-url #memory.add')
  const chatRegistryOverlayTokens = chatRegistryOverlay.parts.flatMap(part => part.kind === 'invocation' ? [`${part.tokenKind}:${part.text}`] : [])
  if (!chatRegistryOverlay.hasOverlay || JSON.stringify(chatRegistryOverlayTokens) !== JSON.stringify(['slash:/ingest-url', 'keyword:#memory.add'])) {
    throw new Error(`expected command-only / and # input to render shared invocation chips, got ${JSON.stringify(chatRegistryOverlay)}`)
  }
  const plan = buildAgenticGraphVdeoxplnRoutingPlan({ intentText: '#memory.extract promote scoped procedural memory from harness replay output_dir' })
  if (plan.selectedVdeoxplnId !== 'agenticgraph-memory-layer') {
    throw new Error(`expected memory invocation to select the memory-layer runtime, got ${JSON.stringify(plan)}`)
  }
  const routingPrompt = buildAgenticGraphVdeoxplnChatSystemPrompt(plan)
  for (const toolName of ['agenticgraph.memory.add', 'agenticgraph.memory.search', 'agenticgraph.memory.assemble_prompt', 'agenticgraph.memory.extract_procedural', 'agenticgraph.memory.materialize_user_model']) {
    if (!routingPrompt.includes(toolName)) throw new Error(`expected routing prompt to expose ${toolName}`)
  }
  const uploadedCandidate = buildUploadedMediaInlineCommandCandidate({
    id: 'cloudflare-media:cover',
    name: 'Storyboard cover',
    kind: 'image',
    localUrl: '',
    linkUrl: 'https://media.example/cover.png',
    contentType: 'image/png',
    sizeBytes: 128,
    status: 'synced',
    error: null,
    storage: {
      workspaceId: 'workspace', runId: 'run', stageId: 'image', shotId: 'cover', objectKey: 'media/cover.png',
      publicPath: '/media/cover.png', publicUrl: 'https://media.example/cover.png', accessUrl: 'https://media.example/cover.png',
      contentHash: 'sha256:cover', contentType: 'image/png', provenance: {}, response: {},
    } as unknown as UploadedMediaStorageResult,
  })
  if (uploadedCandidate?.description !== 'Uploaded media from FloatingPanel Media' || uploadedCandidate.sourceKey !== 'sha256:cover') {
    throw new Error(`expected shared FloatingPanel Media candidate projection, got ${JSON.stringify(uploadedCandidate)}`)
  }
}
export { testFloatingPanelChatComposerWiresRemoteAgenticOsGrammar, testRemoteAgenticOsGrammarHydratesSharedInvocationLookups } from './floatingPanelRemoteGrammarCommands.test'
