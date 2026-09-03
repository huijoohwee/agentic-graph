import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  assertD1DocumentParity,
  assertNoD1GraphSnapshots,
  buildDirectD1ReconciliationStatements,
  buildDirectD1DocumentStatements,
  createD1ReconciliationEvidence, createD1StateSnapshotEvidence,
  parseD1ExecuteJsonRows,
  toSqlString,
} from './lib/seed-storage-documents-d1.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const agenticGraphRoot = path.resolve(__dirname, '..')
const githubRoot = path.resolve(agenticGraphRoot, '..')

const KNOWN_ARGS = new Set([
  '--docs-root',
  '--base-url',
  '--workspace-id',
  '--device-id',
  '--evidence-output', '--capture-state',
  '--dry-run',
  '--help',
])

const getArgValue = (flag) => {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  return process.argv[index + 1] || null
}

const hasFlag = (flag) => process.argv.includes(flag)

const ensureNoUnknownArgs = () => {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] || ''
    if (!token.startsWith('--')) continue
    if (!KNOWN_ARGS.has(token)) {
      throw new Error(`Unknown argument: ${token}`)
    }
    if (token !== '--dry-run' && token !== '--capture-state' && token !== '--help') i += 1
  }
}

const printHelp = () => {
  console.log(`
Seed Source Files into Cloudflare D1 through the agentic-graph storage Worker.

Usage:
  node ./scripts/seed-storage-docs-to-cloudflare.mjs [options]

Options:
  --docs-root <absolute-path>   Docs root to sync (default: ../agentic-canvas-os/docs)
  --base-url <url>              Storage API origin (default: https://airvio.co)
  --workspace-id <id>           Target workspace id (default: kgws:canonical-docs)
  --device-id <id>              Device id label (default: seed:canonical-docs)
  --evidence-output <path>      Write content-addressed D1 state evidence
  --capture-state               Read current D1 state without mutation
  --dry-run                     Print planned mutations without push
  --help                        Show this help
`.trim())
}

const normalizeString = (value) => String(value || '').trim()

const docsRoot = normalizeString(getArgValue('--docs-root'))
  || normalizeString(process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT)
  || path.resolve(githubRoot, 'agentic-canvas-os', 'docs')
const baseUrl = normalizeString(getArgValue('--base-url')) || 'https://airvio.co'
const isCanonicalProductionOrigin = new URL(baseUrl).origin === 'https://airvio.co'
const workspaceId = normalizeString(getArgValue('--workspace-id')) || 'kgws:canonical-docs'
const deviceId = normalizeString(getArgValue('--device-id')) || 'seed:canonical-docs'
const [evidenceOutput, captureState] = [normalizeString(getArgValue('--evidence-output')), hasFlag('--capture-state')]
const dryRun = hasFlag('--dry-run')

const SUPPORTED_DOCS_FILE_EXTENSIONS = new Set(['.md', '.gltf', '.glb'])
const DEFAULT_CANONICAL_DOCS_ROOT = 'agentic-canvas-os/docs'
const MAX_INLINE_DOCUMENT_CONTENT_CHARS = 48 * 1024

const contentHash = (text) => createHash('sha256').update(text).digest('hex')

const estimateTokenCount = (text) => Math.max(1, Math.ceil(String(text || '').length / 4))

const splitDocumentContentIntoChunks = (text) => {
  const markdown = String(text || '')
  if (!markdown) return []
  const chunks = []
  for (let start = 0, order = 0; start < markdown.length; start += MAX_INLINE_DOCUMENT_CONTENT_CHARS, order += 1) {
    const slice = markdown.slice(start, start + MAX_INLINE_DOCUMENT_CONTENT_CHARS)
    if (!slice) continue
    chunks.push({
      chunkOrder: order,
      chunkKey: `part-${String(order).padStart(4, '0')}`,
      markdown: slice,
    })
  }
  return chunks
}

const walkDocsSourceFiles = async (rootDir) => {
  const out = []
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.resolve(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (!entry.isFile()) continue
      if (!SUPPORTED_DOCS_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue
      out.push(absolute)
    }
  }
  await walk(rootDir)
  out.sort((a, b) => a.localeCompare(b))
  return out
}

const toPosixRel = (rootDir, filePath) =>
  path.relative(rootDir, filePath).split(path.sep).filter(Boolean).join('/')

const readDocsSourceFileContent = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.glb') {
    const bytes = await fs.readFile(filePath)
    return {
      contentMd: bytes.toString('base64'),
      contentHash: contentHash(bytes),
      docType: 'glb',
    }
  }
  const text = await fs.readFile(filePath, 'utf8')
  return {
    contentMd: String(text || ''),
    contentHash: contentHash(String(text || '')),
    docType: ext === '.gltf' ? 'gltf' : 'markdown',
  }
}

const buildDocumentSeed = async (args) => {
  const stats = await fs.stat(args.filePath)
  const fileContent = await readDocsSourceFileContent(args.filePath)
  const relPath = toPosixRel(args.docsRoot, args.filePath)
  const canonicalPath = `${DEFAULT_CANONICAL_DOCS_ROOT}/${relPath}`
  const revision = Math.max(1, Math.floor(stats.mtimeMs))
  const documentId = `docs:${contentHash(canonicalPath).slice(0, 24)}`
  const graphId = `docs-graph:${contentHash(canonicalPath).slice(0, 24)}`
  const contentText = String(fileContent.contentMd || '')
  const chunkParts =
    contentText.length > MAX_INLINE_DOCUMENT_CONTENT_CHARS
      ? splitDocumentContentIntoChunks(contentText)
      : []
  const documentMutation = {
    mutationId: `seed:${Date.now()}:${contentHash(`${canonicalPath}:${fileContent.contentHash}`).slice(0, 12)}`,
    workspaceId: args.workspaceId,
    entity: 'document',
    op: 'upsert',
    recordId: documentId,
    baseRevision: null,
    record: {
      id: documentId,
      workspaceId: args.workspaceId,
      canonicalPath,
      title: path.basename(relPath),
      docType: fileContent.docType,
      lang: null,
      graphId,
      sourceKind: 'markdown',
      contentMd: chunkParts.length > 0 ? '' : contentText,
      contentHash: fileContent.contentHash,
      parserVersion: 'seed-storage-docs-to-cloudflare:v1',
      revision,
      updatedAtMs: Math.floor(stats.mtimeMs),
      deleted: false,
    },
  }
  const chunkMutations = chunkParts.map(part => ({
    mutationId: `seed-chunk:${Date.now()}:${contentHash(`${canonicalPath}:${part.chunkKey}:${fileContent.contentHash}`).slice(0, 12)}`,
    workspaceId: args.workspaceId,
    entity: 'documentChunk',
    op: 'upsert',
    recordId: `docchunk:${contentHash(`${documentId}:${part.chunkKey}`).slice(0, 24)}`,
    baseRevision: null,
    record: {
      id: `docchunk:${contentHash(`${documentId}:${part.chunkKey}`).slice(0, 24)}`,
      documentId,
      workspaceId: args.workspaceId,
      chunkKey: part.chunkKey,
      chunkOrder: part.chunkOrder,
      heading: null,
      markdown: part.markdown,
      tokenEstimate: estimateTokenCount(part.markdown),
      contentHash: contentHash(part.markdown),
      updatedAtMs: Math.floor(stats.mtimeMs),
    },
  }))
  return {
    canonicalPath,
    documentId,
    documentMutation,
    chunkMutations,
  }
}

const buildDeleteMutation = (args) => {
  const canonicalPath = normalizeString(args.document?.canonicalPath)
  const recordId = normalizeString(args.document?.id)
  if (!canonicalPath || !recordId) return null
  const title = normalizeString(args.document?.title) || path.basename(canonicalPath)
  const updatedAtMs = Date.now()
  return {
    mutationId: `seed-delete:${updatedAtMs}:${contentHash(`${canonicalPath}:${recordId}`).slice(0, 12)}`,
    workspaceId: args.workspaceId,
    entity: 'document',
    op: 'delete',
    recordId,
    baseRevision: null,
    record: {
      id: recordId,
      workspaceId: args.workspaceId,
      canonicalPath,
      title,
      docType: normalizeString(args.document?.docType) || 'markdown',
      lang: args.document?.lang ?? null,
      graphId: args.document?.graphId ?? null,
      sourceKind: 'markdown',
      contentMd: '',
      contentHash: normalizeString(args.document?.contentHash) || contentHash(''),
      parserVersion: 'seed-storage-docs-to-cloudflare:v1',
      revision: Math.max(1, Number(args.document?.revision || 1)),
      updatedAtMs,
      deleted: true,
    },
  }
}

const buildReconciliationMutations = (args) => {
  const exportedDocuments = Array.isArray(args.exported?.documents) ? args.exported.documents : []
  const canonicalPathSet = new Set(args.mutations.map(mutation => normalizeString(mutation?.record?.canonicalPath)).filter(Boolean))
  const deletes = []
  for (const document of exportedDocuments) {
    if (document?.deleted === true) continue
    const canonicalPath = normalizeString(document?.canonicalPath)
    if (!canonicalPath || canonicalPathSet.has(canonicalPath)) continue
    const deleteMutation = buildDeleteMutation({
      workspaceId: args.workspaceId,
      document,
    })
    if (deleteMutation) deletes.push(deleteMutation)
  }
  return deletes
}

const pushMutations = async (args) => {
  const endpoint = new URL('/api/storage/push', args.baseUrl).toString()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      apiVersion: '2026-05-04',
      workspaceId: args.workspaceId,
      deviceId: args.deviceId,
      mutations: args.mutations,
    }),
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Storage push returned non-JSON response (${response.status}): ${text.slice(0, 300)}`)
  }
  if (!response.ok || !json || json.ok !== true) {
    throw new Error(`Storage push failed (${response.status}): ${JSON.stringify(json).slice(0, 400)}`)
  }
  return json
}

const exportWorkspace = async (args) => {
  const endpoint = new URL(`/api/storage/export/${encodeURIComponent(args.workspaceId)}`, args.baseUrl).toString()
  const response = await fetch(endpoint, { method: 'GET' })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Storage export returned non-JSON response (${response.status}): ${text.slice(0, 300)}`)
  }
  if (!response.ok || !json || json.ok !== true) {
    throw new Error(`Storage export failed (${response.status}): ${JSON.stringify(json).slice(0, 400)}`)
  }
  return json
}

const formatElapsedMs = (startedAt) => `${Date.now() - startedAt}ms`

const executeD1SqlFile = async (sqlText, label = 'unnamed-step') => {
  const tempDir = path.resolve(agenticGraphRoot, '.tmp')
  const fileName = `seed-storage-docs-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`
  const tempFile = path.resolve(tempDir, fileName)
  const tempFileArg = path.relative(agenticGraphRoot, tempFile) || fileName
  await fs.mkdir(tempDir, { recursive: true })
  await fs.writeFile(tempFile, sqlText, 'utf8')
  const startedAt = Date.now()
  console.log(`[agentic-graph] d1 execute start: ${label}`)
  try {
    const result = spawnSync(
      'npx',
      [
        '--no-install',
        'wrangler',
        'd1',
        'execute',
        'agentic-storage',
        '--remote',
        '--config',
        'cloudflare/workers/agentic-graph-storage/wrangler.toml',
        '--file',
        tempFileArg,
        '--json',
      ],
      {
        cwd: agenticGraphRoot,
        env: process.env,
        encoding: 'utf8',
      },
    )
    if (result.status !== 0) {
      const message = (result.stderr || result.stdout || '').trim()
      throw new Error(message || 'installed wrangler d1 execute failed')
    }
    parseD1ExecuteJsonRows(result.stdout, label)
    console.log(`[agentic-graph] d1 execute done: ${label} (${formatElapsedMs(startedAt)})`)
  } finally {
    await fs.rm(tempFile, { force: true }).catch(() => void 0)
  }
}

const executeD1JsonQuery = (sqlText, label = 'unnamed-query') => {
  const startedAt = Date.now()
  console.log(`[agentic-graph] d1 query start: ${label}`)
  const result = spawnSync(
    'npx',
    [
      '--no-install',
      'wrangler',
      'd1',
      'execute',
      'agentic-storage',
      '--remote',
      '--config',
      'cloudflare/workers/agentic-graph-storage/wrangler.toml',
      '--command',
      sqlText,
      '--json',
    ],
    {
      cwd: agenticGraphRoot,
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || '').trim()
    throw new Error(message || `installed wrangler d1 query failed: ${label}`)
  }
  const rows = parseD1ExecuteJsonRows(result.stdout, label)
  console.log(`[agentic-graph] d1 query done: ${label} rows=${rows.length} (${formatElapsedMs(startedAt)})`)
  return rows
}

const exportWorkspaceDirectlyFromD1 = (args) => {
  const documents = executeD1JsonQuery(
    [
      'SELECT',
      '  id,',
      '  canonical_path AS canonicalPath,',
      '  doc_type AS docType,',
      '  content_md AS contentMd,',
      '  content_hash AS contentHash,',
      '  revision,',
      '  deleted',
      'FROM documents',
      `WHERE workspace_id = ${toSqlString(args.workspaceId)}`,
      '  AND deleted = 0',
      'ORDER BY canonical_path, id;',
    ].join('\n'),
    'documents-readback',
  )
  const documentChunks = executeD1JsonQuery(
    [
      'SELECT',
      '  id,',
      '  document_id AS documentId,',
      '  workspace_id AS workspaceId,',
      '  chunk_key AS chunkKey,',
      '  chunk_order AS chunkOrder,',
      '  markdown,',
      '  content_hash AS contentHash',
      'FROM document_chunks',
      `WHERE workspace_id = ${toSqlString(args.workspaceId)}`,
      'ORDER BY document_id, chunk_order, chunk_key, id;',
    ].join('\n'),
    'document-chunks-readback',
  )
  const graphSnapshots = executeD1JsonQuery(
    [
      'SELECT',
      '  id,',
      '  document_id AS documentId,',
      '  graph_revision AS graphRevision,',
      '  graph_hash AS graphHash,',
      '  derived_from_document_revision AS derivedFromDocumentRevision',
      'FROM graph_snapshots',
      `WHERE workspace_id = ${toSqlString(args.workspaceId)}`,
      'ORDER BY document_id, graph_revision, id;',
    ].join('\n'),
    'graph-snapshots-readback',
  )
  return { documents, documentChunks, graphSnapshots }
}

const seedDocumentsDirectlyToD1 = async (args) => {
  const authoritativeUpdatedAtMs = Date.now()
  const nowIso = new Date(authoritativeUpdatedAtMs).toISOString()
  const statements = [
    'PRAGMA foreign_keys = ON;',
    [
      `INSERT INTO workspaces (id, slug, title, visibility, created_at, updated_at)`,
      `VALUES (${toSqlString(args.workspaceId)}, ${toSqlString(args.workspaceId)}, ${toSqlString(args.workspaceId)}, 'private', ${toSqlString(nowIso)}, ${toSqlString(nowIso)})`,
      `ON CONFLICT(id) DO UPDATE SET`,
      `slug = excluded.slug,`,
      `title = excluded.title,`,
      `updated_at = excluded.updated_at;`,
    ].join('\n'),
  ]
  for (let i = 0; i < args.documentSeeds.length; i += 1) {
    const seed = args.documentSeeds[i]
    const mutation = seed?.documentMutation
    if (!mutation || mutation.entity !== 'document' || mutation.op !== 'upsert') continue
    const record = mutation.record
    const documentStatements = buildDirectD1DocumentStatements({
      record,
      chunkMutations: seed.chunkMutations,
      authoritativeUpdatedAtMs,
    })
    console.log(`[agentic-graph] d1 document stage ${i + 1}/${args.documentSeeds.length}: ${record.canonicalPath} (chunks=${seed.chunkMutations.length})`)
    statements.push(...documentStatements)
  }
  const expectedCanonicalPaths = args.documentSeeds
    .map(seed => normalizeString(seed?.documentMutation?.record?.canonicalPath))
    .filter(Boolean)
  console.log(`[agentic-graph] d1 authoritative reconciliation active-paths=${expectedCanonicalPaths.length}`)
  const reconciliationStatements = buildDirectD1ReconciliationStatements({
    workspaceId: args.workspaceId,
    canonicalPaths: expectedCanonicalPaths,
    updatedAtMs: authoritativeUpdatedAtMs,
  })
  statements.push(...reconciliationStatements)
  await executeD1SqlFile(statements.join('\n'), 'authoritative-corpus-reconciliation')
  return statements
}

const emitEvidence = async evidence => {
  if (evidenceOutput) {
    const outputPath = path.resolve(evidenceOutput)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
}

const run = async () => {
  ensureNoUnknownArgs()
  if (hasFlag('--help')) {
    printHelp()
    return
  }
  const rootStats = await fs.stat(docsRoot).catch(() => null)
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error(`Docs root does not exist or is not a directory: ${docsRoot}`)
  }
  if (captureState) {
    if (!isCanonicalProductionOrigin) throw new Error('--capture-state is available only for the canonical production D1 control plane')
    if (!evidenceOutput) throw new Error('--capture-state requires --evidence-output')
    const evidence = createD1StateSnapshotEvidence({ workspaceId,
      exported: exportWorkspaceDirectlyFromD1({ workspaceId }), capturedAt: new Date().toISOString() })
    await emitEvidence(evidence)
    return
  }
  const docsSourceFiles = await walkDocsSourceFiles(docsRoot)
  if (docsSourceFiles.length === 0) {
    throw new Error(`No supported source files found under docs root: ${docsRoot}`)
  }
  const documentSeeds = []
  const mutations = []
  for (let i = 0; i < docsSourceFiles.length; i += 1) {
    const seed = await buildDocumentSeed({
      filePath: docsSourceFiles[i],
      docsRoot,
      workspaceId,
    })
    documentSeeds.push(seed)
    mutations.push(seed.documentMutation, ...seed.chunkMutations)
  }
  const chunkedDocuments = documentSeeds.filter(seed => seed.chunkMutations.length > 0)
  console.log(`[agentic-graph] docs-root=${docsRoot}`)
  console.log(`[agentic-graph] workspace-id=${workspaceId}`)
  console.log(`[agentic-graph] base-url=${baseUrl}`)
  console.log(`[agentic-graph] source-files=${docsSourceFiles.length}`)
  if (chunkedDocuments.length > 0) {
    console.log(`[agentic-graph] chunked-source-files=${chunkedDocuments.length}`)
  }
  if (dryRun) {
    console.log('[agentic-graph] dry-run enabled; no remote push executed')
    console.log('[agentic-graph] sample canonical paths:')
    for (const seed of documentSeeds.slice(0, 10)) {
      console.log(`  - ${seed.documentMutation.record.canonicalPath}`)
    }
    return
  }
  const shouldUseDirectD1ControlPlane = isCanonicalProductionOrigin
  if (shouldUseDirectD1ControlPlane) {
    console.warn('[agentic-graph] Canonical production reconciliation skips the public storage API and uses direct D1 reconciliation with direct readback.')
    const statements = await seedDocumentsDirectlyToD1({ workspaceId, documentSeeds })
    const exportedStartedAt = Date.now()
    console.log('[agentic-graph] export start: direct-d1-verification')
    const exported = exportWorkspaceDirectlyFromD1({ workspaceId })
    console.log(`[agentic-graph] export done: direct-d1-verification (${formatElapsedMs(exportedStartedAt)})`)
    const parity = assertD1DocumentParity({
      expectedDocumentSeeds: documentSeeds,
      exportedDocuments: exported.documents,
      exportedDocumentChunks: exported.documentChunks,
    })
    const snapshotParity = assertNoD1GraphSnapshots(exported.graphSnapshots)
    const evidence = createD1ReconciliationEvidence({ workspaceId, documentSeeds, statements,
      exported, parity, snapshotParity, reconciledAt: new Date().toISOString() })
    await emitEvidence(evidence)
    console.log(`[agentic-graph] export verification: documents=${parity.documentCount}; chunks=${parity.chunkCount}; snapshots=${snapshotParity.graphSnapshotCount}; path-hash-parity=passed; content-parity=passed`)
    console.log('[agentic-graph] direct D1 seed complete')
    return
  }

  let deleteMutations = []
  const beforeExportStartedAt = Date.now()
  console.log('[agentic-graph] export start: before-seed')
  const beforeExport = await exportWorkspace({ baseUrl, workspaceId })
  console.log(`[agentic-graph] export done: before-seed (${formatElapsedMs(beforeExportStartedAt)})`)
  deleteMutations = buildReconciliationMutations({
    exported: beforeExport,
    mutations,
    workspaceId,
  })
  if (deleteMutations.length > 0) {
    console.log(`[agentic-graph] stale-source-files=${deleteMutations.length}`)
    mutations.push(...deleteMutations)
  }
  try {
    const pushJson = await pushMutations({
      baseUrl,
      workspaceId,
      deviceId,
      mutations,
    })
    const acknowledgements = Array.isArray(pushJson.acknowledgements) ? pushJson.acknowledgements : []
    const applied = acknowledgements.filter(item => item && item.status === 'applied').length
    const conflict = acknowledgements.filter(item => item && item.status === 'conflict').length
    const rejected = acknowledgements.filter(item => item && item.status === 'rejected').length
    console.log(`[agentic-graph] push complete: applied=${applied}, conflict=${conflict}, rejected=${rejected}`)
    const exportedStartedAt = Date.now()
    console.log('[agentic-graph] export start: api-push-verification')
    const exported = await exportWorkspace({ baseUrl, workspaceId })
    console.log(`[agentic-graph] export done: api-push-verification (${formatElapsedMs(exportedStartedAt)})`)
    const parity = assertD1DocumentParity({
      expectedDocumentSeeds: documentSeeds,
      exportedDocuments: exported.documents,
      exportedDocumentChunks: exported.documentChunks,
    })
    console.log(`[agentic-graph] export verification: documents=${parity.documentCount}; chunks=${parity.chunkCount}; path-hash-parity=passed; content-parity=passed`)
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`API push failed for non-production storage origin; remote D1 fallback is forbidden: ${message}`)
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[agentic-graph] seed-storage-docs-to-cloudflare failed: ${message}`)
  process.exitCode = 1
})
