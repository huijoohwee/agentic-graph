import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  findAgenticOsInvocationByToken,
  type AgenticOsDictionaryInvocationKind,
} from '@/features/agentic-os/agenticOsDocInvocations'
import {
  getAgenticOsRemoteGrammarCatalogEntries,
  registerAgenticOsRemoteGrammarCatalogEntries,
  type AgenticOsRemoteGrammarCatalogEntry,
} from '@/features/agentic-os/agenticOsRemoteGrammarClient'
import { resolveChatInvocationCatalogEntries } from '@/features/chat/chatInvocationRegistry'
import {
  CAMERA_INVOCATION_BINDINGS,
  CAMERA_INVOCATION_COMMANDS,
  CAMERA_INVOCATION_SEMANTICS,
} from '@/features/strybldr/cameraMcpContract.mjs'
import {
  MOTION_CONTROL_INVOCATION_BINDINGS,
  MOTION_CONTROL_INVOCATION_COMMANDS,
  MOTION_CONTROL_INVOCATION_SEMANTICS,
} from '@/features/three/motionControlMcpContract.mjs'
import {
  XR_ANIMATION_INVOCATION_BINDINGS,
  XR_ANIMATION_INVOCATION_COMMANDS,
  XR_ANIMATION_INVOCATION_SEMANTICS,
} from '@/features/three/xrAnimationMcpContract.mjs'
import {
  XR_SCENE_INVOCATION_BINDINGS,
  XR_SCENE_INVOCATION_COMMANDS,
  XR_SCENE_INVOCATION_SEMANTICS,
} from '@/features/three/xrSceneMcpContract.mjs'
import { AGENTIC_CANVAS_OS_DOCS_KIND_FILES } from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import { buildAgenticCanvasOsDocsInvokePayload } from '../../../../mcp/agentic-canvas-os-docs-core.mjs'
import { resolveAgenticCanvasOsDocsRoot } from '../../../../mcp/agentic-canvas-os-docs-runtime.js'

type PinnedAgenticOsTokenSpec = Readonly<Record<AgenticOsDictionaryInvocationKind, readonly string[]>>
const dictionaryTokens = (dictionary: unknown): readonly string[] => (
  Object.values((dictionary || {}) as Record<string, unknown>).map(String)
)

export const PINNED_CAMERA_DICTIONARY_TOKENS: PinnedAgenticOsTokenSpec = Object.freeze({
  command: dictionaryTokens(CAMERA_INVOCATION_COMMANDS),
  semantic: dictionaryTokens(CAMERA_INVOCATION_SEMANTICS),
  binding: dictionaryTokens(CAMERA_INVOCATION_BINDINGS),
})

export const PINNED_ANIMATION_DICTIONARY_TOKENS: PinnedAgenticOsTokenSpec = Object.freeze({
  command: dictionaryTokens(XR_ANIMATION_INVOCATION_COMMANDS),
  semantic: dictionaryTokens(XR_ANIMATION_INVOCATION_SEMANTICS),
  binding: dictionaryTokens(XR_ANIMATION_INVOCATION_BINDINGS),
})

export const PINNED_MOTION_CONTROL_DICTIONARY_TOKENS: PinnedAgenticOsTokenSpec = Object.freeze({
  command: dictionaryTokens(MOTION_CONTROL_INVOCATION_COMMANDS),
  semantic: dictionaryTokens(MOTION_CONTROL_INVOCATION_SEMANTICS),
  binding: dictionaryTokens(MOTION_CONTROL_INVOCATION_BINDINGS),
})

const PINNED_XR_SCENE_DICTIONARY_TOKENS: PinnedAgenticOsTokenSpec = Object.freeze({
  command: dictionaryTokens(XR_SCENE_INVOCATION_COMMANDS),
  semantic: dictionaryTokens(XR_SCENE_INVOCATION_SEMANTICS),
  binding: dictionaryTokens(XR_SCENE_INVOCATION_BINDINGS),
})

export const RETIRED_BROWSER_DICTIONARY_FALLBACK_TOKENS: PinnedAgenticOsTokenSpec = Object.freeze({
  command: [...new Set([
    ...PINNED_CAMERA_DICTIONARY_TOKENS.command,
    ...PINNED_XR_SCENE_DICTIONARY_TOKENS.command,
    ...PINNED_ANIMATION_DICTIONARY_TOKENS.command,
    ...PINNED_MOTION_CONTROL_DICTIONARY_TOKENS.command,
  ])],
  semantic: [...new Set([
    ...PINNED_CAMERA_DICTIONARY_TOKENS.semantic,
    ...PINNED_XR_SCENE_DICTIONARY_TOKENS.semantic,
    ...PINNED_ANIMATION_DICTIONARY_TOKENS.semantic,
    ...PINNED_MOTION_CONTROL_DICTIONARY_TOKENS.semantic,
  ])],
  binding: [...new Set([
    ...PINNED_CAMERA_DICTIONARY_TOKENS.binding,
    ...PINNED_XR_SCENE_DICTIONARY_TOKENS.binding,
    ...PINNED_ANIMATION_DICTIONARY_TOKENS.binding,
    ...PINNED_MOTION_CONTROL_DICTIONARY_TOKENS.binding,
  ])],
})

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function findAncestorContaining(start: string, relativePath: string): string {
  let cursor = resolve(start)
  while (true) {
    if (existsSync(resolve(cursor, relativePath))) return cursor
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  throw new Error(`could not resolve ${relativePath} from ${start}`)
}

function resolveAgenticOsDocsRoot(repositoryRoot: string): string {
  return resolveAgenticCanvasOsDocsRoot({ rootDir: repositoryRoot, env: process.env })
}

function readPinnedSources(): Readonly<{
  revision: string
  docsContentByFileName: Readonly<Record<string, string>>
}> {
  const repositoryRoot = findAncestorContaining(process.cwd(), 'docs/runtime-readiness-contract.md')
  const contract = readFileSync(resolve(repositoryRoot, 'docs', 'runtime-readiness-contract.md'), 'utf8')
  const revision = contract.match(/docs_dependency:\s*\n[\s\S]*?^\s{2}ref:\s*"([0-9a-f]{40})"/m)?.[1] || ''
  assert(revision, 'expected runtime-readiness contract to pin one exact Agentic Canvas OS revision')
  const docsRoot = resolveAgenticOsDocsRoot(repositoryRoot)
  const siblingRevision = execFileSync('git', ['-C', resolve(docsRoot, '..'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert(siblingRevision === revision, `expected sibling Agentic Canvas OS ${revision}, got ${siblingRevision}`)
  return {
    revision,
    docsContentByFileName: Object.fromEntries([
      'FACTS.md',
      ...dictionaryTokens(AGENTIC_CANVAS_OS_DOCS_KIND_FILES),
    ].map(fileName => [fileName, readFileSync(resolve(docsRoot, fileName), 'utf8')])),
  }
}

function readPinnedCatalog() {
  const { revision, docsContentByFileName } = readPinnedSources()
  const payload = buildAgenticCanvasOsDocsInvokePayload({
    docsContentByFileName,
    sourceRevision: revision,
    limit: 500,
  }) as {
    catalog: AgenticOsRemoteGrammarCatalogEntry[]
    sourceRevision: string
    sourceRootUrl: string
  }
  assert(payload.sourceRevision === revision, `expected production catalog payload revision ${revision}`)
  assert(payload.sourceRootUrl.includes(`/blob/${revision}/docs`), `expected production catalog root to bind ${revision}`)
  return { catalog: payload.catalog, docsContentByFileName, revision }
}

export function registerPinnedAgenticOsDictionaryCatalogForTest(): string {
  const { catalog, revision } = readPinnedCatalog()
  registerAgenticOsRemoteGrammarCatalogEntries(catalog)
  return revision
}

export function assertPinnedAgenticOsCatalogMetadataWinsForTest(): void {
  const catalog = resolveChatInvocationCatalogEntries('all', '')
  for (const sourceEntry of getAgenticOsRemoteGrammarCatalogEntries()) {
    const matches = catalog.filter(entry => entry.token.toLowerCase() === sourceEntry.token.toLowerCase())
    assert(
      matches.length === 1
        && matches[0]?.kind === sourceEntry.kind
        && matches[0]?.sourcePath === (sourceEntry.sourceUrl || sourceEntry.sourcePath),
      `expected one source-backed Skills & Commands entry for ${sourceEntry.token}, got ${JSON.stringify(matches)}`,
    )
  }
}

export function registerPinnedAgenticOsDictionaryTokensForTest(spec: PinnedAgenticOsTokenSpec): string {
  const { catalog, docsContentByFileName, revision } = readPinnedCatalog()
  const catalogByToken = new Map(catalog.map(entry => [entry.token, entry]))
  const selected: AgenticOsRemoteGrammarCatalogEntry[] = []
  for (const [kind, tokens] of Object.entries(spec) as Array<[AgenticOsDictionaryInvocationKind, readonly string[]]>) {
    const fileName = AGENTIC_CANVAS_OS_DOCS_KIND_FILES[kind]
    const dictionary = docsContentByFileName[fileName] || ''
    for (const token of tokens) {
      const entry = catalogByToken.get(token)
      assert(entry?.kind === kind, `expected pinned ${fileName} catalog metadata for ${token}`)
      assert(
        dictionary.includes(`  - "${token}"`) && dictionary.includes(`| \`${token}\` |`),
        `expected pinned ${fileName} to own ${token}`,
      )
      selected.push(entry)
    }
  }
  registerAgenticOsRemoteGrammarCatalogEntries(selected)
  return revision
}

export function assertPinnedAgenticOsDictionaryTokensForTest(spec: PinnedAgenticOsTokenSpec): string {
  const revision = registerPinnedAgenticOsDictionaryTokensForTest(spec)
  for (const [kind, tokens] of Object.entries(spec) as Array<[AgenticOsDictionaryInvocationKind, readonly string[]]>) {
    for (const token of tokens) {
      const resolved = findAgenticOsInvocationByToken(token)
      assert(resolved?.kind === kind, `expected pinned ${kind} catalog metadata for ${token}`)
      assert(
        resolved.sourcePath.includes(`/blob/${revision}/docs/${AGENTIC_CANVAS_OS_DOCS_KIND_FILES[kind]}`),
        `expected exact-revision source metadata for ${token}, got ${resolved.sourcePath}`,
      )
    }
  }
  return revision
}

export function assertPinnedCameraDictionaryForTest(): void {
  assertPinnedAgenticOsDictionaryTokensForTest(PINNED_CAMERA_DICTIONARY_TOKENS)
  const catalogTokens = new Set(resolveChatInvocationCatalogEntries('all', 'camera').map(entry => entry.token))
  const missingToken = Object.values(PINNED_CAMERA_DICTIONARY_TOKENS)
    .flatMap(tokens => [...tokens])
    .find(token => !catalogTokens.has(token))
  assert(!missingToken, `expected shared Camera catalog to expose ${missingToken}`)
}
