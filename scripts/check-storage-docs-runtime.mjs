#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load as loadYaml } from 'js-yaml'
import {
  buildKnowgrphAgentReadyToolContracts,
  buildKnowgrphWebMcpToolName,
  KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from '../canvas/src/features/agent-ready/knowgrphAgentReadyToolContract.mjs'
import { AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME } from '../mcp/agentic-canvas-os-docs-contract.mjs'
import {
  resolveAgenticCanvasOsDocsRoot,
  runAgenticCanvasOsDocsInvokeTool,
} from '../mcp/agentic-canvas-os-docs-runtime.js'
import { buildKnowgrphLocalMcpToolDefinitions } from '../mcp/local-tool-contract.js'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const documentPaths = Object.freeze([
  'docs/documents/knowgrph-storage-sync-document.md',
  'docs/documents/knowgrph-storage-git-file-sync-runtime-api.md',
  'docs/documents/knowgrph-storage-sync-document.companion.md',
  'docs/documents/knowgrph-storage-sync-adrs-document.md',
  'docs/documents/knowgrph-storage-schemas-extensions-document.md',
  'docs/documents/knowgrph-storage-schemas-document.md',
  'docs/documents/knowgrph-spreadsheet-storage-document.md',
  'docs/documents/knowgrph-source-files-import-document.md',
])
const requiredRuntimeOwnerPaths = Object.freeze([
  'canvas/src/features/graph-data-table/graphDataTable.ts',
  'canvas/src/features/graph-data-table/graphDataTableFilters.ts',
  'canvas/src/features/graph-data-table/graphDataTableSorts.ts',
  'canvas/src/features/panels/views/DocumentStorageSyncSettingsRows.tsx',
  'canvas/src/features/agent-ready/storageSyncWebMcpTools.ts',
  'canvas/src/features/source-files/documentStorageSyncRuntime.ts',
  'canvas/src/features/source-files/sourceFileCanonicalCloudSync.ts',
  'canvas/src/features/source-files/sourceFilesGitHubWrite.ts',
  'canvas/src/features/source-files/sourceFilesPocketBaseYjsRoom.ts',
  'canvas/src/features/workspace-fs/workspaceSeedProvider.ts',
  'canvas/src/features/workspace-table/workspaceTableSsot.ts',
  'cloudflare/workers/knowgrph-storage/index.ts',
  'cloudflare/workers/knowgrph-storage/collaborationBridge.ts',
  'cloudflare/workers/knowgrph-storage/storageRelayRuntime.ts',
  'cloudflare/workers/knowgrph-storage/storageGitRemoteAuthority.ts',
  'canvas/src/lib/storage/file-sync/engine.ts',
  'canvas/src/lib/storage/git/knowgrphGitEngine.ts',
  'canvas/src/lib/storage/knowgrphStorageBrowserRuntime.ts',
  'canvas/src/lib/storage/knowgrphStorageEnginePersistence.ts',
  'canvas/src/lib/storage/knowgrphStorageFileSyncRelay.ts',
  'canvas/src/lib/storage/knowgrphStorageGitDocumentAuthority.ts',
  'canvas/src/lib/storage/knowgrphStorageGitRelay.ts',
  'canvas/src/lib/storage/knowgrphStorageGitSaveBridge.ts',
  'grph-shared/src/collaboration/documentRepositoryAuthority.ts',
  'grph-shared/src/spreadsheet/types.ts',
  'gympgrph/src/datasets.ts',
  'gympgrph/src/GeospatialPanelHost.tsx',
])
const forbiddenStaleText = Object.freeze([
  'cloudflare/workers/knowgrph-storage/src/index.ts',
  'canvas/src/lib/storage/workspaceInitialization.ts',
  'canvas/src/lib/source-files/',
  'canvas/src/lib/workspace/github/',
  '`knowgrph-storage-sync.md`',
  '`knowgrph-source-files-import.md`',
  '`knowgrph-local-storage.md`',
  'Prod SSOT',
])
const expectedPublishedTools = Object.freeze(['search', 'fetch'])
const expectedWebMcpTools = Object.freeze([
  'knowgrph.list_source_files',
  'knowgrph.read_source_file',
])
const expectedStorageInspectTools = Object.freeze([
  'knowgrph.inspect_local_git_repository',
  'knowgrph.inspect_local_file_sync',
])
const expectedStorageControlTools = Object.freeze([
  'knowgrph.control_local_git_repository',
  'knowgrph.control_local_file_sync',
])
const expectedStorageLocalTools = Object.freeze([
  'knowgrph.git.run',
  'knowgrph.file.sync',
])

const fail = (message) => {
  throw new Error(`[storage-docs] ${message}`)
}

const readDocument = (relativePath) => {
  const absolutePath = path.join(repositoryRoot, relativePath)
  const markdown = fs.readFileSync(absolutePath, 'utf8')
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) fail(`${relativePath} must begin with YAML frontmatter`)
  const frontmatter = loadYaml(match[1])
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    fail(`${relativePath} frontmatter must parse as an object`)
  }
  return { relativePath, markdown, frontmatter }
}

const readStringArray = (value, field, relativePath) => {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || !entry.trim())) {
    fail(`${relativePath} ${field} must be a non-empty string array`)
  }
  return value
}

const assertExactArray = (actual, expected, field, relativePath) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${relativePath} ${field} must equal ${JSON.stringify(expected)}`)
  }
}

const readDictionaryEntries = (docsRoot, fileName) => {
  const markdown = fs.readFileSync(path.join(docsRoot, fileName), 'utf8')
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) fail(`${fileName} must begin with YAML frontmatter`)
  const frontmatter = loadYaml(match[1])
  return new Set(readStringArray(frontmatter?.dictionary_entries, 'dictionary_entries', fileName))
}

const invocationTokens = (value) => String(value || '')
  .split(/\s+/)
  .map(token => token.trim())
  .filter(token => token.startsWith('/') || token.startsWith('@') || token.startsWith('#'))

const agenticCanvasOsDocsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: repositoryRoot })
const dictionaryEntries = {
  '/': readDictionaryEntries(agenticCanvasOsDocsRoot, 'DICTIONARY-COMMAND.md'),
  '@': readDictionaryEntries(agenticCanvasOsDocsRoot, 'DICTIONARY-BINDING.md'),
  '#': readDictionaryEntries(agenticCanvasOsDocsRoot, 'DICTIONARY-SEMANTIC.md'),
}
const documents = documentPaths.map(readDocument)

for (const document of documents) {
  const { frontmatter, markdown, relativePath } = document
  if (frontmatter.frontmatter_contract !== 'required') fail(`${relativePath} must require frontmatter`)
  if (frontmatter.document_runtime_status !== 'runtime-ready-dev') {
    fail(`${relativePath} must declare document_runtime_status runtime-ready-dev`)
  }
  if (!String(frontmatter.runtime_scope || '').includes('MCP grammar resolution')) {
    fail(`${relativePath} must bound its document runtime scope`)
  }
  const deployBoundary = String(frontmatter.deploy_boundary || '')
  if (!deployBoundary.includes('Prod mirror') || !deployBoundary.includes('Cloudflare mutation')) {
    fail(`${relativePath} must preserve the no-deploy boundary`)
  }

  const mcp = frontmatter.mcp
  if (!mcp || typeof mcp !== 'object' || mcp.grammar_tool !== AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME) {
    fail(`${relativePath} must use the source-owned docs grammar MCP tool`)
  }
  assertExactArray(
    readStringArray(mcp.published_source_tools, 'mcp.published_source_tools', relativePath),
    expectedPublishedTools,
    'mcp.published_source_tools',
    relativePath,
  )
  assertExactArray(
    readStringArray(mcp.webmcp_source_tools, 'mcp.webmcp_source_tools', relativePath),
    expectedWebMcpTools,
    'mcp.webmcp_source_tools',
    relativePath,
  )
  if (!String(mcp.source_availability || '').includes('configured published Source Files workspace')) {
    fail(`${relativePath} must state the published-source availability boundary`)
  }

  const invocation = frontmatter.invocation
  if (!invocation || typeof invocation !== 'object') fail(`${relativePath} must declare invocation metadata`)
  const tokens = [...invocationTokens(invocation.normalize), ...invocationTokens(invocation.verify)]
  if (!tokens.some(token => token.startsWith('/'))
    || !tokens.some(token => token.startsWith('@'))
    || !tokens.some(token => token.startsWith('#'))) {
    fail(`${relativePath} invocation metadata must include /, @, and # tokens`)
  }
  for (const token of tokens) {
    if (!dictionaryEntries[token[0]]?.has(token)) {
      fail(`${relativePath} uses invocation token absent from Agentic Canvas OS: ${token}`)
    }
  }

  const lineCount = markdown.split('\n').length
  if (lineCount > 600) fail(`${relativePath} exceeds the 600-line authored-file budget`)
  for (const staleText of forbiddenStaleText) {
    if (markdown.includes(staleText)) fail(`${relativePath} retains stale reference: ${staleText}`)
  }
}

const primaryFrontmatter = documents[0].frontmatter
const sourceAuthority = primaryFrontmatter.source_authority
if (!sourceAuthority || typeof sourceAuthority !== 'object'
  || sourceAuthority.contract_root !== 'knowgrph/docs'
  || sourceAuthority.collaborative_documents_root !== 'huijoohwee/docs'
  || sourceAuthority.invocation_dictionary_root !== 'agentic-canvas-os/docs'
  || sourceAuthority.production_mirror_root !== 'huijoohwee/content/knowgrph'
  || sourceAuthority.production_mirror_editable !== false) {
  fail('primary storage document must preserve the path-scoped source authority contract')
}
for (const requiredText of [
  'Document Storage & Sync',
  'knowgrph-docs',
  'workspace-docs',
  'Offline only',
]) {
  if (!documents.some(document => document.markdown.includes(requiredText))) {
    fail(`storage documents must describe the implemented runtime contract: ${requiredText}`)
  }
}

const spreadsheet = documents.find(document => document.relativePath.includes('spreadsheet-storage'))
if (/\bRxDB\b|\brxdb\b/.test(spreadsheet?.markdown || '')) {
  fail('spreadsheet storage document must not retain the removed RxDB architecture')
}

for (const relativePath of requiredRuntimeOwnerPaths) {
  if (!fs.existsSync(path.join(repositoryRoot, relativePath))) fail(`runtime owner does not exist: ${relativePath}`)
}

const localToolByName = new Map(buildKnowgrphLocalMcpToolDefinitions().map(tool => [tool.name, tool]))
for (const toolName of [AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME, ...expectedPublishedTools]) {
  const tool = localToolByName.get(toolName)
  if (!tool || tool.annotations?.readOnlyHint !== true) {
    fail(`local MCP tool must exist and remain read-only: ${toolName}`)
  }
}
for (const toolName of expectedStorageLocalTools) {
  const tool = localToolByName.get(toolName)
  if (!tool || tool.annotations?.readOnlyHint !== false || tool.annotations?.destructiveHint !== true) {
    fail(`local storage handoff tool must exist and remain mutation-annotated: ${toolName}`)
  }
}

const webMcpToolByName = new Map(buildKnowgrphAgentReadyToolContracts({
  defaultWorkspaceId: KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
}).map(tool => [tool.webName, tool]))
for (const toolName of expectedWebMcpTools) {
  const tool = webMcpToolByName.get(toolName)
  if (!tool || tool.annotations?.readOnlyHint !== true) {
    fail(`WebMCP tool must exist and remain read-only: ${toolName}`)
  }
}
for (const toolName of expectedStorageInspectTools) {
  const tool = webMcpToolByName.get(toolName)
  if (!tool || tool.annotations?.readOnlyHint !== true || tool.annotations?.openWorldHint !== false) {
    fail(`storage inspection WebMCP tool contract drifted: ${toolName}`)
  }
}
for (const toolName of expectedStorageControlTools) {
  const tool = webMcpToolByName.get(toolName)
  if (!tool || tool.annotations?.readOnlyHint !== false || tool.annotations?.openWorldHint !== true) {
    fail(`storage control WebMCP tool contract drifted: ${toolName}`)
  }
}
if (buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles) !== expectedWebMcpTools[0]
  || buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile) !== expectedWebMcpTools[1]) {
  fail('WebMCP source tool names drifted from the shared namespace owner')
}

const uniqueTokens = new Set(documents.flatMap(document => [
  ...invocationTokens(document.frontmatter.invocation.normalize),
  ...invocationTokens(document.frontmatter.invocation.verify),
]))
for (const token of uniqueTokens) {
  const result = await runAgenticCanvasOsDocsInvokeTool({ token }, {
    rootDir: repositoryRoot,
    env: process.env,
  })
  if (result.ok !== true || result.invocation?.token !== token) {
    fail(`MCP grammar invocation failed for ${token}`)
  }
}
console.log(`[knowgrph] storage docs runtime passed (${documents.length} docs; ${uniqueTokens.size} invocation tokens; 11 MCP tools)`)
