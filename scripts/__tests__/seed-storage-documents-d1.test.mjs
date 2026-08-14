import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import test from 'node:test'

import {
  assertD1DocumentParity,
  assertNoD1GraphSnapshots,
  buildDirectD1DocumentStatements,
  buildDirectD1ReconciliationStatements,
  countDirectD1LogicalOperations,
  createD1ReconciliationEvidence,
  createD1StateSnapshotEvidence,
  parseD1ExecuteJsonRows,
} from '../lib/seed-storage-documents-d1.mjs'

const workspaceId = 'workspace:test'
const canonicalPath = 'docs/example.md'

const schemaSql = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE workspaces (id TEXT PRIMARY KEY);
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    canonical_path TEXT NOT NULL,
    title TEXT,
    doc_type TEXT,
    lang TEXT,
    graph_id TEXT,
    source_kind TEXT NOT NULL,
    content_md TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    revision INTEGER NOT NULL,
    deleted INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    UNIQUE (workspace_id, canonical_path)
  );
  CREATE TABLE document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    chunk_key TEXT NOT NULL,
    chunk_order INTEGER NOT NULL,
    heading TEXT,
    markdown TEXT NOT NULL,
    token_estimate INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    UNIQUE (document_id, chunk_key)
  );
  CREATE TABLE graph_snapshots (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    graph_revision INTEGER NOT NULL,
    graph_hash TEXT NOT NULL,
    graph_json TEXT NOT NULL,
    layout_json TEXT,
    derived_from_document_revision INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    UNIQUE (document_id, graph_revision)
  );
  INSERT INTO workspaces (id) VALUES ('workspace:test');
`

const executeScenario = (scenarioSql) => {
  const querySql = `
    SELECT json_object(
      'documents', COALESCE((
        SELECT json_group_array(json_object(
          'id', id,
          'canonicalPath', canonical_path,
          'contentHash', content_hash,
          'revision', revision,
          'deleted', deleted
        )) FROM documents WHERE workspace_id = 'workspace:test'
      ), json('[]')),
      'chunks', COALESCE((
        SELECT json_group_array(json_object(
          'id', id,
          'documentId', document_id,
          'markdown', markdown
        )) FROM document_chunks
      ), json('[]')),
      'graphSnapshots', COALESCE((
        SELECT json_group_array(json_object(
          'id', id,
          'documentId', document_id
        )) FROM graph_snapshots
      ), json('[]'))
    ) AS result;
  `
  const result = spawnSync('sqlite3', ['-json', ':memory:'], {
    encoding: 'utf8',
    input: `${schemaSql}\n${scenarioSql}\n${querySql}`,
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  const rows = JSON.parse(result.stdout)
  assert.equal(rows.length, 1)
  return JSON.parse(rows[0].result)
}

const buildSeed = () => ({
  record: {
    id: 'docs:deterministic-id',
    workspaceId,
    canonicalPath,
    title: 'example.md',
    docType: 'markdown',
    lang: null,
    graphId: 'graph:example',
    sourceKind: 'markdown',
    contentMd: '',
    contentHash: 'hash:new',
    parserVersion: 'seed:test',
    revision: 7,
    updatedAtMs: 1_700_000_000_000,
    deleted: false,
  },
  chunkMutations: [{
    entity: 'documentChunk',
    op: 'upsert',
    record: {
      id: 'chunk:deterministic-id',
      documentId: 'docs:deterministic-id',
      workspaceId,
      chunkKey: 'part-0000',
      chunkOrder: 0,
      heading: null,
      markdown: 'new content',
      tokenEstimate: 3,
      contentHash: 'chunk-hash:new',
      updatedAtMs: 1_700_000_000_000,
    },
  }],
})

test('direct D1 seed reuses the row that already owns a canonical path', () => {
  const seed = buildSeed()
  const authoritativeUpdatedAtMs = 1_800_000_000_000
  const statements = buildDirectD1DocumentStatements({
    ...seed,
    authoritativeUpdatedAtMs,
  })
  const sql = statements.join('\n')
  const state = executeScenario(`
    INSERT INTO documents (
      id, workspace_id, canonical_path, title, doc_type, source_kind, content_md,
      content_hash, parser_version, revision, deleted, created_at, updated_at
    ) VALUES (
      'legacy:share-id', 'workspace:test', 'docs/example.md', 'legacy.md', 'markdown',
      'markdown', '', 'hash:legacy', 'legacy-seed', 9, 1,
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    ${sql}
  `)

  assert.deepEqual(state.documents, [{
    id: 'legacy:share-id',
    canonicalPath,
    contentHash: 'hash:new',
    revision: 10,
    deleted: 0,
  }])
  assert.deepEqual(state.chunks, [{
    id: 'chunk:deterministic-id',
    documentId: 'legacy:share-id',
    markdown: 'new content',
  }])
  assert.match(sql, new RegExp(new Date(authoritativeUpdatedAtMs).toISOString(), 'g'))
  assert.doesNotMatch(sql, new RegExp(new Date(seed.record.updatedAtMs).toISOString(), 'g'))
})

test('direct D1 seed inserts the deterministic id for a new canonical path', () => {
  const seed = buildSeed()
  const state = executeScenario(buildDirectD1DocumentStatements(seed).join('\n'))

  assert.deepEqual(state.documents, [{
    id: seed.record.id,
    canonicalPath,
    contentHash: seed.record.contentHash,
    revision: seed.record.revision,
    deleted: 0,
  }])
  assert.equal(state.chunks[0].documentId, seed.record.id)
})

const sha256 = value => createHash('sha256').update(value).digest('hex')

test('direct D1 reconciliation retires unexpected documents and their chunks', () => {
  const reconciliationStatements = buildDirectD1ReconciliationStatements({
    workspaceId,
    canonicalPaths: ['docs/expected.md'],
    updatedAtMs: 1_700_000_000_000,
    parserVersion: 'seed:test',
  })
  const state = executeScenario(`
    INSERT INTO documents (
      id, workspace_id, canonical_path, title, doc_type, source_kind, content_md,
      content_hash, parser_version, revision, deleted, created_at, updated_at
    ) VALUES
      (
        'docs:expected', 'workspace:test', 'docs/expected.md', 'expected.md', 'markdown',
        'markdown', 'expected', '${sha256('expected')}', 'seed:test', 1, 0,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      ),
      (
        'docs:stale', 'workspace:test', 'docs/stale.md', 'stale.md', 'markdown',
        'markdown', 'stale', '${sha256('stale')}', 'legacy', 2, 0,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      ),
      (
        'docs:deleted', 'workspace:test', 'docs/deleted.md', 'deleted.md', 'markdown',
        'markdown', '', '${sha256('deleted')}', 'legacy', 4, 1,
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      );
    INSERT INTO document_chunks (
      id, document_id, workspace_id, chunk_key, chunk_order, markdown,
      token_estimate, content_hash, updated_at
    ) VALUES
      (
        'chunk:expected', 'docs:expected', 'workspace:test', 'part-0000', 0,
        'expected', 2, '${sha256('expected')}', '2026-01-01T00:00:00.000Z'
      ),
      (
        'chunk:stale', 'docs:stale', 'workspace:test', 'part-0000', 0,
        'stale', 2, '${sha256('stale')}', '2026-01-01T00:00:00.000Z'
      ),
      (
        'chunk:deleted', 'docs:deleted', 'workspace:test', 'part-0000', 0,
        'deleted', 2, '${sha256('deleted')}', '2026-01-01T00:00:00.000Z'
      );
    INSERT INTO graph_snapshots (
      id, document_id, workspace_id, graph_revision, graph_hash, graph_json,
      derived_from_document_revision, updated_at
    ) VALUES
      (
        'snapshot:expected', 'docs:expected', 'workspace:test', 1, 'graph:expected', '{}',
        1, '2026-01-01T00:00:00.000Z'
      ),
      (
        'snapshot:deleted', 'docs:deleted', 'workspace:test', 4, 'graph:deleted', '{}',
        4, '2026-01-01T00:00:00.000Z'
      );
    ${reconciliationStatements.join('\n')}
  `)

  assert.deepEqual(state.documents, [
    {
      id: 'docs:deleted',
      canonicalPath: 'docs/deleted.md',
      contentHash: sha256('deleted'),
      revision: 4,
      deleted: 1,
    },
    {
      id: 'docs:expected',
      canonicalPath: 'docs/expected.md',
      contentHash: sha256('expected'),
      revision: 1,
      deleted: 0,
    },
    {
      id: 'docs:stale',
      canonicalPath: 'docs/stale.md',
      contentHash: sha256('stale'),
      revision: 3,
      deleted: 1,
    },
  ])
  assert.deepEqual(state.chunks, [{
    id: 'chunk:expected',
    documentId: 'docs:expected',
    markdown: 'expected',
  }])
  assert.deepEqual(state.graphSnapshots, [])
})

test('direct D1 reconciliation rejects an empty canonical corpus', () => {
  assert.throws(
    () => buildDirectD1ReconciliationStatements({ workspaceId, canonicalPaths: [] }),
    /requires at least one canonical path/,
  )
})

test('direct D1 JSON readback accepts successful Wrangler rows and rejects failed output', () => {
  const successfulOutput = JSON.stringify([{
    results: [{ id: 'docs:a', canonicalPath: 'docs/a.md' }],
    success: true,
  }])
  assert.deepEqual(
    parseD1ExecuteJsonRows(`\uFEFF${successfulOutput}`, 'documents-readback'),
    [{ id: 'docs:a', canonicalPath: 'docs/a.md' }],
  )
  assert.throws(
    () => parseD1ExecuteJsonRows('', 'documents-readback'),
    /documents-readback returned empty JSON output/,
  )
  assert.throws(
    () => parseD1ExecuteJsonRows('[{"success":false,"error":"query rejected"}]', 'documents-readback'),
    /documents-readback failed: query rejected/,
  )
  assert.throws(
    () => parseD1ExecuteJsonRows('<html>challenge</html>', 'documents-readback'),
    /documents-readback returned invalid JSON output/,
  )
})

test('direct D1 verification rejects every derived graph snapshot', () => {
  assert.deepEqual(assertNoD1GraphSnapshots([]), { graphSnapshotCount: 0 })
  assert.throws(
    () => assertNoD1GraphSnapshots([{ id: 'snapshot:stale', documentId: 'docs:a' }]),
    /unexpectedGraphSnapshots=snapshot:stale/,
  )
})

const buildParitySeed = ({ canonicalPath, content, chunks = [] }) => ({
  documentMutation: {
    record: {
      canonicalPath,
      contentMd: chunks.length > 0 ? '' : content,
      contentHash: sha256(content),
      docType: 'markdown',
    },
  },
  chunkMutations: chunks.map((markdown, chunkOrder) => ({
    record: {
      id: `${canonicalPath}:chunk:${chunkOrder}`,
      chunkKey: `part-${String(chunkOrder).padStart(4, '0')}`,
      chunkOrder,
      markdown,
      contentHash: sha256(markdown),
    },
  })),
})

test('D1 seed verification requires exact active path, content, hash, and chunk parity', () => {
  const expectedDocumentSeeds = [
    buildParitySeed({ canonicalPath: 'docs/a.md', content: 'alpha' }),
    buildParitySeed({ canonicalPath: 'docs/b.md', content: 'beta-gamma', chunks: ['beta-', 'gamma'] }),
  ]
  const exportedDocuments = [
    { id: 'actual:a', canonicalPath: 'docs/a.md', contentMd: 'alpha', contentHash: sha256('alpha'), deleted: false },
    { id: 'actual:b', canonicalPath: 'docs/b.md', contentMd: '', contentHash: sha256('beta-gamma'), deleted: false },
    { id: 'actual:retired', canonicalPath: 'docs/retired.md', contentMd: '', contentHash: sha256('retired'), deleted: true },
  ]
  const exportedDocumentChunks = [
    { id: 'actual:b:0', documentId: 'actual:b', chunkKey: 'part-0000', chunkOrder: 0, markdown: 'beta-', contentHash: sha256('beta-') },
    { id: 'actual:b:1', documentId: 'actual:b', chunkKey: 'part-0001', chunkOrder: 1, markdown: 'gamma', contentHash: sha256('gamma') },
  ]

  assert.deepEqual(assertD1DocumentParity({
    expectedDocumentSeeds,
    exportedDocuments,
    exportedDocumentChunks,
  }), { documentCount: 2, chunkCount: 2 })
  assert.throws(
    () => assertD1DocumentParity({
      expectedDocumentSeeds,
      exportedDocuments: [
        exportedDocuments[0],
        { ...exportedDocuments[1], contentHash: sha256('stale') },
      ],
      exportedDocumentChunks,
    }),
    /contentHash=docs\/b\.md/,
  )
  assert.throws(
    () => assertD1DocumentParity({
      expectedDocumentSeeds,
      exportedDocuments: [
        exportedDocuments[0],
        { id: 'actual:c', canonicalPath: 'docs/c.md', contentMd: 'charlie', contentHash: sha256('charlie'), deleted: false },
      ],
      exportedDocumentChunks: [],
    }),
    /missing=docs\/b\.md; unexpected=docs\/c\.md/,
  )
})

test('D1 seed verification rejects corrupted or incomplete stored document content', () => {
  const expectedDocumentSeeds = [
    buildParitySeed({ canonicalPath: 'docs/a.md', content: 'alpha' }),
    buildParitySeed({ canonicalPath: 'docs/b.md', content: 'beta-gamma', chunks: ['beta-', 'gamma'] }),
  ]
  const exportedDocuments = [
    { id: 'actual:a', canonicalPath: 'docs/a.md', contentMd: 'corrupt', contentHash: sha256('alpha'), deleted: false },
    { id: 'actual:b', canonicalPath: 'docs/b.md', contentMd: '', contentHash: sha256('beta-gamma'), deleted: false },
  ]
  const exportedDocumentChunks = [
    { id: 'actual:b:0', documentId: 'actual:b', chunkKey: 'part-0000', chunkOrder: 0, markdown: 'beta-', contentHash: sha256('beta-') },
  ]

  assert.throws(
    () => assertD1DocumentParity({ expectedDocumentSeeds, exportedDocuments, exportedDocumentChunks }),
    /content=docs\/a\.md,docs\/b\.md; chunks=docs\/b\.md/,
  )
})

test('D1 seed verification rejects chunks retained for deleted documents', () => {
  const expectedDocumentSeeds = [buildParitySeed({ canonicalPath: 'docs/a.md', content: 'alpha' })]
  const exportedDocuments = [
    { id: 'actual:a', canonicalPath: 'docs/a.md', contentMd: 'alpha', contentHash: sha256('alpha'), deleted: false },
    { id: 'actual:retired', canonicalPath: 'docs/retired.md', contentMd: '', contentHash: sha256('retired'), deleted: true },
  ]
  const exportedDocumentChunks = [
    { id: 'stale:chunk', documentId: 'actual:retired', chunkKey: 'part-0000', chunkOrder: 0, markdown: 'retired', contentHash: sha256('retired') },
  ]

  assert.throws(
    () => assertD1DocumentParity({ expectedDocumentSeeds, exportedDocuments, exportedDocumentChunks }),
    /unexpectedChunks=stale:chunk; chunkCount=1\/0/,
  )
})

test('D1 reconciliation evidence binds bounded operations to direct readback parity', () => {
  const documentSeeds = [buildParitySeed({
    canonicalPath: 'docs/a.md',
    content: 'alpha-beta',
    chunks: ['alpha-', 'beta'],
  })]
  documentSeeds[0].documentMutation.record.id = 'expected:a'
  documentSeeds[0].documentMutation.record.workspaceId = workspaceId
  for (const mutation of documentSeeds[0].chunkMutations) {
    mutation.entity = 'documentChunk'
    mutation.op = 'upsert'
    mutation.record.documentId = 'expected:a'
    mutation.record.workspaceId = workspaceId
  }
  const exported = {
    documents: [{
      id: 'existing:a',
      canonicalPath: 'docs/a.md',
      docType: 'markdown',
      contentMd: '',
      contentHash: sha256('alpha-beta'),
      deleted: 0,
    }],
    documentChunks: documentSeeds[0].chunkMutations.map(mutation => ({
      ...mutation.record,
      documentId: 'existing:a',
    })),
    graphSnapshots: [],
  }
  const parity = assertD1DocumentParity({
    expectedDocumentSeeds: documentSeeds,
    exportedDocuments: exported.documents,
    exportedDocumentChunks: exported.documentChunks,
  })
  const evidence = createD1ReconciliationEvidence({
    workspaceId,
    documentSeeds,
    statements: ['UPSERT document', 'RECONCILE corpus'],
    exported,
    parity,
    snapshotParity: assertNoD1GraphSnapshots([]),
    reconciledAt: '2026-08-13T00:00:00.000Z',
  })

  assert.equal(evidence.schema, 'knowgrph-d1-reconciliation-evidence/v1')
  assert.equal(evidence.operationCount, 8)
  assert.equal(evidence.operationLimit, 10_000)
  assert.deepEqual(evidence.expectedCounts, { documentCount: 1, chunkCount: 2, graphCount: 0 })
  assert.deepEqual(evidence.observedCounts, evidence.expectedCounts)
  assert.equal(evidence.pathHashParity, true)
  assert.equal(evidence.contentParity, true)
  assert.match(evidence.stateContractDigest, /^[0-9a-f]{64}$/)
  assert.match(evidence.readbackDigest, /^[0-9a-f]{64}$/)
  assert.equal(countDirectD1LogicalOperations(documentSeeds), 8)
})

test('D1 state snapshots normalize authoritative rows independently of row identity', () => {
  const first = createD1StateSnapshotEvidence({
    workspaceId,
    exported: {
      documents: [{
        id: 'row:a', canonicalPath: 'docs/a.md', docType: 'markdown',
        contentMd: 'alpha', contentHash: sha256('alpha'), deleted: 0,
      }],
      documentChunks: [],
      graphSnapshots: [],
    },
    capturedAt: '2026-08-13T00:00:00.000Z',
  })
  const second = createD1StateSnapshotEvidence({
    workspaceId,
    exported: {
      documents: [{
        id: 'legacy:a', canonicalPath: 'docs/a.md', docType: 'markdown',
        contentMd: 'alpha', contentHash: sha256('alpha'), deleted: false,
      }],
      documentChunks: [],
      graphSnapshots: [],
    },
    capturedAt: '2026-08-13T00:01:00.000Z',
  })

  assert.equal(first.stateContractDigest, second.stateContractDigest)
  assert.notEqual(first.readbackDigest, second.readbackDigest)
  assert.deepEqual(first.observedCounts, { documentCount: 1, chunkCount: 0, graphCount: 0 })
})

test('D1 readback identity excludes only the non-restorable document revision counter', () => {
  const exported = {
    documents: [{
      id: 'row:a', canonicalPath: 'docs/a.md', docType: 'markdown', contentMd: 'alpha',
      contentHash: sha256('alpha'), revision: 4, deleted: 0,
    }],
    documentChunks: [],
    graphSnapshots: [],
  }
  const snapshot = revision => createD1StateSnapshotEvidence({
    workspaceId,
    exported: { ...exported, documents: [{ ...exported.documents[0], revision }] },
    capturedAt: '2026-08-13T00:00:00.000Z',
  })

  assert.equal(snapshot(4).readbackDigest, snapshot(5).readbackDigest)
  assert.notEqual(
    snapshot(4).readbackDigest,
    createD1StateSnapshotEvidence({
      workspaceId,
      exported: { ...exported, documents: [{ ...exported.documents[0], id: 'row:b' }] },
      capturedAt: '2026-08-13T00:00:00.000Z',
    }).readbackDigest,
  )
})
