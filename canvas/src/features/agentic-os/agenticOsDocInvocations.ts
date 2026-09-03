import { createAgenticOsInvocationCatalogRuntime } from './agenticOsInvocationCatalogRuntime'

export type AgenticOsDocInvocationId = string

export type AgenticOsDocInvocation = {
  id: AgenticOsDocInvocationId
  fileName: string
  label: string
  summary: string
  slashCommand: `/${string}`
  hashToken: `#${string}`
  atToken: `@${string}`
  sourcePath: string
  keywords: readonly string[]
}

export type AgenticOsDictionaryInvocationKind = 'command' | 'semantic' | 'binding'

export type AgenticOsDictionaryInvocation = {
  id: string
  kind: AgenticOsDictionaryInvocationKind
  token: `/${string}` | `#${string}` | `@${string}`
  label: string
  summary: string
  group: string
  sourcePath: string
  dictionaryFileName: 'DICTIONARY-COMMAND.md' | 'DICTIONARY-SEMANTIC.md' | 'DICTIONARY-BINDING.md'
  keywords: readonly string[]
  mcpTool?: string
  mcpTools?: readonly string[]
  semantics?: readonly string[]
  bindings?: readonly string[]
}

export const AGENTIC_OS_CANVAS_INTERACTION_PANEL_KEYWORD = 'canvas interaction panel' as const
export const AGENTIC_OS_DOCS_GITHUB_ROOT_URL = 'https://github.com/huijoohwee/agentic-canvas-os/blob/main/docs'
export const AGENTIC_GRAPH_DOCS_GITHUB_ROOT_URL = 'https://github.com/huijoohwee/agentic-graph/blob/main/docs/documents'
export const AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION = {
  id: 'agentic-graph-probe-tree',
  fileName: 'agentic-graph-probe-tree-prd-tad.md',
  label: 'agentic-graph Probe-Tree',
  summary: 'Bounded local probe branching that produces user-selectable next-step cards and preserves Markdown graph state as the SSOT.',
  slashCommand: '/agentic-graph.probe-tree',
  hashToken: '#agentic-graph.probe-tree',
  atToken: '@agentic-graph.probe-tree',
  sourcePath: `${AGENTIC_GRAPH_DOCS_GITHUB_ROOT_URL}/agentic-graph-probe-tree-prd-tad.md`,
  keywords: ['probe tree', 'branching', 'clarification', 'candidate options', 'markdown graph'],
} as const satisfies AgenticOsDocInvocation

export const AGENTIC_GRAPH_GEOSPATIAL_MODE_DOC_INVOCATION = {
  id: 'agentic-graph-geospatial-mode',
  fileName: 'agentic-graph-geospatial-mode-document.md',
  label: 'agentic-graph Geospatial Mode',
  summary: 'Control the local geospatial overlay, enhanced layers, geo-node framing, and tagged layer visibility.',
  slashCommand: '/geo',
  hashToken: '#geospatial',
  atToken: '@geospatial',
  sourcePath: `${AGENTIC_GRAPH_DOCS_GITHUB_ROOT_URL}/agentic-graph-geospatial-mode-document.md`,
  keywords: ['geospatial', 'maplibre', 'extrusion', '3d asset', 'layer visibility', 'geo node'],
} as const satisfies AgenticOsDocInvocation

export const AGENTIC_OS_DOC_INVOCATIONS: readonly AgenticOsDocInvocation[] = [
  AGENTIC_GRAPH_PROBE_TREE_DOC_INVOCATION,
  AGENTIC_GRAPH_GEOSPATIAL_MODE_DOC_INVOCATION,
]

export const AGENTIC_OS_DOC_INVOCATION_ACTION_ID_PREFIX = 'agentic-os-doc:'
export const AGENTIC_OS_DICTIONARY_INVOCATION_ACTION_ID_PREFIX = 'agentic-os-invocation:'

const dictionaryFileNameByKind: Record<
  AgenticOsDictionaryInvocationKind,
  AgenticOsDictionaryInvocation['dictionaryFileName']
> = {
  command: 'DICTIONARY-COMMAND.md',
  semantic: 'DICTIONARY-SEMANTIC.md',
  binding: 'DICTIONARY-BINDING.md',
}

const dictionaryPath = (fileName: AgenticOsDictionaryInvocation['dictionaryFileName']): string => (
  `${AGENTIC_OS_DOCS_GITHUB_ROOT_URL}/${encodeURIComponent(fileName)}`
)

const sanitizeInvocationId = (token: string): string => String(token || '')
  .replace(/^[/#@]+/, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase()

const buildAgenticOsDictionaryInvocation = (args: {
  kind: AgenticOsDictionaryInvocationKind
  token: AgenticOsDictionaryInvocation['token']
  label: string
  summary: string
  group: string
  dictionaryFileName: AgenticOsDictionaryInvocation['dictionaryFileName']
  keywords: readonly string[]
  sourcePath?: string
  mcpTool?: string
  mcpTools?: readonly string[]
  semantics?: readonly string[]
  bindings?: readonly string[]
}): AgenticOsDictionaryInvocation => ({
  ...args,
  id: `${args.kind}:${sanitizeInvocationId(args.token)}`,
  sourcePath: args.sourcePath || dictionaryPath(args.dictionaryFileName),
})

const EMPTY_AGENTIC_OS_DICTIONARY_INVOCATIONS: readonly AgenticOsDictionaryInvocation[] = Object.freeze([])

export const AGENTIC_OS_COMMAND_INVOCATIONS = EMPTY_AGENTIC_OS_DICTIONARY_INVOCATIONS
export const AGENTIC_OS_SEMANTIC_INVOCATIONS = EMPTY_AGENTIC_OS_DICTIONARY_INVOCATIONS
export const AGENTIC_OS_BINDING_INVOCATIONS = EMPTY_AGENTIC_OS_DICTIONARY_INVOCATIONS
export const AGENTIC_OS_DICTIONARY_INVOCATIONS = EMPTY_AGENTIC_OS_DICTIONARY_INVOCATIONS

const invocationCatalogRuntime = createAgenticOsInvocationCatalogRuntime({
  docs: AGENTIC_OS_DOC_INVOCATIONS,
  commands: AGENTIC_OS_COMMAND_INVOCATIONS,
  semantics: AGENTIC_OS_SEMANTIC_INVOCATIONS,
  bindings: AGENTIC_OS_BINDING_INVOCATIONS,
  dictionaryActionIdPrefix: AGENTIC_OS_DICTIONARY_INVOCATION_ACTION_ID_PREFIX,
  buildDictionaryInvocation: args => buildAgenticOsDictionaryInvocation({
    ...args,
    dictionaryFileName: dictionaryFileNameByKind[args.kind],
  }),
})

export const getAgenticOsDocInvocations = invocationCatalogRuntime.getDocs
export const getAgenticOsCommandInvocations = invocationCatalogRuntime.getCommands
export const getAgenticOsSemanticInvocations = invocationCatalogRuntime.getSemantics
export const getAgenticOsBindingInvocations = invocationCatalogRuntime.getBindings
export const getAgenticOsDictionaryInvocations = invocationCatalogRuntime.getDictionary
export const getAgenticOsCanvasInteractionPanelInvocations = (): readonly AgenticOsDictionaryInvocation[] => (
  getAgenticOsDictionaryInvocations().filter(invocation => invocation.keywords.includes(AGENTIC_OS_CANVAS_INTERACTION_PANEL_KEYWORD))
)

export type AgenticOsResolvedInvocation = {
  kind: AgenticOsDictionaryInvocationKind | 'doc'
  token: string
  label: string
  summary: string
  sourcePath: string
}

export const findAgenticOsInvocationByToken = (token: string): AgenticOsResolvedInvocation | null => {
  const value = String(token || '').trim()
  return value ? invocationCatalogRuntime.findByToken(value) : null
}

export const buildAgenticOsInvocationSourceTitle = (invocation: AgenticOsResolvedInvocation): string => (
  [
    `${invocation.token} - ${invocation.label}`,
    invocation.summary,
    `Source: ${invocation.sourcePath}`,
  ].filter(Boolean).join('\n')
)

export const findAgenticOsDocInvocationByActionId = (actionId: string): AgenticOsDocInvocation | null => {
  const id = String(actionId || '').startsWith(AGENTIC_OS_DOC_INVOCATION_ACTION_ID_PREFIX)
    ? String(actionId).slice(AGENTIC_OS_DOC_INVOCATION_ACTION_ID_PREFIX.length)
    : ''
  return getAgenticOsDocInvocations().find(doc => doc.id === id) || null
}

export const buildAgenticOsDocActionId = (doc: AgenticOsDocInvocation): string => (
  `${AGENTIC_OS_DOC_INVOCATION_ACTION_ID_PREFIX}${doc.id}`
)

export const buildAgenticOsDictionaryActionId = (invocation: AgenticOsDictionaryInvocation): string => (
  `${AGENTIC_OS_DICTIONARY_INVOCATION_ACTION_ID_PREFIX}${invocation.id}`
)

export const findAgenticOsDictionaryInvocationByActionId = (actionId: string): AgenticOsDictionaryInvocation | null => (
  invocationCatalogRuntime.findDictionaryByActionId(String(actionId || ''))
)

export const buildAgenticOsDocInvocationMarkdown = (doc: AgenticOsDocInvocation): string => doc.slashCommand
export const buildAgenticOsDocSemanticInvocationMarkdown = (doc: AgenticOsDocInvocation): string => doc.hashToken
export const buildAgenticOsDocBindingInvocationMarkdown = (doc: AgenticOsDocInvocation): string => doc.atToken
export const buildAgenticOsDictionaryInvocationMarkdown = (invocation: AgenticOsDictionaryInvocation): string => invocation.token
