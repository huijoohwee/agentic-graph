import fs from 'node:fs'
import path from 'node:path'
import { SOURCE_FILES_FORMATS } from '@/lib/config-copy/importExportCopy'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildCorpusQueryEvidencePack } from '@/features/queryable-corpus/queryEvidencePack'
import { everyCorpusEdgeHasEvidence, isCorpusSourceUnitMarkdown } from '@/features/queryable-corpus/corpusGraph'
import { importWorkspaceLocalFiles, importWorkspaceLocalFolder } from '@/features/markdown-workspace/workspaceImport/localImport'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildChatSubmitRequestContext } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { composeGraphFromSourceLayers } from '@/lib/graph/sourceLayers'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function readQueryableCorpusPrdTad(): string {
  const cwd = process.cwd()
  const repoRoot = path.basename(cwd) === 'canvas' ? path.resolve(cwd, '..') : cwd
  return fs.readFileSync(path.join(repoRoot, 'docs/documents/knowgrph-query-prd-tad.md'), 'utf8')
}

function createMemoryWorkspaceFs(): WorkspaceFs & { readAll: () => WorkspaceEntry[] } {
  const entries = new Map<string, WorkspaceEntry>()
  const now = () => 1
  const normalize = (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
  const fs: WorkspaceFs & { readAll: () => WorkspaceEntry[] } = {
    ensureSeed: async () => false,
    listEntries: async () => Array.from(entries.values()),
    readFileText: async (path: WorkspacePath) => entries.get(normalize(path))?.text ?? null,
    writeFileText: async (path: WorkspacePath, text: string) => {
      const normalized = normalize(path)
      const existing = entries.get(normalized)
      entries.set(normalized, {
        path: normalized,
        parentPath: existing?.parentPath ?? '/',
        kind: 'file',
        name: existing?.name ?? (normalized.split('/').pop() || 'file'),
        text,
        updatedAtMs: now(),
      })
    },
    createFile: async ({ parentPath, name, text }) => {
      const normalized = normalize(`${parentPath}/${name}`)
      entries.set(normalized, {
        path: normalized,
        parentPath,
        kind: 'file',
        name,
        text,
        updatedAtMs: now(),
      })
      return normalized
    },
    createFolder: async ({ parentPath, name }) => {
      const normalized = normalize(`${parentPath}/${name}`)
      entries.set(normalized, {
        path: normalized,
        parentPath,
        kind: 'folder',
        name,
        updatedAtMs: now(),
      })
      return normalized
    },
    deleteEntry: async path => {
      entries.delete(normalize(path))
    },
    readAll: () => Array.from(entries.values()),
  }
  return fs
}

function buildSubmitArgsFixture(overrides: Partial<FloatingPanelChatSubmitArgs> = {}): FloatingPanelChatSubmitArgs {
  return {
    historyKey: 'history',
    graphData: null,
    currentNode: null,
    markdownText: null,
    markdownDocumentName: null,
    sourceFiles: [],
    workspaceContextCacheKey: 'workspace-cache',
    chatProvider: 'openai',
    chatAuthMode: 'serverManaged',
    chatApiKey: null,
    chatEndpointUrl: 'https://chat.example.test/v1/chat/completions',
    chatModel: 'gpt-4.1-mini',
    chatTemperature: 0.2,
    chatMaxCompletionTokens: 512,
    chatServiceTier: null,
    chatStream: true,
    chatMessagesJson: null,
    chatReasoningEffort: null,
    chatThinkingType: null,
    chatThinkingJson: null,
    chatFrequencyPenalty: null,
    chatPresencePenalty: null,
    chatTopP: null,
    chatLogprobs: null,
    chatTopLogprobs: null,
    chatParallelToolCalls: null,
    chatStopJson: null,
    chatStreamOptionsJson: null,
    chatResponseFormatJson: null,
    chatLogitBiasJson: null,
    chatToolsJson: null,
    chatToolChoiceJson: null,
    chatGraphSummaryMaxTokens: null,
    chatGuidelineDigestMaxTokens: null,
    chatSystemPrompt: null,
    chatContextScope: 'workspace',
    chatStorageTarget: 'chatHistory',
    chatLocalStorageRootPath: '/workspace/chat',
    chatKnowgrphWorkspacePath: null,
    setChatKnowgrphWorkspacePath: () => {},
    chatProviderSummary: 'openai:gpt-4.1-mini',
    setChatModel: () => {},
    messages: [],
    setMessages: () => {},
    input: '',
    setInput: () => {},
    isLoading: false,
    setIsLoading: () => {},
    setErrorText: () => {},
    setConnectivity: () => {},
    setConnectivityDetail: () => {},
    setStreamingAssistant: () => {},
    setStreamingInsights: () => {},
    setStreamingWorkspacePath: () => {},
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
    followWorkspaceMarkdownPath: () => {},
    finalizeAssistantSuccess: async () => {},
    pushChatExchangeLog: () => {},
    persistChatExchangeLog: async () => {},
    ...overrides,
  }
}

export function testQueryableCorpusImportFormatsCoverPrdPhaseOneFamilies() {
  const imports = new Set(SOURCE_FILES_FORMATS.import.map(ext => ext.toLowerCase()))
  for (const ext of ['.ts', '.tsx', '.js', '.sql', '.toml', '.tf', '.dockerfile', '.r', '.sh', '.png', '.jpg', '.mp4']) {
    assert(imports.has(ext), `expected import formats to include ${ext}`)
  }
  const localText = new Set(SOURCE_FILES_FORMATS.importLocalText.map(ext => ext.toLowerCase()))
  assert(localText.has('.sql') && localText.has('.sh') && localText.has('.ts') && localText.has('.toml'), 'expected code/schema/script/config files to import as text')
  assert(!localText.has('.png') && !localText.has('.mp4'), 'expected binary media to use metadata source units instead of text import')
}

export function testQueryableCorpusPrdTadNamesImplementedOwners() {
  const doc = readQueryableCorpusPrdTad()
  const required = [
    'status: "implemented-finetune-contract"',
    '`sourceFilesCorpusManifest.ts`, `WorkspaceImportResult.corpusManifest`',
    '`parserSpecs.ts`, `corpusGraph.ts`, `corpusConfigGraph.ts`',
    '`queryEvidencePack.ts`',
    '`floatingPanelChatSubmitRequest.ts`, existing FloatingPanel Chat submit coordinator',
    'queryableCorpus.e2e.importSourceFilesCanvasChatReadiness',
  ]
  for (const token of required) {
    assert(doc.includes(token), `expected query PRD/TAD to include implemented owner token ${JSON.stringify(token)}`)
  }
  const stale = [
    'Proposed `sourceFilesCorpusManifest.ts`',
    'Proposed `queryGraphPlanner.ts`',
    'Proposed `queryGraphEvidencePack.ts`',
    'proposed fragment cache',
    'proposed query log',
    '**Status**: Proposed',
  ]
  for (const token of stale) {
    assert(!doc.includes(token), `expected query PRD/TAD to remove stale proposed owner token ${JSON.stringify(token)}`)
  }
}

export async function testQueryableCorpusParsersEmitEvidenceForCodeSqlAndScripts() {
  const sql = await loadGraphDataFromTextViaParser('schema.sql', [
    'create table users (',
    '  id integer primary key,',
    '  org_id integer references organizations(id)',
    ');',
  ].join('\n'), { applyToStore: false })
  assert(sql?.parserId === 'corpus-sql', `expected corpus-sql parser, got ${sql?.parserId}`)
  assert((sql.graphData?.nodes || []).some(node => node.type === 'CorpusSqlTable'), 'expected SQL table node')
  assert(everyCorpusEdgeHasEvidence(sql.graphData), 'expected SQL edges to carry evidence fields')

  const code = await loadGraphDataFromTextViaParser('app.ts', [
    "import { db } from './db'",
    'export function loadUser(id: string) {',
    '  return db.user.findUnique({ where: { id } })',
    '}',
  ].join('\n'), { applyToStore: false })
  assert(code?.parserId === 'corpus-code', `expected corpus-code parser, got ${code?.parserId}`)
  assert((code.graphData?.edges || []).some(edge => edge.label === 'imports'), 'expected code import edge')
  assert(everyCorpusEdgeHasEvidence(code.graphData), 'expected code edges to carry evidence fields')

  const script = await loadGraphDataFromTextViaParser('deploy.sh', [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'npm run pages:build-sync',
    'npx wrangler pages deploy dist',
  ].join('\n'), { applyToStore: false })
  assert(script?.parserId === 'corpus-script', `expected corpus-script parser, got ${script?.parserId}`)
  assert((script.graphData?.edges || []).some(edge => edge.label === 'usesCommandOrEnv'), 'expected script command edge')
  assert(everyCorpusEdgeHasEvidence(script.graphData), 'expected script edges to carry evidence fields')

  const config = await loadGraphDataFromTextViaParser('wrangler.toml', [
    'name = "demo-worker"',
    'route = "example.com/*"',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "demo-db"',
  ].join('\n'), { applyToStore: false })
  assert(config?.parserId === 'corpus-config', `expected corpus-config parser, got ${config?.parserId}`)
  assert((config.graphData?.nodes || []).some(node => node.type === 'CorpusConfigService'), 'expected config service node')
  assert((config.graphData?.nodes || []).some(node => node.type === 'CorpusConfigBinding'), 'expected config binding node')
  assert(everyCorpusEdgeHasEvidence(config.graphData), 'expected config edges to carry evidence fields')
}

export async function testQueryableCorpusMediaImportCreatesMetadataSourceUnit() {
  const fs = createMemoryWorkspaceFs()
  const imageFile = {
    name: 'diagram.png',
    type: 'image/png',
    size: 42,
    text: async () => 'binary should not be read',
  } as unknown as File
  const result = await importWorkspaceLocalFiles({ fs, files: [imageFile] })
  assert(result.createdPaths.length === 1, 'expected one created media metadata document')
  const created = fs.readAll().find(entry => entry.kind === 'file')
  assert(created, 'expected media metadata workspace file')
  assert(created.name === 'diagram.png.source.md', `expected metadata markdown filename, got ${created.name}`)
  assert(isCorpusSourceUnitMarkdown(String(created.text || '')), 'expected media import to create corpus source-unit frontmatter')

  const parsed = await loadGraphDataFromTextViaParser(created.name, String(created.text || ''), { applyToStore: false })
  assert(parsed?.parserId === 'corpus-source-unit', `expected corpus-source-unit parser, got ${parsed?.parserId}`)
  assert((parsed.graphData?.nodes || []).some(node => String(node.properties?.['corpus:mediaKind'] || '') === 'image'), 'expected image media kind node')
  assert(everyCorpusEdgeHasEvidence(parsed.graphData), 'expected media metadata edges to carry evidence fields')
}

export async function testQueryableCorpusImportManifestAndCacheReuse() {
  const fs = createMemoryWorkspaceFs()
  const file = {
    name: 'worker.ts',
    type: 'text/typescript',
    size: 33,
    text: async () => 'export function handle() { return 1 }',
  } as unknown as File
  const first = await importWorkspaceLocalFiles({ fs, files: [file] })
  assert(first.corpusManifest?.sourceUnits.length === 1, 'expected file import to emit one corpus source unit')
  assert(first.corpusManifest.sourceUnits[0]?.status === 'parsed', 'expected first file import source unit to be parsed')

  const second = await importWorkspaceLocalFiles({ fs, files: [file] })
  assert(second.createdPaths[0] === first.createdPaths[0], 'expected unchanged file re-import to reuse the existing workspace path')
  assert(second.corpusManifest?.metrics.cacheHits === 1, 'expected unchanged file re-import to report one cache hit')
  assert(second.corpusManifest.sourceUnits[0]?.status === 'cached', 'expected unchanged file source unit to be cached')

  const folderFile = {
    name: 'schema.sql',
    type: 'text/plain',
    size: 61,
    webkitRelativePath: 'demo/db/schema.sql',
    text: async () => 'create table users (id integer primary key);',
  } as unknown as File
  const folderFirst = await importWorkspaceLocalFolder({ fs, files: [folderFile] })
  assert(folderFirst.corpusManifest?.sourceUnits[0]?.relativePath === 'demo/db/schema.sql', 'expected folder import source unit to preserve relative path')
  assert(folderFirst.corpusManifest.sourceUnits[0]?.status === 'parsed', 'expected folder text source unit to be immediately parsed, not pending')
  assert(String((await fs.readFileText('/demo/db/schema.sql')) || '').includes('create table users'), 'expected folder import to persist source text for query-ready parsing')
  const folderSecond = await importWorkspaceLocalFolder({ fs, files: [folderFile] })
  assert(folderSecond.corpusManifest?.metrics.cacheHits === 1, 'expected unchanged folder re-import to report cache hit')
  assert(folderSecond.corpusManifest.sourceUnits[0]?.status === 'cached', 'expected unchanged folder source unit to be cached')
}

export async function testQueryableCorpusCompositionInfersCrossSourceReferencesWithEvidence() {
  const sql = await loadGraphDataFromTextViaParser('schema.sql', [
    'create table users (id integer primary key);',
  ].join('\n'), { applyToStore: false })
  const code = await loadGraphDataFromTextViaParser('repository.ts', [
    'export function loadUsers() {',
    '  return db.users.findMany()',
    '}',
  ].join('\n'), { applyToStore: false })
  const composed = composeGraphFromSourceLayers({
    layers: [
      { id: 'code', name: 'repository.ts', enabled: true, parsedGraphData: code?.graphData },
      { id: 'schema', name: 'schema.sql', enabled: true, parsedGraphData: sql?.graphData },
    ],
  }).graphData
  const crossEdge = (composed.edges || []).find(edge => edge.label === 'referencesCorpusEntity')
  assert(crossEdge, 'expected composed corpus graph to infer observable cross-source reference')
  assert(String(crossEdge.properties?.['evidence:kind'] || '') === 'inferred', 'expected cross-source reference to declare inferred evidence kind')
  assert(everyCorpusEdgeHasEvidence(composed), 'expected composed corpus edges to retain evidence fields')

  const pathPack = buildCorpusQueryEvidencePack({
    graphData: composed,
    query: 'what connects repository.ts to schema.sql?',
  })
  assert(pathPack.intent === 'path', `expected path intent for explicit connection query, got ${pathPack.intent}`)
  assert(pathPack.traversal.edgeIds.includes(String(crossEdge.id)), 'expected path query traversal to include the inferred cross-source evidence edge')
  assert(pathPack.sourceRefs.some(ref => ref.sourcePath.includes('repository.ts')), 'expected path query to cite the code source evidence')
}

export async function testQueryableCorpusEvidencePackFeedsChatRequestContext() {
  const parsed = await loadGraphDataFromTextViaParser('schema.sql', [
    'create table accounts (id integer primary key);',
    'create table users (id integer primary key, account_id integer references accounts(id));',
  ].join('\n'), { applyToStore: false })
  const pack = buildCorpusQueryEvidencePack({
    graphData: parsed?.graphData,
    query: 'what connects users to accounts?',
  })
  assert(pack.intent === 'path', `expected path intent, got ${pack.intent}`)
  assert(pack.sourceRefs.length > 0, 'expected evidence pack source refs')
  assert(pack.budget.estimatedPromptTokens <= pack.budget.maxPromptTokens, 'expected evidence pack to stay within prompt budget')
  assert(pack.costLog.prompt_tokens === pack.budget.estimatedPromptTokens, 'expected query cost log to mirror evidence prompt token estimate')
  assert(typeof pack.costLog.estimated_cost_usd === 'number', 'expected query cost log to expose numeric estimated cost')

  const requestContext = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ graphData: parsed?.graphData || null }),
    nextMessages: [{ id: 'user-1', role: 'user', content: 'what connects users to accounts?' }],
    assistantMessageId: 'assistant-1',
  })
  const evidenceSystemMessage = requestContext.systemMessages.find(message => message.content.includes('queryableCorpusEvidencePack()'))
  assert(evidenceSystemMessage, 'expected chat request context to include corpus evidence pack system message')
  assert(evidenceSystemMessage.content.includes('"sourceRefs"'), 'expected chat evidence prompt to include source refs')
  assert(evidenceSystemMessage.content.includes('"costLog"'), 'expected chat evidence prompt to include query cost log')
  assert(evidenceSystemMessage.content.includes('"estimated_cost_usd"'), 'expected chat evidence prompt to include estimated cost field')
}

export async function testQueryableCorpusImportAppliesToSourceFilesCanvasAndChatReadiness() {
  const fs = createMemoryWorkspaceFs()
  const codeFile = {
    name: 'repository.ts',
    type: 'text/typescript',
    size: 79,
    webkitRelativePath: 'demo/src/repository.ts',
    text: async () => [
      'export function loadUsers() {',
      '  return db.users.findMany()',
      '}',
    ].join('\n'),
  } as unknown as File
  const sqlFile = {
    name: 'schema.sql',
    type: 'text/plain',
    size: 43,
    webkitRelativePath: 'demo/db/schema.sql',
    text: async () => 'create table users (id integer primary key);',
  } as unknown as File

  const result = await importWorkspaceLocalFolder({ fs, files: [codeFile, sqlFile] })
  assert(result.createdPaths.length === 2, 'expected folder import to create both workspace artifacts')
  assert(result.corpusManifest?.sourceUnits.every(unit => unit.status === 'parsed'), 'expected folder corpus source units to be parsed')

  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  try {
    store.setSourceFiles([])
    const sourcesByPath = result.sources.reduce<WorkspaceSourceIndex>((acc, item) => {
      acc[item.path] = item.source
      return acc
    }, {})
    const applied = await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: {
        applyToGraph: true,
        workspaceEntries: await fs.listEntries(),
        sourcesByPath,
      },
    })
    assert(applied.sourceFilesUpdated, 'expected import apply to update Source Files')
    assert(applied.parsedCount === 2, `expected both corpus Source Files to parse, got ${applied.parsedCount}`)

    const imported = (useGraphStore.getState().sourceFiles || []).filter(file =>
      result.createdPaths.some(path => String(file.source?.path || '') === `workspace:${path}`),
    )
    assert(imported.length === 2, `expected two imported Source Files, got ${imported.length}`)
    assert(imported.every(file => file.enabled && file.status === 'parsed' && file.parsedGraphData), 'expected imported Source Files to be enabled and parsed')

    const graphData = composeGraphFromSourceLayers({
      layers: imported.map(file => ({
        id: file.id,
        name: file.name,
        enabled: file.enabled,
        text: file.text,
        parsedTextHash: file.parsedTextHash,
        parsedGraphData: file.parsedGraphData,
      })),
    }).graphData
    assert((graphData.nodes || []).length > 0, 'expected composed corpus graph nodes for Canvas readiness')
    assert((graphData.edges || []).length > 0, 'expected composed corpus graph edges for Canvas readiness')
    assert(everyCorpusEdgeHasEvidence(graphData), 'expected composed Canvas graph edges to retain corpus evidence')

    const requestContext = await buildChatSubmitRequestContext({
      submitArgs: buildSubmitArgsFixture({ graphData }),
      nextMessages: [{ id: 'user-1', role: 'user', content: 'what connects repository to users?' }],
      assistantMessageId: 'assistant-1',
    })
    const evidenceSystemMessage = requestContext.systemMessages.find(message => message.content.includes('queryableCorpusEvidencePack()'))
    assert(evidenceSystemMessage?.content.includes('repository.ts'), 'expected chat readiness evidence to include imported source path')
    assert(evidenceSystemMessage?.content.includes('schema.sql'), 'expected chat readiness evidence to include schema source path')
    assert(evidenceSystemMessage?.content.includes('"costLog"'), 'expected chat readiness evidence to include query cost log')
  } finally {
    store.setSourceFiles(previousSourceFiles)
  }
}
