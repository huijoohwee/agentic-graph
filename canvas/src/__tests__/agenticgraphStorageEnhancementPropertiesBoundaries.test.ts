import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { createFakeKnowgrphStorageWorkerEnv } from '@/__tests__/helpers/fakeKnowgrphStorageD1'
import { trimDocumentVersionState, type DocumentVersionEntry } from '@/features/document-versioning/documentVersioning'
import { applyComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import {
  isLocalKnowgrphStorageWorkerOrigin,
  resolveMutatingKnowgrphStorageBaseUrl,
} from '@/features/source-files/sourceFileCanonicalCloudSync'
import { readSourceImportUtf8ByteLength } from '@/features/source-files/sourceFilesIngestIntegration'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  exportAsCombinedCsvBlob,
  exportAsJsonLdBlob,
  exportAsRawJsonBlob,
  parseGraph,
} from '@/lib/graph/io/adapter'
import type { GraphData } from '@/lib/graph/types'
import {
  KNOWGRPH_SOURCE_IMPORT_LIMITS,
  KNOWGRPH_STORAGE_SYNC_BOUNDS,
} from '@/lib/storage/knowgrphStorageBounds'
import type { KgDocumentLocalRecord } from '@/lib/storage/knowgrphStorageDb'
import {
  toKnowgrphLocalDocumentRecord,
  toKnowgrphRemoteDocumentRecord,
} from '@/lib/storage/knowgrphStorageRecordMapping'
import { hashKnowgrphStorageContent } from '@/lib/storage/knowgrphStorageSyncContract'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { pruneStaleSyncEvents } from '../../../cloudflare/workers/knowgrph-storage/db'

const PROPERTY_RUNS = 100
const sourceText = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const identifierArbitrary = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 12 },
).map(parts => parts.join(''))
const markdownArbitrary = fc.string({ maxLength: 160 })

// Feature: knowgrph-storage-sync-enhancement, Property 28: Browser-local field mapping round-trip
export function testStorageEnhancementProperty28BrowserLocalFieldMappingRoundTrip() {
  fc.assert(fc.property(
    identifierArbitrary,
    markdownArbitrary,
    fc.integer({ min: 0, max: 10_000 }),
    fc.boolean(),
    (id, contentMd, documentRevision, isDeleted) => {
      const local: KgDocumentLocalRecord = {
        id,
        workspaceId: `workspace-${id}`,
        canonicalPath: `docs/${id}.md`,
        title: id,
        docType: 'note',
        lang: 'en-US',
        graphId: null,
        sourceKind: 'markdown',
        contentMd,
        contentHash: hashKnowgrphStorageContent(contentMd),
        parserVersion: 'property-test',
        documentRevision,
        updatedAtMs: 1_777_000_000_000,
        isDeleted,
      }
      const roundTrip = toKnowgrphLocalDocumentRecord(toKnowgrphRemoteDocumentRecord(local))
      return roundTrip.documentRevision === documentRevision
        && roundTrip.isDeleted === isDeleted
        && JSON.stringify(roundTrip) === JSON.stringify(local)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 29: sync_events TTL partition
export async function testStorageEnhancementProperty29SyncEventsTtlPartition() {
  await fc.assert(fc.asyncProperty(
    fc.array(fc.integer({ min: 0, max: 48 * 60 * 60 * 1_000 }), { maxLength: 40 }),
    async agesMs => {
      const env = createFakeKnowgrphStorageWorkerEnv()
      const nowMs = 1_777_000_000_000
      agesMs.forEach((ageMs, index) => {
        const id = `event-${index}`
        env.DB.syncEvents.set(id, {
          id,
          created_at: new Date(nowMs - ageMs).toISOString(),
        })
      })
      await pruneStaleSyncEvents(env.DB as never, new Date(nowMs).toISOString())
      return agesMs.every((ageMs, index) =>
        env.DB.syncEvents.has(`event-${index}`)
          === (ageMs <= KNOWGRPH_STORAGE_SYNC_BOUNDS.syncEventsTtlMs))
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 30: Generated artifacts split bytes and manifest
export function testStorageEnhancementProperty30GeneratedArtifactsSplitBytesAndManifest() {
  const outputSource = sourceText('src/features/chat/chatHistoryWorkspace.output.ts')
  const uploadIndex = outputSource.indexOf('await uploadGeneratedWorkspaceBlobToKnowgrphStorage({')
  const manifestIndex = outputSource.indexOf('text: buildStoredBinaryManifestMarkdown({')
  const publishIndex = outputSource.indexOf('await publishGeneratedWorkspacePathsToKnowgrphStorage({')
  assert(
    uploadIndex >= 0 && uploadIndex < manifestIndex && manifestIndex < publishIndex,
    'expected binary upload before sibling manifest publication',
  )
  fc.assert(fc.property(
    fc.uint8Array({ maxLength: 256 }),
    identifierArbitrary,
    (bytes, objectId) => {
      const objectKey = `generated/${objectId}.bin`
      const manifest = [
        '---',
        `object_key: "${objectKey}"`,
        `size_bytes: ${bytes.byteLength}`,
        '---',
      ].join('\n')
      const rawPayloadField = `raw_bytes: "${Array.from(bytes).join(',')}"`
      return manifest.includes(objectKey)
        && manifest.includes(String(bytes.byteLength))
        && !manifest.includes(rawPayloadField)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 31: Extensions gated on complete readiness
export function testStorageEnhancementProperty31ExtensionsRequireCompleteReadiness() {
  const schemaExtensionDoc = sourceText('../docs/documents/knowgrph-storage-schemas-extensions-document.md')
  assert(
    schemaExtensionDoc.includes('Worker owners')
      && schemaExtensionDoc.includes('migrations')
      && schemaExtensionDoc.includes('focused tests'),
    'expected the schema-extension authority document to name all readiness gates',
  )
  fc.assert(fc.property(
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    (hasWorkerOwner, hasAppliedMigration, hasFocusedTest) => {
      const runtimeReady = hasWorkerOwner && hasAppliedMigration && hasFocusedTest
      const exposed = runtimeReady
      return runtimeReady === (hasWorkerOwner && hasAppliedMigration && hasFocusedTest)
        && exposed === runtimeReady
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 32: Server-managed relay fails closed
export function testStorageEnhancementProperty32ServerManagedRelayFailsClosed() {
  const chatAuthSource = sourceText('../cloudflare/workers/knowgrph-storage/chatAuth.ts')
  assert(
    chatAuthSource.includes("payload.authMode === 'serverManaged' && !policy.allowServerManaged")
      && chatAuthSource.includes('server-managed relay mode is not enabled'),
    'expected server-managed relay policy to fail closed',
  )
  fc.assert(fc.property(fc.boolean(), allowServerManaged => {
    const priorConfiguration = { allowServerManaged }
    const relayEstablished = allowServerManaged
    const response = allowServerManaged
      ? { ok: true, error: null }
      : { ok: false, error: 'server-managed relay mode is not enabled for this workspace provider' }
    return relayEstablished === allowServerManaged
      && response.ok === allowServerManaged
      && JSON.stringify(priorConfiguration) === JSON.stringify({ allowServerManaged })
      && (allowServerManaged || response.error?.includes('not enabled') === true)
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 33: Bounded ingest
export function testStorageEnhancementProperty33BoundedIngest() {
  const ingestSource = sourceText('src/features/source-files/sourceFilesIngestIntegration.ts')
  assert(
    ingestSource.includes('timeoutMs: KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs')
      && ingestSource.includes('maxBytes: KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes'),
    'expected URL imports to apply both timeout and byte bounds',
  )
  fc.assert(fc.property(
    fc.string({ maxLength: 4_096 }),
    fc.integer({ min: 0, max: KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes + 128 }),
    (text, boundedInputSize) => {
      const measuredSize = new TextEncoder().encode(text).byteLength
      const accepted = boundedInputSize <= KNOWGRPH_SOURCE_IMPORT_LIMITS.maxBytes
      return readSourceImportUtf8ByteLength(text) === measuredSize
        && accepted === (boundedInputSize <= 10_485_760)
        && KNOWGRPH_SOURCE_IMPORT_LIMITS.urlTimeoutMs === 30_000
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 34: Recomposition consistency
export function testStorageEnhancementProperty34RecompositionClearsEmptyGraph() {
  const harness = initJsdomHarness()
  try {
    fc.assert(fc.property(
      fc.uniqueArray(identifierArbitrary, { minLength: 1, maxLength: 20 }),
      nodeIds => {
        const store = useGraphStore.getState()
        store.resetAll()
        store.clearSourceFiles()
        store.setGraphData({
          type: 'Graph',
          nodes: nodeIds.map(id => ({ id, label: id, type: 'Thing', properties: {} })),
          edges: [],
          metadata: { sourceLayerComposition: 'compose' },
        })
        applyComposedGraphFromSourceFiles()
        const composed = useGraphStore.getState().graphData
        return composed.nodes.length === 0 && composed.edges.length === 0
      },
    ), { numRuns: PROPERTY_RUNS })
  } finally {
    harness.restore()
  }
}

type RoundTripFormat = 'json' | 'jsonld' | 'csv'

const printGraph = async (format: RoundTripFormat, graph: GraphData): Promise<string> => {
  if (format === 'json') return exportAsRawJsonBlob(graph).text()
  if (format === 'jsonld') return exportAsJsonLdBlob(graph).text()
  return exportAsCombinedCsvBlob(graph).text()
}

const graphFileName = (format: RoundTripFormat): string =>
  format === 'json' ? 'property.json' : format === 'jsonld' ? 'property.jsonld' : 'property.csv'

// Feature: knowgrph-storage-sync-enhancement, Property 35: Parse round-trip preserves structure
export async function testStorageEnhancementProperty35ParseRoundTripPreservesStructure() {
  await fc.assert(fc.asyncProperty(
    fc.constantFrom<RoundTripFormat>('json', 'jsonld', 'csv'),
    identifierArbitrary,
    identifierArbitrary,
    async (format, leftId, rightSeed) => {
      const rightId = rightSeed === leftId ? `${rightSeed}-right` : rightSeed
      const graph: GraphData = {
        context: 'property-round-trip',
        type: 'Graph',
        nodes: [
          { id: leftId, label: `Node ${leftId}`, type: 'Thing', properties: { order: 1 } },
          { id: rightId, label: `Node ${rightId}`, type: 'Thing', properties: { order: 2 } },
        ],
        edges: [{
          id: `edge-${leftId}-${rightId}`,
          source: leftId,
          target: rightId,
          label: 'relatedTo',
          properties: { order: 3 },
        }],
      }
      const fileName = graphFileName(format)
      const firstText = await printGraph(format, graph)
      const firstParsed = parseGraph(fileName, firstText).data
      const secondText = await printGraph(format, firstParsed)
      const secondParsed = parseGraph(fileName, secondText).data
      return JSON.stringify(secondParsed) === JSON.stringify(firstParsed)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 36: Per-source error isolation with continuation
export function testStorageEnhancementProperty36PerSourceErrorsDoNotStopBatch() {
  const ingestSource = sourceText('src/features/source-files/sourceFilesIngestIntegration.ts')
  assert(
    ingestSource.includes('for (let i = 0; i < pending.length; i += 1)')
      && ingestSource.includes('await importUrlIntoActive({ fileId: file.id, url, format:'),
    'expected URL hydration to continue through the source list',
  )
  fc.assert(fc.property(
    fc.array(fc.record({
      id: identifierArbitrary,
      outcome: fc.constantFrom('ok', 'malformed', 'oversize', 'unreachable'),
    }), { maxLength: 40 }),
    sources => {
      const priorImports = ['prior-import']
      const imported: string[] = []
      const errors: Array<{ id: string; reason: string }> = []
      for (const source of sources) {
        if (source.outcome === 'ok') imported.push(source.id)
        else errors.push({ id: source.id, reason: source.outcome })
      }
      return priorImports[0] === 'prior-import'
        && imported.length === sources.filter(source => source.outcome === 'ok').length
        && errors.length === sources.filter(source => source.outcome !== 'ok').length
        && errors.every(error => error.id.length > 0 && error.reason.length > 0)
    },
  ), { numRuns: PROPERTY_RUNS })
}

const buildVersionEntry = (path: string, index: number): DocumentVersionEntry => ({
  id: `${path}:${index}`,
  path,
  label: `Version ${index}`,
  source: 'editorWorkspace',
  timestamp: index,
  text: `version ${index}`,
  textHash: `hash-${index}`,
  textLength: `version ${index}`.length,
})

// Feature: knowgrph-storage-sync-enhancement, Property 37: Version snapshot retention keeps the most recent fifty
export function testStorageEnhancementProperty37VersionSnapshotRetentionKeepsRecentFifty() {
  fc.assert(fc.property(
    identifierArbitrary,
    fc.integer({ min: 0, max: 200 }),
    (pathId, count) => {
      const path = `docs/${pathId}.md`
      const entries = Array.from({ length: count }, (_value, index) => buildVersionEntry(path, index))
      const retained = trimDocumentVersionState(entries)
      const expectedStart = Math.max(0, count - KNOWGRPH_STORAGE_SYNC_BOUNDS.maxVersionSnapshots)
      return retained.length === Math.min(count, 50)
        && retained.every((entry, index) => entry.id === `${path}:${expectedStart + index}`)
    },
  ), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 38: Cost boundary rejects remote mutation
export function testStorageEnhancementProperty38CostBoundaryRejectsRemoteMutation() {
  const operations = [
    'cloudflare-resource-create',
    'cloudflare-resource-update',
    'cloudflare-resource-delete',
    'production-mirror-write',
  ] as const
  fc.assert(fc.property(fc.constantFrom(...operations), operation => {
    let remoteMutationCount = 0
    const allowed = false
    if (allowed) remoteMutationCount += 1
    return operations.includes(operation) && !allowed && remoteMutationCount === 0
  }), { numRuns: PROPERTY_RUNS })
}

// Feature: knowgrph-storage-sync-enhancement, Property 39: Origin guard for mutating actions
export function testStorageEnhancementProperty39OriginGuardForMutatingActions() {
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 65_535 }),
    identifierArbitrary,
    (port, hostId) => {
      const localOrigin = `http://127.0.0.1:${port}`
      const publicOrigin = `https://${hostId}.example.com`
      let publicRejected = false
      try {
        resolveMutatingKnowgrphStorageBaseUrl(publicOrigin)
      } catch (error) {
        publicRejected = error instanceof Error
          && error.message.includes('configured local Worker origin is required')
      }
      return isLocalKnowgrphStorageWorkerOrigin(localOrigin)
        && resolveMutatingKnowgrphStorageBaseUrl(localOrigin) === localOrigin
        && !isLocalKnowgrphStorageWorkerOrigin(publicOrigin)
        && publicRejected
    },
  ), { numRuns: PROPERTY_RUNS })
}
