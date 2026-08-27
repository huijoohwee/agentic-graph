import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  __resetKnowgrphStorageDbForTests,
  getKnowgrphStorageDb,
} from '@/lib/storage/knowgrphStorageDb'
import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
  KNOWGRPH_STORAGE_API_VERSION,
  KNOWGRPH_STORAGE_CRAWLER_ACCESS_HEADERS,
  KNOWGRPH_STORAGE_COLLECTION_NAMES,
  KNOWGRPH_STORAGE_D1_BINDING_NAME,
  KNOWGRPH_STORAGE_D1_TABLE_NAMES,
  KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  KNOWGRPH_STORAGE_ROUTE_PATHS,
  buildKnowgrphStorageCursorId,
  buildKnowgrphStorageCanvasRoomPath,
  buildKnowgrphStorageDefaultDocPath,
  buildKnowgrphStorageDocPath,
  buildKnowgrphStorageExportPath,
  buildKnowgrphStorageLlmsPath,
  buildKnowgrphStoragePullRequest,
  buildKnowgrphStorageSourceFilesIndexPath,
  isKnowgrphStorageEntityKind,
} from '@/lib/storage/knowgrphStorageSyncContract'

export const testKnowgrphStorageContractExposesExpectedRoutesAndBindings = () => {
  if (KNOWGRPH_STORAGE_API_VERSION !== '2026-05-04') {
    throw new Error('expected knowgrph storage API version to stay pinned to the documented contract revision')
  }
  if (KNOWGRPH_STORAGE_D1_BINDING_NAME !== 'DB') {
    throw new Error('expected Cloudflare Worker D1 binding to remain DB')
  }
  if (KNOWGRPH_STORAGE_ROUTE_PATHS.push !== '/api/storage/push') {
    throw new Error('expected push route to match the storage document contract')
  }
  if (KNOWGRPH_STORAGE_ROUTE_PATHS.pull !== '/api/storage/pull') {
    throw new Error('expected pull route to match the storage document contract')
  }
  if (KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID !== 'kgws:canonical-docs') {
    throw new Error('expected default storage workspace id to stay centralized in the storage contract')
  }
  if (!CLOUDFLARE_PAY_PER_CRAWL_DOC_URL.endsWith('/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/index.md')) {
    throw new Error('expected Pay Per Crawl markdown docs link to stay centralized for crawler access metadata')
  }
  if (CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.exactPrice !== 'crawler-exact-price') {
    throw new Error('expected Pay Per Crawl exact price request header name to stay centralized')
  }
  if (CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS.maxPrice !== 'crawler-max-price') {
    throw new Error('expected Pay Per Crawl maximum price request header name to stay centralized')
  }
  if (CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.price !== 'crawler-price') {
    throw new Error('expected Pay Per Crawl price header name to stay centralized')
  }
  if (CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.charged !== 'crawler-charged') {
    throw new Error('expected Pay Per Crawl charged header name to stay centralized')
  }
  if (CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS.error !== 'crawler-error') {
    throw new Error('expected Pay Per Crawl error header name to stay centralized')
  }
  if (KNOWGRPH_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy !== 'x-knowgrph-pay-per-crawl-policy') {
    throw new Error('expected crawler access policy header name to stay centralized')
  }
  const pullRequest = buildKnowgrphStoragePullRequest({
    workspaceId: 'wk_123',
    deviceId: 'dev_macbook',
    since: 'cursor_1',
  })
  if (
    pullRequest.workspaceId !== 'wk_123'
    || pullRequest.deviceId !== 'dev_macbook'
    || pullRequest.since !== 'cursor_1'
    || pullRequest.apiVersion !== KNOWGRPH_STORAGE_API_VERSION
  ) {
    throw new Error('expected pull request helper to build the documented POST payload shape')
  }
  if (buildKnowgrphStorageExportPath('wk_123') !== '/api/storage/export/wk_123') {
    throw new Error('expected export path helper to keep workspace-scoped route structure')
  }
  if (buildKnowgrphStorageCanvasRoomPath('wk_123', 'workspace:/docs/example.md') !== '/api/storage/canvas-room/wk_123/workspace%3A%2Fdocs%2Fexample.md') {
    throw new Error('expected canvas room path helper to keep workspace-scoped authenticated room structure')
  }
  if (buildKnowgrphStorageDocPath('wk_123', 'docs/example file.md') !== '/api/storage/doc/wk_123/docs%2Fexample%20file.md') {
    throw new Error('expected doc path helper to encode workspace and canonical source-file path')
  }
  if (buildKnowgrphStorageDefaultDocPath('docs/example file.md') !== '/api/storage/doc-default/docs%2Fexample%20file.md') {
    throw new Error('expected default doc path helper to encode canonical source-file path without requiring workspaceId')
  }
  if (buildKnowgrphStorageSourceFilesIndexPath() !== '/api/storage/source-files') {
    throw new Error('expected default Source Files crawler index path to stay route-owned')
  }
  if (buildKnowgrphStorageSourceFilesIndexPath('wk_123') !== '/api/storage/source-files/wk_123') {
    throw new Error('expected workspace-scoped Source Files crawler index path to stay deterministic')
  }
  if (buildKnowgrphStorageLlmsPath() !== '/api/storage/llms.txt') {
    throw new Error('expected default llms.txt path to stay route-owned')
  }
  if (buildKnowgrphStorageLlmsPath('wk_123') !== '/api/storage/source-files/wk_123/llms.txt') {
    throw new Error('expected workspace-scoped llms.txt path to stay attached to Source Files crawler index')
  }
  if (buildKnowgrphStorageCursorId('wk_123', 'dev_macbook') !== 'wk_123:dev_macbook') {
    throw new Error('expected cursor id helper to stay deterministic across client and worker code')
  }
  if (!isKnowgrphStorageEntityKind('document') || !isKnowgrphStorageEntityKind('documentChunk') || !isKnowgrphStorageEntityKind('graphSnapshot')) {
    throw new Error('expected all documented storage entity kinds to validate')
  }
  if (isKnowgrphStorageEntityKind('workspace')) {
    throw new Error('expected entity guard to reject undocumented storage entity kinds')
  }
}

export async function testKnowgrphStorageRxdbBootsExpectedCollections() {
  await __resetKnowgrphStorageDbForTests()
  const { collections } = await getKnowgrphStorageDb()
  const names = Object.keys(collections).sort()
  const expected = [...KNOWGRPH_STORAGE_COLLECTION_NAMES].sort()
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    throw new Error(`expected knowgrph storage collections ${expected.join(',')} but received ${names.join(',')}`)
  }
  await __resetKnowgrphStorageDbForTests()
}

export const testKnowgrphStorageD1MigrationDefinesExpectedTablesAndIndexes = () => {
  const filePath = resolve(process.cwd(), '..', 'cloudflare', 'd1', 'migrations', '0001_knowgrph_storage.sql')
  const text = readFileSync(filePath, 'utf8')
  for (const tableName of KNOWGRPH_STORAGE_D1_TABLE_NAMES) {
    if (!text.includes(`CREATE TABLE IF NOT EXISTS ${tableName}`)) {
      throw new Error(`expected D1 migration to create table ${tableName}`)
    }
  }
  for (const indexName of [
    'idx_documents_workspace_updated',
    'idx_document_chunks_doc_order',
    'idx_document_chunks_doc_key',
    'idx_graph_snapshots_doc_rev',
    'idx_sync_events_workspace_created',
  ]) {
    if (!text.includes(`CREATE INDEX IF NOT EXISTS ${indexName}`)) {
      throw new Error(`expected D1 migration to create index ${indexName}`)
    }
  }
  if (!text.includes('FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE')) {
    throw new Error('expected D1 migration to preserve document to chunk/snapshot cascade rules')
  }
}
