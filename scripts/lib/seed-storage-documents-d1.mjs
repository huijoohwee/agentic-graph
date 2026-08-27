import { createHash } from 'node:crypto'

const D1_RECONCILIATION_EVIDENCE_SCHEMA = 'agenticgraph-d1-reconciliation-evidence/v1'
const D1_STATE_SNAPSHOT_SCHEMA = 'agenticgraph-d1-state-snapshot/v1'
const D1_OPERATION_LIMIT = 10_000

export const toSqlString = (value) => `'${String(value || '').replace(/'/g, "''")}'`

export const toSqlNullableString = (value) => {
  if (value == null) return 'NULL'
  return toSqlString(value)
}

const normalizeString = (value) => String(value || '').trim()

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const digest = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : canonicalJson(value),
).digest('hex')

const toIsoTimestamp = (value) => new Date(Math.max(1, Number(value || Date.now()))).toISOString()

export const buildDirectD1DocumentStatements = ({ record, chunkMutations, authoritativeUpdatedAtMs }) => {
  const updatedAtIso = toIsoTimestamp(authoritativeUpdatedAtMs || record.updatedAtMs)
  const documentIdentitySql = [
    'SELECT id FROM documents',
    `WHERE workspace_id = ${toSqlString(record.workspaceId)}`,
    `  AND canonical_path = ${toSqlString(record.canonicalPath)}`,
    'LIMIT 1',
  ].join('\n')
  const statements = [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO documents (`,
    `  id, workspace_id, canonical_path, title, doc_type, lang, graph_id, source_kind,`,
    `  content_md, content_hash, parser_version, revision, deleted, created_at, updated_at`,
    `) VALUES (`,
    `  ${toSqlString(record.id)},`,
    `  ${toSqlString(record.workspaceId)},`,
    `  ${toSqlString(record.canonicalPath)},`,
    `  ${toSqlNullableString(record.title)},`,
    `  ${toSqlNullableString(record.docType)},`,
    `  ${toSqlNullableString(record.lang)},`,
    `  ${toSqlNullableString(record.graphId)},`,
    `  ${toSqlString(record.sourceKind)},`,
    `  ${toSqlString(record.contentMd)},`,
    `  ${toSqlString(record.contentHash)},`,
    `  ${toSqlString(record.parserVersion)},`,
    `  ${Math.max(1, Number(record.revision || 1))},`,
    `  ${record.deleted ? 1 : 0},`,
    `  ${toSqlString(updatedAtIso)},`,
    `  ${toSqlString(updatedAtIso)}`,
    `)`,
    `ON CONFLICT(workspace_id, canonical_path) DO UPDATE SET`,
    `  title = excluded.title,`,
    `  doc_type = excluded.doc_type,`,
    `  lang = excluded.lang,`,
    `  graph_id = excluded.graph_id,`,
    `  source_kind = excluded.source_kind,`,
    `  content_md = excluded.content_md,`,
    `  content_hash = excluded.content_hash,`,
    `  parser_version = excluded.parser_version,`,
    `  revision = CASE`,
    `    WHEN documents.revision >= excluded.revision THEN documents.revision + 1`,
    `    ELSE excluded.revision`,
    `  END,`,
    `  deleted = excluded.deleted,`,
    `  updated_at = excluded.updated_at;`,
    `DELETE FROM document_chunks`,
    `WHERE workspace_id = ${toSqlString(record.workspaceId)}`,
    `  AND document_id = (${documentIdentitySql});`,
  ]
  for (const chunkMutation of chunkMutations) {
    if (!chunkMutation || chunkMutation.entity !== 'documentChunk' || chunkMutation.op !== 'upsert') continue
    const chunk = chunkMutation.record
    const chunkUpdatedAtIso = toIsoTimestamp(authoritativeUpdatedAtMs || chunk.updatedAtMs)
    statements.push(
      [
        `INSERT INTO document_chunks (`,
        `  id, document_id, workspace_id, chunk_key, chunk_order, heading, markdown, token_estimate, content_hash, updated_at`,
        `) VALUES (`,
        `  ${toSqlString(chunk.id)},`,
        `  (${documentIdentitySql}),`,
        `  ${toSqlString(chunk.workspaceId)},`,
        `  ${toSqlString(chunk.chunkKey)},`,
        `  ${Math.max(0, Number(chunk.chunkOrder || 0))},`,
        `  ${toSqlNullableString(chunk.heading)},`,
        `  ${toSqlString(chunk.markdown)},`,
        `  ${Math.max(1, Number(chunk.tokenEstimate || 1))},`,
        `  ${toSqlString(chunk.contentHash)},`,
        `  ${toSqlString(chunkUpdatedAtIso)}`,
        `)`,
        `ON CONFLICT(id) DO UPDATE SET`,
        `  document_id = excluded.document_id,`,
        `  workspace_id = excluded.workspace_id,`,
        `  chunk_key = excluded.chunk_key,`,
        `  chunk_order = excluded.chunk_order,`,
        `  heading = excluded.heading,`,
        `  markdown = excluded.markdown,`,
        `  token_estimate = excluded.token_estimate,`,
        `  content_hash = excluded.content_hash,`,
        `  updated_at = excluded.updated_at;`,
      ].join('\n'),
    )
  }
  return statements
}

export const buildDirectD1ReconciliationStatements = ({
  workspaceId,
  canonicalPaths,
  updatedAtMs = Date.now(),
  parserVersion = 'seed-storage-docs-to-cloudflare:v1',
}) => {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  const normalizedCanonicalPaths = [...new Set(
    (canonicalPaths || []).map(normalizeString).filter(Boolean),
  )].sort()
  if (!normalizedWorkspaceId) throw new Error('direct D1 reconciliation requires a workspace id')
  if (normalizedCanonicalPaths.length === 0) {
    throw new Error('direct D1 reconciliation requires at least one canonical path')
  }
  const updatedAtIso = toIsoTimestamp(updatedAtMs)
  const expectedPathsSql = normalizedCanonicalPaths.map(toSqlString).join(',\n    ')

  return [
    [
      'DELETE FROM graph_snapshots',
      `WHERE workspace_id = ${toSqlString(normalizedWorkspaceId)};`,
    ].join('\n'),
    [
      'UPDATE documents SET',
      '  deleted = 1,',
      "  content_md = '',",
      `  parser_version = ${toSqlString(parserVersion)},`,
      '  revision = CASE WHEN revision < 1 THEN 1 ELSE revision + 1 END,',
      `  updated_at = ${toSqlString(updatedAtIso)}`,
      `WHERE workspace_id = ${toSqlString(normalizedWorkspaceId)}`,
      '  AND deleted = 0',
      '  AND canonical_path NOT IN (',
      `    ${expectedPathsSql}`,
      '  );',
    ].join('\n'),
    [
      'DELETE FROM document_chunks',
      `WHERE workspace_id = ${toSqlString(normalizedWorkspaceId)}`,
      '  AND document_id NOT IN (',
      '    SELECT id FROM documents',
      `    WHERE workspace_id = ${toSqlString(normalizedWorkspaceId)}`,
      '      AND deleted = 0',
      '      AND canonical_path IN (',
      `        ${expectedPathsSql}`,
      '      )',
      '  );',
    ].join('\n'),
  ]
}

export const parseD1ExecuteJsonRows = (stdout, label = 'D1 query') => {
  const text = String(stdout || '').replace(/^\uFEFF/, '').trim()
  if (!text) throw new Error(`${label} returned empty JSON output`)
  const parseJsonWindow = candidate => {
    try {
      return JSON.parse(candidate)
    } catch {
      return null
    }
  }
  const payload = (() => {
    const direct = parseJsonWindow(text)
    if (direct != null) return direct
    const lines = text.split(/\r?\n/u)
    for (let start = 0; start < lines.length; start += 1) {
      const firstLine = lines[start].trimStart()
      if (!firstLine.startsWith('{') && !firstLine.startsWith('[')) continue
      for (let end = lines.length; end > start; end -= 1) {
        const candidate = lines.slice(start, end).join('\n').trim()
        if (!candidate) continue
        const parsed = parseJsonWindow(candidate)
        if (parsed != null) return parsed
      }
    }
    throw new Error(`${label} returned invalid JSON output`)
  })()
  const operations = Array.isArray(payload) ? payload : [payload]
  if (operations.length === 0) throw new Error(`${label} returned no D1 operations`)
  const failedOperation = operations.find(operation => operation?.success !== true)
  if (failedOperation) {
    const message = normalizeString(failedOperation?.error || failedOperation?.message) || 'unknown D1 error'
    throw new Error(`${label} failed: ${message}`)
  }
  return operations.flatMap(operation => (
    Array.isArray(operation?.results) ? operation.results : []
  ))
}

export const assertNoD1GraphSnapshots = (exportedGraphSnapshots) => {
  const snapshotIds = (exportedGraphSnapshots || [])
    .filter(Boolean)
    .map(snapshot => normalizeString(snapshot?.id) || normalizeString(snapshot?.documentId) || 'unknown')
    .sort()
  if (snapshotIds.length > 0) {
    throw new Error(`unexpectedGraphSnapshots=${snapshotIds.join(',')}`)
  }
  return { graphSnapshotCount: 0 }
}

const sha256Content = (content, docType = 'markdown') => {
  const value = String(content || '')
  const bytes = normalizeString(docType).toLowerCase() === 'glb'
    ? Buffer.from(value, 'base64')
    : value
  return createHash('sha256').update(bytes).digest('hex')
}

const sortedChunks = (chunks) => [...(chunks || [])].sort((left, right) => (
  Number(left?.chunkOrder || 0) - Number(right?.chunkOrder || 0)
  || normalizeString(left?.chunkKey).localeCompare(normalizeString(right?.chunkKey))
  || normalizeString(left?.id).localeCompare(normalizeString(right?.id))
))

const duplicateValues = (values) => {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates].sort()
}

export const assertD1DocumentParity = ({
  expectedDocumentSeeds,
  exportedDocuments,
  exportedDocumentChunks,
}) => {
  const expectedEntries = (expectedDocumentSeeds || []).map(seed => ({
    record: seed?.documentMutation?.record,
    chunks: sortedChunks((seed?.chunkMutations || []).map(mutation => mutation?.record).filter(Boolean)),
  }))
  const invalidExpected = expectedEntries.filter(entry => !normalizeString(entry.record?.canonicalPath))
  const expectedPaths = expectedEntries.map(entry => normalizeString(entry.record?.canonicalPath)).filter(Boolean)
  const duplicateExpected = duplicateValues(expectedPaths)
  const expectedByPath = new Map(expectedEntries.map(entry => [
    normalizeString(entry.record?.canonicalPath),
    entry,
  ]).filter(([canonicalPath]) => canonicalPath))
  const activeDocuments = (exportedDocuments || []).filter(document => (
    document
    && document.deleted !== true
    && Number(document.deleted || 0) !== 1
  ))
  const actualPaths = activeDocuments.map(document => normalizeString(document?.canonicalPath)).filter(Boolean)
  const duplicateActual = duplicateValues(actualPaths)
  const actualByPath = new Map(activeDocuments.map(document => [
    normalizeString(document?.canonicalPath),
    document,
  ]).filter(([canonicalPath]) => canonicalPath))
  const missing = [...expectedByPath.keys()].filter(canonicalPath => !actualByPath.has(canonicalPath))
  const unexpected = [...actualByPath.keys()].filter(canonicalPath => !expectedByPath.has(canonicalPath))
  const exportedChunks = (exportedDocumentChunks || []).filter(Boolean)
  const chunksByDocumentId = new Map()
  for (const chunk of exportedChunks) {
    const documentId = normalizeString(chunk?.documentId)
    const chunks = chunksByDocumentId.get(documentId) || []
    chunks.push(chunk)
    chunksByDocumentId.set(documentId, chunks)
  }

  const expectedActiveDocumentIds = new Set()
  const documentHashMismatches = new Set()
  const contentMismatches = new Set()
  const chunkMismatches = new Set()
  const invalidExpectedHashes = new Set()
  let expectedChunkCount = 0

  for (const [canonicalPath, expected] of expectedByPath) {
    const actual = actualByPath.get(canonicalPath)
    expectedChunkCount += expected.chunks.length
    if (!actual) continue
    const actualDocumentId = normalizeString(actual.id)
    expectedActiveDocumentIds.add(actualDocumentId)
    const actualChunks = sortedChunks(chunksByDocumentId.get(actualDocumentId) || [])
    const expectedContent = expected.chunks.length > 0
      ? expected.chunks.map(chunk => String(chunk.markdown || '')).join('')
      : String(expected.record?.contentMd || '')
    const actualContent = actualChunks.length > 0
      ? actualChunks.map(chunk => String(chunk.markdown || '')).join('')
      : String(actual.contentMd || '')
    const expectedHash = normalizeString(expected.record?.contentHash)

    if (sha256Content(expectedContent, expected.record?.docType) !== expectedHash) {
      invalidExpectedHashes.add(canonicalPath)
    }
    if (normalizeString(actual.contentHash) !== expectedHash) {
      documentHashMismatches.add(canonicalPath)
    }
    if (
      actualContent !== expectedContent
      || String(actual.contentMd || '') !== String(expected.record?.contentMd || '')
      || sha256Content(actualContent, expected.record?.docType) !== expectedHash
    ) {
      contentMismatches.add(canonicalPath)
    }
    if (actualChunks.length !== expected.chunks.length) {
      chunkMismatches.add(canonicalPath)
    }
    for (let index = 0; index < Math.min(actualChunks.length, expected.chunks.length); index += 1) {
      const actualChunk = actualChunks[index]
      const expectedChunk = expected.chunks[index]
      const actualMarkdown = String(actualChunk?.markdown || '')
      const expectedMarkdown = String(expectedChunk?.markdown || '')
      const expectedChunkHash = normalizeString(expectedChunk?.contentHash)
      if (
        normalizeString(actualChunk?.chunkKey) !== normalizeString(expectedChunk?.chunkKey)
        || Number(actualChunk?.chunkOrder || 0) !== Number(expectedChunk?.chunkOrder || 0)
        || actualMarkdown !== expectedMarkdown
        || normalizeString(actualChunk?.contentHash) !== expectedChunkHash
        || sha256Content(actualMarkdown) !== expectedChunkHash
        || sha256Content(expectedMarkdown) !== expectedChunkHash
      ) {
        chunkMismatches.add(canonicalPath)
      }
    }
  }

  const unexpectedChunks = exportedChunks
    .filter(chunk => !expectedActiveDocumentIds.has(normalizeString(chunk?.documentId)))
    .map(chunk => normalizeString(chunk?.id) || normalizeString(chunk?.documentId) || 'unknown')
    .sort()
  const failures = [
    invalidExpected.length > 0 ? `invalidExpected=${invalidExpected.length}` : '',
    duplicateExpected.length > 0 ? `duplicateExpected=${duplicateExpected.join(',')}` : '',
    duplicateActual.length > 0 ? `duplicateActual=${duplicateActual.join(',')}` : '',
    missing.length > 0 ? `missing=${missing.join(',')}` : '',
    unexpected.length > 0 ? `unexpected=${unexpected.join(',')}` : '',
    documentHashMismatches.size > 0 ? `contentHash=${[...documentHashMismatches].sort().join(',')}` : '',
    contentMismatches.size > 0 ? `content=${[...contentMismatches].sort().join(',')}` : '',
    chunkMismatches.size > 0 ? `chunks=${[...chunkMismatches].sort().join(',')}` : '',
    invalidExpectedHashes.size > 0 ? `invalidExpectedHash=${[...invalidExpectedHashes].sort().join(',')}` : '',
    unexpectedChunks.length > 0 ? `unexpectedChunks=${unexpectedChunks.join(',')}` : '',
    activeDocuments.length !== expectedByPath.size
      ? `documentCount=${activeDocuments.length}/${expectedByPath.size}`
      : '',
    exportedChunks.length !== expectedChunkCount
      ? `chunkCount=${exportedChunks.length}/${expectedChunkCount}`
      : '',
  ].filter(Boolean)
  if (failures.length > 0) throw new Error(failures.join('; '))
  return {
    documentCount: activeDocuments.length,
    chunkCount: exportedChunks.length,
  }
}

const normalizeStateContract = ({ workspaceId, documents, documentChunks, graphSnapshots }) => {
  const activeDocuments = (documents || [])
    .filter(document => document && document.deleted !== true && Number(document.deleted || 0) !== 1)
    .map(document => ({
      id: normalizeString(document.id),
      canonicalPath: normalizeString(document.canonicalPath),
      docType: normalizeString(document.docType) || 'markdown',
      contentMd: String(document.contentMd || ''),
      contentHash: normalizeString(document.contentHash),
    }))
    .sort((left, right) => left.canonicalPath.localeCompare(right.canonicalPath))
  const canonicalPathByDocumentId = new Map(activeDocuments.map(document => [document.id, document.canonicalPath]))
  const chunks = (documentChunks || []).map(chunk => ({
    canonicalPath: canonicalPathByDocumentId.get(normalizeString(chunk.documentId)) || '',
    chunkKey: normalizeString(chunk.chunkKey),
    chunkOrder: Number(chunk.chunkOrder || 0),
    markdown: String(chunk.markdown || ''),
    contentHash: normalizeString(chunk.contentHash),
  })).sort((left, right) => (
    left.canonicalPath.localeCompare(right.canonicalPath)
    || left.chunkOrder - right.chunkOrder
    || left.chunkKey.localeCompare(right.chunkKey)
  ))
  const normalizedDocuments = activeDocuments.map(({ id: _id, ...document }) => document)
  const normalizedGraphs = (graphSnapshots || []).map(snapshot => ({
    documentPath: canonicalPathByDocumentId.get(normalizeString(snapshot.documentId)) || '',
    graphRevision: Number(snapshot.graphRevision || 0),
    graphHash: normalizeString(snapshot.graphHash),
  })).sort((left, right) => (
    left.documentPath.localeCompare(right.documentPath)
    || left.graphRevision - right.graphRevision
    || left.graphHash.localeCompare(right.graphHash)
  ))
  return {
    workspaceId: normalizeString(workspaceId),
    documents: normalizedDocuments,
    documentChunks: chunks,
    graphSnapshots: normalizedGraphs,
  }
}

export const d1StateContractDigest = ({ workspaceId, exported }) => digest(normalizeStateContract({
  workspaceId,
  documents: exported?.documents,
  documentChunks: exported?.documentChunks,
  graphSnapshots: exported?.graphSnapshots,
}))

const expectedStateContract = ({ workspaceId, documentSeeds }) => {
  const documents = (documentSeeds || []).map(seed => seed?.documentMutation?.record).filter(Boolean)
  const documentChunks = (documentSeeds || []).flatMap(seed => (
    (seed?.chunkMutations || []).map(mutation => mutation?.record).filter(Boolean)
  ))
  return normalizeStateContract({ workspaceId, documents, documentChunks, graphSnapshots: [] })
}

export const countDirectD1LogicalOperations = documentSeeds => {
  const documentOperations = (documentSeeds || []).reduce((count, seed) => (
    count + 2 + (seed?.chunkMutations || []).filter(mutation => (
      mutation?.entity === 'documentChunk' && mutation?.op === 'upsert'
    )).length
  ), 0)
  return 1 + documentOperations + 3
}

export const createD1StateSnapshotEvidence = ({ workspaceId, exported, capturedAt }) => {
  const stateContract = normalizeStateContract({
    workspaceId,
    documents: exported?.documents,
    documentChunks: exported?.documentChunks,
    graphSnapshots: exported?.graphSnapshots,
  })
  const observedCounts = {
    documentCount: stateContract.documents.length,
    chunkCount: stateContract.documentChunks.length,
    graphCount: stateContract.graphSnapshots.length,
  }
  return {
    schema: D1_STATE_SNAPSHOT_SCHEMA,
    workspaceId: stateContract.workspaceId,
    readbackAdapterId: 'cloudflare-wrangler-d1-direct-readback/v1',
    readbackKind: 'direct-authoritative',
    stateContractDigest: digest(stateContract),
    readbackDigest: digest({
      // `revision` is a monotonic storage counter, so an exact content restore
      // necessarily advances it. Bind every directly read field except that
      // non-restorable counter; row identities and all corpus bytes stay exact.
      documents: (exported?.documents || []).map(({ revision: _revision, ...document }) => document),
      documentChunks: exported?.documentChunks || [],
      graphSnapshots: exported?.graphSnapshots || [],
    }),
    observedCounts,
    capturedAt: new Date(capturedAt).toISOString(),
  }
}

export const createD1ReconciliationEvidence = ({
  workspaceId,
  documentSeeds,
  statements,
  exported,
  parity,
  snapshotParity,
  reconciledAt,
}) => {
  const expectedContract = expectedStateContract({ workspaceId, documentSeeds })
  const observedSnapshot = createD1StateSnapshotEvidence({
    workspaceId,
    exported,
    capturedAt: reconciledAt,
  })
  const stateContractDigest = digest(expectedContract)
  if (observedSnapshot.stateContractDigest !== stateContractDigest) {
    throw new Error('direct D1 readback state contract drifted from the canonical document corpus')
  }
  const operationCount = countDirectD1LogicalOperations(documentSeeds)
  if (operationCount > D1_OPERATION_LIMIT) {
    throw new Error(`direct D1 reconciliation requires ${operationCount} operations; limit=${D1_OPERATION_LIMIT}`)
  }
  const expectedCounts = {
    documentCount: documentSeeds.length,
    chunkCount: documentSeeds.reduce((count, seed) => count + (seed?.chunkMutations || []).length, 0),
    graphCount: 0,
  }
  const observedCounts = {
    documentCount: parity.documentCount,
    chunkCount: parity.chunkCount,
    graphCount: snapshotParity.graphSnapshotCount,
  }
  return {
    schema: D1_RECONCILIATION_EVIDENCE_SCHEMA,
    workspaceId: normalizeString(workspaceId),
    stateContractDigest,
    operationsDigest: digest(statements || []),
    operationCount,
    operationLimit: D1_OPERATION_LIMIT,
    readbackAdapterId: observedSnapshot.readbackAdapterId,
    readbackKind: observedSnapshot.readbackKind,
    readbackDigest: observedSnapshot.readbackDigest,
    expectedCounts,
    observedCounts,
    pathHashParity: true,
    contentParity: true,
    reconciledAt: new Date(reconciledAt).toISOString(),
  }
}
