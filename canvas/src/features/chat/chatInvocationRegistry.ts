import { AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES } from '@/features/memory/aiAgentsMemoryLayerContract.mjs'
import {
  getAgenticOsBindingInvocations,
  getAgenticOsCommandInvocations,
  getAgenticOsDocInvocations,
  getAgenticOsSemanticInvocations,
  type AgenticOsDictionaryInvocationKind,
  type AgenticOsDocInvocationId,
} from '@/features/agentic-os/agenticOsDocInvocations'
import {
  buildGenerationInvocationSystemPrompt,
  GENERATION_SPECIFICATION_INVOCATIONS,
  GENERATION_THINKING_INVOCATIONS,
  GENERATION_TOKEN_CAP_INVOCATIONS,
} from './generationInvocation'
import { CHAT_SKILL_OPTIONS } from './chatSkillRegistry'
import {
  IMAGE_TO_THREEJS_PROMPT_PRESET_ID,
  buildImageToThreeJsPromptPreset,
} from '@/features/image-to-threejs/imageToThreeJsPromptPreset'
import {
  IMAGE_TO_GLB_PROMPT_PRESET_ID,
  buildImageToGlbPromptPreset,
} from '@/features/image-to-glb/imageToGlbPromptPreset'
import {
  IMAGE_TO_THREEJS_BINDING_TOKEN,
  IMAGE_TO_THREEJS_COMMAND_TOKEN,
  IMAGE_TO_THREEJS_SEMANTIC_TOKEN,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import {
  IMAGE_TO_GLB_BINDING_TOKEN,
  IMAGE_TO_GLB_COMMAND_TOKEN,
  IMAGE_TO_GLB_SEMANTIC_TOKEN,
} from '@/features/image-to-glb/imageToGlbContract'
import {
  NATIVE_IMPORT_URL_COMMAND,
  NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
} from './nativeImportUrlInvocation'
import {
  NATIVE_CRAWLER_COMMAND,
  NATIVE_CRAWLER_INVOCATION_TEMPLATE,
} from './nativeCrawlerInvocation'
import { IMPORT_URL_AGENT_READY_MCP_TOOL_NAME } from '@/features/agent-ready/importUrlAgentReadyContract.mjs'
import type { PromptPreset } from './promptPresetCatalog'

export type ChatInvocationId =
  | 'memory.search'
  | 'memory.add'
  | 'memory.assemble'
  | 'memory.extract'
  | 'memory.user_model'
  | 'promotion.retry'
  | 'media'
  | 'agent'
  | 'mcp'
  | 'model'
  | AgenticOsDocInvocationId
  | string

export type ChatInvocationOption = {
  id: ChatInvocationId
  token: `#${string}`
  label: string
  summary: string
  keywords: readonly string[]
  toolName?: string
  sourcePath?: string
  slashCommand?: string
  atToken?: string
}

export type ChatInvocationCatalogPrefixFilter = 'all' | 'at' | 'hash' | 'slash'

export type ChatInvocationCatalogEntry = {
  id: string
  label: string
  token: string
  summary: string
  group: string
  kind: 'doc' | 'runtime' | 'skill' | AgenticOsDictionaryInvocationKind
  sourcePath?: string
  keywords: readonly string[]
  promptPresetId?: string
  insertionText?: string
  invocationModes?: PromptPreset['invocationModes']
  chatRoute?: PromptPreset['chatRoute']
  mcpTool?: string
  mcpTools?: readonly string[]
  mcpToken?: PromptPreset['mcpToken']
  semantics?: readonly string[]
  bindings?: readonly string[]
}

const PROMPT_PRESET_CATALOG_SOURCE_PATH = 'agentic-canvas-os/docs/PROMPT-PRESETS.md' as const

export const buildPromptPresetChatInvocationCatalogEntries = (
  presets: readonly PromptPreset[],
): readonly ChatInvocationCatalogEntry[] => presets.map(preset => ({
  id: `prompt-preset:${preset.id}`,
  label: preset.label,
  token: preset.slashCommand,
  summary: preset.description,
  group: 'Prompt preset',
  kind: 'skill' as const,
  sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
  keywords: [
    preset.runtimeCommand,
    preset.activation,
    ...preset.invocationModes,
    preset.chatRoute,
    preset.mcpTool,
    preset.mcpToken,
    'prompt preset',
  ],
  promptPresetId: preset.id,
  insertionText: preset.prompt,
  invocationModes: preset.invocationModes,
  chatRoute: preset.chatRoute,
  mcpTool: preset.mcpTool,
  mcpToken: preset.mcpToken,
}))

const IMAGE_TO_THREEJS_PROMPT_PRESET_COMMAND_ENTRY: ChatInvocationCatalogEntry = {
  id: `prompt-preset:${IMAGE_TO_THREEJS_PROMPT_PRESET_ID}`,
  label: 'Image to Three.js',
  token: IMAGE_TO_THREEJS_COMMAND_TOKEN,
  summary: 'Load the native image-to-threejs prompt preset into the selected Widget Card.',
  group: 'Native prompt preset',
  kind: 'skill',
  sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
  keywords: ['image', 'three.js', 'threejs', 'widget card', 'prompt preset', IMAGE_TO_THREEJS_SEMANTIC_TOKEN, IMAGE_TO_THREEJS_BINDING_TOKEN],
  promptPresetId: IMAGE_TO_THREEJS_PROMPT_PRESET_ID,
  insertionText: buildImageToThreeJsPromptPreset(),
}

const IMAGE_TO_THREEJS_BINDING_CATALOG_ENTRY: ChatInvocationCatalogEntry = {
  id: `binding:${IMAGE_TO_THREEJS_PROMPT_PRESET_ID}`,
  label: 'Image to Three.js source',
  token: IMAGE_TO_THREEJS_BINDING_TOKEN,
  summary: 'Bind the selected image source to the native image-to-threejs conversion.',
  group: 'Native prompt preset',
  kind: 'binding',
  sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
  keywords: ['image', 'three.js', 'threejs', 'source', 'widget card', IMAGE_TO_THREEJS_COMMAND_TOKEN, IMAGE_TO_THREEJS_SEMANTIC_TOKEN],
}

const IMAGE_TO_GLB_PROMPT_PRESET_COMMAND_ENTRY: ChatInvocationCatalogEntry = {
  id: `prompt-preset:${IMAGE_TO_GLB_PROMPT_PRESET_ID}`,
  label: 'Image to GLB',
  token: IMAGE_TO_GLB_COMMAND_TOKEN,
  summary: 'Load the native procedural image-to-glb prompt preset into the selected Widget Card.',
  group: 'Native prompt preset',
  kind: 'skill',
  sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
  keywords: ['image', 'glb', 'gltf', 'three.js', 'threejs', 'procedural', 'widget card', 'prompt preset', IMAGE_TO_GLB_SEMANTIC_TOKEN, IMAGE_TO_GLB_BINDING_TOKEN],
  promptPresetId: IMAGE_TO_GLB_PROMPT_PRESET_ID,
  insertionText: buildImageToGlbPromptPreset(),
}

const IMAGE_TO_GLB_BINDING_CATALOG_ENTRY: ChatInvocationCatalogEntry = {
  id: `binding:${IMAGE_TO_GLB_PROMPT_PRESET_ID}`,
  label: 'Image to GLB source',
  token: IMAGE_TO_GLB_BINDING_TOKEN,
  summary: 'Bind the selected image source to the native procedural image-to-glb conversion.',
  group: 'Native prompt preset',
  kind: 'binding',
  sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
  keywords: ['image', 'glb', 'gltf', 'three.js', 'threejs', 'procedural', 'source', 'widget card', IMAGE_TO_GLB_COMMAND_TOKEN, IMAGE_TO_GLB_SEMANTIC_TOKEN],
}

const NATIVE_IMPORT_URL_CATALOG_ENTRY: ChatInvocationCatalogEntry = {
  id: 'native:url.ingest',
  label: 'Import URL',
  token: NATIVE_IMPORT_URL_COMMAND,
  summary: 'Import an HTTP(S) URL into the active workspace and Canvas through the native Import URL owner.',
  group: 'Native workspace action',
  kind: 'skill',
  sourcePath: 'agentic-canvas-os/docs/DICTIONARY-COMMAND.md',
  keywords: ['import url', 'url ingest', '@url:', '@reference-policy', '#canvas', 'workspace', 'canvas', 'webmcp'],
  insertionText: NATIVE_IMPORT_URL_INVOCATION_TEMPLATE,
  mcpTool: IMPORT_URL_AGENT_READY_MCP_TOOL_NAME,
}

const NATIVE_CRAWLER_CATALOG_ENTRY: ChatInvocationCatalogEntry = {
  id: 'native:website.crawl',
  label: 'Crawl website headlessly',
  token: NATIVE_CRAWLER_COMMAND,
  summary: 'Crawl an approved HTTP(S) website through the native headless website importer and Canvas output owners.',
  group: 'Native workspace action',
  kind: 'skill',
  sourcePath: 'agentic-canvas-os/docs/DICTIONARY-COMMAND.md',
  keywords: ['crawl website', 'headless', '@url:', '@reference-policy', '#canvas', 'website import', 'canvas'],
  insertionText: NATIVE_CRAWLER_INVOCATION_TEMPLATE,
}

const BASE_CHAT_INVOCATION_OPTIONS: readonly ChatInvocationOption[] = [
  ...GENERATION_SPECIFICATION_INVOCATIONS.map(option => ({ id: `generation.${option.specification}`, token: option.token, label: `${option.label} specification`, summary: option.summary, keywords: ['generation', 'specification', option.specification], slashCommand: '/video-agent' })),
  ...GENERATION_THINKING_INVOCATIONS.map(option => ({ id: `generation.thinking.${option.thinkingType}`, token: option.token, label: `${option.label} thinking`, summary: option.summary, keywords: ['generation', 'thinking', option.thinkingType], slashCommand: '/video-agent' })),
  ...GENERATION_TOKEN_CAP_INVOCATIONS.map(option => ({ id: `generation.token-cap.${option.tokenCap}`, token: option.token, label: `${option.label} token cap`, summary: option.summary, keywords: ['generation', 'token', 'cap', option.tokenCap], slashCommand: '/video-agent' })),
  { id: 'memory.search', token: '#memory.search', label: 'Search memory', summary: 'Retrieve explicitly scoped memory through the configured memory MCP runtime.', keywords: ['recall', 'context', 'mem0'], toolName: AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES.search },
  { id: 'memory.add', token: '#memory.add', label: 'Add memory', summary: 'Persist explicitly scoped memory through the configured memory MCP runtime.', keywords: ['remember', 'persist', 'mem0'], toolName: AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES.add },
  { id: 'memory.assemble', token: '#memory.assemble', label: 'Assemble memory prompt', summary: 'Inject ranked memories into a bounded prompt context.', keywords: ['prompt', 'context', 'tokens'], toolName: AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES.assemblePrompt },
  { id: 'memory.extract', token: '#memory.extract', label: 'Extract procedural memory', summary: 'Promote a completed harness run into a reusable AGENTIC_OS procedural-memory document through the configured memory MCP runtime.', keywords: ['procedural', 'harness', 'replay', 'agenticOs'], toolName: AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES.extractProcedural },
  { id: 'memory.user_model', token: '#memory.user_model', label: 'Materialize user model', summary: 'Project scoped in-repo memories into a deterministic USER_MODEL markdown document and stable workspace file through the configured memory MCP runtime.', keywords: ['profile', 'user model', 'frontmatter', 'markdown'], toolName: AGENTIC_OS_MEMORY_LAYER_MCP_TOOL_NAMES.materializeUserModel },
  { id: 'promotion.retry', token: '#promotion.retry', label: 'Retry artifact promotion', summary: 'Retry GitHub/storage mirroring for an already-saved local workspace artifact without regenerating it.', keywords: ['promotion', 'mirror', 'github', 'storage', 'artifact', 'retry'] },
  { id: 'media', token: '#media', label: 'Media context', summary: 'Use media references selected from the shared FloatingPanel Media inventory.', keywords: ['image', 'audio', 'video', 'asset', 'floating panel'] },
  { id: 'agent', token: '#agent', label: 'Agent runtime', summary: 'Route the request through the selected provider-neutral agent capability.', keywords: ['ai', 'orchestration', 'vdeoxpln'] },
  { id: 'mcp', token: '#mcp', label: 'MCP runtime', summary: 'Use only tools exposed by the configured MCP runtime.', keywords: ['tools', 'server', 'protocol'] },
  { id: 'model', token: '#model', label: 'Active model', summary: 'Bind the request to the currently selected provider and model.', keywords: ['llm', 'provider', 'inference'] },
  {
    id: IMAGE_TO_THREEJS_PROMPT_PRESET_ID,
    token: IMAGE_TO_THREEJS_SEMANTIC_TOKEN,
    label: 'Image to Three.js',
    summary: 'Use the native image-to-threejs prompt preset for a selected image source.',
    keywords: ['image', 'three.js', 'threejs', 'prompt preset', 'widget card'],
    sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
    slashCommand: IMAGE_TO_THREEJS_COMMAND_TOKEN,
    atToken: IMAGE_TO_THREEJS_BINDING_TOKEN,
  },
  {
    id: IMAGE_TO_GLB_PROMPT_PRESET_ID,
    token: IMAGE_TO_GLB_SEMANTIC_TOKEN,
    label: 'Image to GLB',
    summary: 'Use the native procedural image-to-glb prompt preset for a selected image source.',
    keywords: ['image', 'glb', 'gltf', 'three.js', 'threejs', 'procedural', 'prompt preset', 'widget card'],
    sourcePath: PROMPT_PRESET_CATALOG_SOURCE_PATH,
    slashCommand: IMAGE_TO_GLB_COMMAND_TOKEN,
    atToken: IMAGE_TO_GLB_BINDING_TOKEN,
  },
] as const

export const CHAT_INVOCATION_OPTIONS: readonly ChatInvocationOption[] = [
  ...BASE_CHAT_INVOCATION_OPTIONS,
]

export const getChatInvocationOptions = (): readonly ChatInvocationOption[] => {
  const liveDocOptions = getAgenticOsDocInvocations().map(doc => ({
    id: doc.id,
    token: doc.hashToken,
    label: doc.label,
    summary: doc.summary,
    keywords: doc.keywords,
    sourcePath: doc.sourcePath,
    slashCommand: doc.slashCommand,
    atToken: doc.atToken,
  }))
  const liveSemanticOptions = getAgenticOsSemanticInvocations()
    .map(invocation => ({
      id: invocation.id as ChatInvocationId,
      token: invocation.token as `#${string}`,
      label: invocation.label,
      summary: invocation.summary,
      keywords: invocation.keywords,
      sourcePath: invocation.sourcePath,
    }))
  return [
    ...BASE_CHAT_INVOCATION_OPTIONS,
    ...liveDocOptions,
    ...liveSemanticOptions,
  ]
}

const isSourceBackedDictionaryEntry = (entry: ChatInvocationCatalogEntry): boolean => (
  ['command', 'semantic', 'binding'].includes(entry.kind)
  && /DICTIONARY-(?:COMMAND|SEMANTIC|BINDING)\.md/i.test(String(entry.sourcePath || ''))
)

const mergeCatalogEntryBehavior = (
  canonical: ChatInvocationCatalogEntry,
  behaviorSource: ChatInvocationCatalogEntry,
): ChatInvocationCatalogEntry => ({
  ...canonical,
  keywords: [...new Set([...canonical.keywords, ...behaviorSource.keywords])],
  promptPresetId: canonical.promptPresetId || behaviorSource.promptPresetId,
  insertionText: canonical.insertionText || behaviorSource.insertionText,
  invocationModes: canonical.invocationModes || behaviorSource.invocationModes,
  chatRoute: canonical.chatRoute || behaviorSource.chatRoute,
  mcpTool: canonical.mcpTool || behaviorSource.mcpTool,
  mcpTools: canonical.mcpTools || behaviorSource.mcpTools,
  mcpToken: canonical.mcpToken || behaviorSource.mcpToken,
  semantics: canonical.semantics || behaviorSource.semantics,
  bindings: canonical.bindings || behaviorSource.bindings,
})

const dedupeCatalogEntriesByToken = (entries: readonly ChatInvocationCatalogEntry[]): readonly ChatInvocationCatalogEntry[] => {
  const entriesByToken = new Map<string, ChatInvocationCatalogEntry>()
  entries.forEach(entry => {
    const token = entry.token.toLowerCase()
    const previous = entriesByToken.get(token)
    if (!previous) {
      entriesByToken.set(token, entry)
      return
    }
    if (isSourceBackedDictionaryEntry(entry)) {
      entriesByToken.set(token, mergeCatalogEntryBehavior(entry, previous))
      return
    }
    if (isSourceBackedDictionaryEntry(previous)) {
      entriesByToken.set(token, mergeCatalogEntryBehavior(previous, entry))
    }
  })
  return [...entriesByToken.values()]
}

export const resolveChatInvocationCatalogEntryInsertionText = (entry: ChatInvocationCatalogEntry): string => (
  String(entry.insertionText || entry.token || '').trim()
)

export const buildChatInvocationCatalog = (): readonly ChatInvocationCatalogEntry[] => dedupeCatalogEntriesByToken([
  ...CHAT_SKILL_OPTIONS.map(option => ({
    id: option.id,
    label: option.label,
    token: option.slashCommand,
    summary: option.summary,
    group: 'Chat skill',
    kind: 'skill' as const,
    keywords: option.keywords,
  })),
  NATIVE_IMPORT_URL_CATALOG_ENTRY,
  NATIVE_CRAWLER_CATALOG_ENTRY,
  IMAGE_TO_THREEJS_PROMPT_PRESET_COMMAND_ENTRY,
  IMAGE_TO_GLB_PROMPT_PRESET_COMMAND_ENTRY,
  ...getAgenticOsCommandInvocations().map(invocation => ({
    id: invocation.id,
    label: invocation.label,
    token: invocation.token,
    summary: invocation.summary,
    group: invocation.group,
    kind: invocation.kind,
    sourcePath: invocation.sourcePath,
    keywords: invocation.keywords,
    mcpTool: invocation.mcpTool,
    mcpTools: invocation.mcpTools,
    semantics: invocation.semantics,
    bindings: invocation.bindings,
  })),
  ...getAgenticOsDocInvocations().map(doc => ({
    id: `doc:${doc.id}:slash`,
    label: doc.label,
    token: doc.slashCommand,
    summary: doc.summary,
    group: 'Agentic OS docs',
    kind: 'doc' as const,
    sourcePath: doc.sourcePath,
    keywords: [doc.hashToken, doc.atToken, ...doc.keywords],
  })),
  ...getChatInvocationOptions().map(option => ({
    id: `hash:${option.id}`,
    label: option.label,
    token: option.token,
    summary: option.summary,
    group: option.slashCommand && option.atToken
      ? 'Agentic OS docs'
      : option.sourcePath
        ? 'Agentic OS semantic dictionary'
        : 'Runtime invocation',
    kind: option.slashCommand && option.atToken ? 'doc' as const : option.sourcePath ? 'semantic' as const : 'runtime' as const,
    sourcePath: option.sourcePath,
    keywords: [option.slashCommand || '', option.atToken || '', option.toolName || '', ...option.keywords],
  })),
  ...getAgenticOsBindingInvocations().map(invocation => ({
    id: invocation.id,
    label: invocation.label,
    token: invocation.token,
    summary: invocation.summary,
    group: invocation.group,
    kind: invocation.kind,
    sourcePath: invocation.sourcePath,
    keywords: invocation.keywords,
  })),
  IMAGE_TO_THREEJS_BINDING_CATALOG_ENTRY,
  IMAGE_TO_GLB_BINDING_CATALOG_ENTRY,
  ...getAgenticOsDocInvocations().map(doc => ({
    id: `doc:${doc.id}:at`,
    label: doc.label,
    token: doc.atToken,
    summary: doc.summary,
    group: 'Agentic OS docs',
    kind: 'doc' as const,
    sourcePath: doc.sourcePath,
    keywords: [doc.slashCommand, doc.hashToken, ...doc.keywords],
  })),
])

const matchesChatInvocationCatalogPrefix = (
  entry: ChatInvocationCatalogEntry,
  prefixFilter: ChatInvocationCatalogPrefixFilter,
): boolean => prefixFilter === 'all'
  || (prefixFilter === 'slash' && entry.token.startsWith('/'))
  || (prefixFilter === 'hash' && entry.token.startsWith('#'))
  || (prefixFilter === 'at' && entry.token.startsWith('@'))

export function resolveChatInvocationCatalogEntries(
  prefixFilter: ChatInvocationCatalogPrefixFilter,
  queryRaw: string,
): readonly ChatInvocationCatalogEntry[] {
  const query = String(queryRaw || '').trim().toLowerCase()
  const entries = buildChatInvocationCatalog().filter(entry => matchesChatInvocationCatalogPrefix(entry, prefixFilter))
  if (!query) return entries
  return entries.filter(entry => [
    entry.label,
    entry.token,
    entry.summary,
    entry.group,
    entry.kind,
    entry.sourcePath,
    ...entry.keywords,
  ].map(value => String(value || '').trim().toLowerCase()).join(' ').includes(query))
}

export const isChatInvocationToken = (token: string): boolean => (
  getChatInvocationOptions().some(option => option.token.toLowerCase() === String(token || '').toLowerCase())
)

export const parseChatInvocationDirectives = (raw: unknown): ChatInvocationOption[] => {
  const text = String(raw || '')
  const optionsByToken = new Map(getChatInvocationOptions().map(option => [option.token.toLowerCase(), option]))
  const found = new Map<ChatInvocationId, ChatInvocationOption>()
  for (const match of text.matchAll(/(^|\s)(#[A-Za-z0-9_.-]+)/g)) {
    const option = optionsByToken.get(String(match[2] || '').toLowerCase())
    if (option && !found.has(option.id)) found.set(option.id, option)
  }
  return [...found.values()]
}

export const buildChatInvocationSystemPrompt = (args: {
  userQuery: string
  chatProvider: string
  chatModel: string | null
}): string => {
  const directives = parseChatInvocationDirectives(args.userQuery)
  const generationPrompt = buildGenerationInvocationSystemPrompt(args.userQuery)
  if (directives.length === 0 && !generationPrompt) return ''
  const toolNames = directives.map(directive => directive.toolName).filter((value): value is string => !!value)
  const requestsProceduralExtract = directives.some(directive => directive.id === 'memory.extract')
  const requestsUserModel = directives.some(directive => directive.id === 'memory.user_model')
  const requestsPromotionRetry = directives.some(directive => directive.id === 'promotion.retry')
  const sourceRefs = directives
    .filter(directive => directive.sourcePath)
    .map(directive => `${directive.token}=${directive.sourcePath}`)
  return [
    'Chat invocation contract:',
    `- Directives: ${directives.map(directive => directive.token).join(', ')}`,
    `- Active provider/model: ${String(args.chatProvider || 'unknown')} / ${String(args.chatModel || 'unknown')}`,
    `- Requested MCP tools: ${toolNames.length > 0 ? toolNames.join(', ') : 'none'}`,
    sourceRefs.length > 0 ? `- Agentic OS doc sources: ${sourceRefs.join(', ')}` : '',
    '- Memory tools require an explicit user_id, agent_id, run_id, or app_id scope. Ask for missing scope instead of inventing it.',
    requestsProceduralExtract ? '- Procedural memory extraction also requires an existing output_dir rooted inside AGENTIC_OS_ROOT. Ask for the exact output_dir instead of inferring or fabricating a harness run path.' : '',
    requestsProceduralExtract ? '- When procedural extraction is requested, keep optional title, document_slug, and persist_memory fields operator-directed; do not invent document names beyond the runtime defaults.' : '',
    requestsUserModel ? '- User-model materialization writes deterministic USER_MODEL markdown from the scoped in-repo memory store and mirrors it into a stable workspace path under the local chat root by default. Ask for the exact scope if it is missing, and keep title/document_slug/workspace_path/default_local_root_path/max_memories operator-directed.' : '',
    requestsPromotionRetry ? '- Promotion retry requires one or more exact workspace artifact paths that already exist locally. Ask for the exact path instead of inferring or fabricating one.' : '',
    requestsPromotionRetry ? '- Promotion retry reuses the saved local workspace artifact as-is. Do not regenerate, rewrite, or revalidate the AGENTIC_OS body when the request is only to rerun mirroring.' : '',
    '- Media directives consume only media references present in the user message or workspace context. Preserve their source URLs and media kinds; do not invent assets.',
    '- Agentic OS doc directives bind to local source docs as reference context only; they do not authorize Prod or Cloudflare deployment.',
    '- Invoke a requested tool only when it is present in the request tool set or connected MCP runtime. Otherwise return the exact tool name and required inputs as a handoff; never claim execution.',
    '- Keep tool output provider-neutral and preserve structured MCP results for the existing response projector.',
    generationPrompt,
  ].filter(Boolean).join('\n')
}
