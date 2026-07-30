import { getAgenticOsRemoteGrammarCatalogSnapshot } from './agenticOsRemoteGrammarClient'
import type {
  AgenticOsDictionaryInvocation,
  AgenticOsDictionaryInvocationKind,
  AgenticOsDocInvocation,
} from './agenticOsDocInvocations'

type ResolvedInvocation = {
  kind: AgenticOsDictionaryInvocationKind | 'doc'
  token: string
  label: string
  summary: string
  sourcePath: string
}

type CatalogRuntimeOptions = {
  docs: readonly AgenticOsDocInvocation[]
  commands: readonly AgenticOsDictionaryInvocation[]
  semantics: readonly AgenticOsDictionaryInvocation[]
  bindings: readonly AgenticOsDictionaryInvocation[]
  dictionaryActionIdPrefix: string
  buildDictionaryInvocation: (args: {
    kind: AgenticOsDictionaryInvocationKind
    token: AgenticOsDictionaryInvocation['token']
    label: string
    summary: string
    group: string
    dictionaryFileName: AgenticOsDictionaryInvocation['dictionaryFileName']
    keywords: readonly string[]
    mcpTool?: string
    mcpTools?: readonly string[]
    semantics?: readonly string[]
    bindings?: readonly string[]
  }) => AgenticOsDictionaryInvocation
}

const dictionaryFileNameByKind: Record<AgenticOsDictionaryInvocationKind, AgenticOsDictionaryInvocation['dictionaryFileName']> = {
  command: 'DICTIONARY-COMMAND.md',
  semantic: 'DICTIONARY-SEMANTIC.md',
  binding: 'DICTIONARY-BINDING.md',
}

export function createAgenticOsInvocationCatalogRuntime(options: CatalogRuntimeOptions) {
  let snapshotVersion = -1
  let commands = options.commands
  let semantics = options.semantics
  let bindings = options.bindings
  let dictionary = [...commands, ...semantics, ...bindings]
  let resolvedByToken = new Map<string, ResolvedInvocation>()
  let dictionaryByActionId = new Map<string, AgenticOsDictionaryInvocation>()

  const merge = (fallback: readonly AgenticOsDictionaryInvocation[], kind: AgenticOsDictionaryInvocationKind) => {
    const fallbackByToken = new Map(fallback.map(invocation => [invocation.token.toLowerCase(), invocation]))
    const mergedByToken = new Map(fallbackByToken)
    for (const entry of getAgenticOsRemoteGrammarCatalogSnapshot().entries) {
      if (entry.kind !== kind) continue
      const token = String(entry.token || '').trim() as AgenticOsDictionaryInvocation['token']
      if (!token) continue
      const fallbackInvocation = fallbackByToken.get(token.toLowerCase())
      const merged = options.buildDictionaryInvocation({
        kind,
        token: fallbackInvocation?.token || token,
        label: entry.label || fallbackInvocation?.label || token,
        summary: entry.summary || fallbackInvocation?.summary || '',
        group: fallbackInvocation?.group || `Agentic OS ${kind} dictionary`,
        dictionaryFileName: dictionaryFileNameByKind[kind],
        keywords: [...new Set([
          ...(fallbackInvocation?.keywords || []),
          ...(entry.keywords || []),
          entry.sourceUrl || '',
          entry.sourcePath || '',
        ].filter(Boolean))],
        mcpTool: entry.mcpTool || fallbackInvocation?.mcpTool,
        mcpTools: entry.mcpTools?.length ? entry.mcpTools : fallbackInvocation?.mcpTools,
        semantics: entry.semantics?.length ? entry.semantics : fallbackInvocation?.semantics,
        bindings: entry.bindings?.length ? entry.bindings : fallbackInvocation?.bindings,
      })
      mergedByToken.set(token.toLowerCase(), {
        ...merged,
        sourcePath: entry.sourceUrl || entry.sourcePath || fallbackInvocation?.sourcePath || merged.sourcePath,
      })
    }
    return [
      ...fallback.map(invocation => mergedByToken.get(invocation.token.toLowerCase()) || invocation),
      ...[...mergedByToken.values()]
        .filter(invocation => !fallbackByToken.has(invocation.token.toLowerCase()))
        .sort((left, right) => left.token.localeCompare(right.token)),
    ]
  }

  const ensure = () => {
    const snapshot = getAgenticOsRemoteGrammarCatalogSnapshot()
    if (snapshot.version === snapshotVersion) return
    snapshotVersion = snapshot.version
    commands = merge(options.commands, 'command')
    semantics = merge(options.semantics, 'semantic')
    bindings = merge(options.bindings, 'binding')
    dictionary = [...commands, ...semantics, ...bindings]
    resolvedByToken = new Map()
    dictionaryByActionId = new Map()
    options.docs.forEach(doc => {
      const resolved = { kind: 'doc' as const, label: doc.label, summary: doc.summary, sourcePath: doc.sourcePath }
      resolvedByToken.set(doc.slashCommand.toLowerCase(), { ...resolved, token: doc.slashCommand })
      resolvedByToken.set(doc.hashToken.toLowerCase(), { ...resolved, token: doc.hashToken })
      resolvedByToken.set(doc.atToken.toLowerCase(), { ...resolved, token: doc.atToken })
    })
    dictionary.forEach(invocation => {
      resolvedByToken.set(invocation.token.toLowerCase(), {
        kind: invocation.kind,
        token: invocation.token,
        label: invocation.label,
        summary: invocation.summary,
        sourcePath: invocation.sourcePath,
      })
      dictionaryByActionId.set(`${options.dictionaryActionIdPrefix}${invocation.id}`, invocation)
    })
  }

  return {
    getDocs: () => options.docs,
    getCommands: () => (ensure(), commands),
    getSemantics: () => (ensure(), semantics),
    getBindings: () => (ensure(), bindings),
    getDictionary: () => (ensure(), dictionary),
    findByToken: (token: string) => (ensure(), resolvedByToken.get(token.toLowerCase()) || null),
    findDictionaryByActionId: (actionId: string) => (ensure(), dictionaryByActionId.get(actionId) || null),
  }
}
