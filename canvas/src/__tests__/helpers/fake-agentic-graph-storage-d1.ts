import { mutateFakeMediaArtifacts } from './fake-agentic-graph-storage-media-artifacts'
import { FakeAgenticGraphStorageR2Bucket } from './fake-agentic-graph-storage-r2'
import { createZeroCostR2TestVerifier } from '../../../../cloudflare/shared/r2-cost-gate.test-utils.mjs'
import { runNativeStorageStatements, type NativeStorageStatement } from './native-agentic-graph-storage-d1'
import {
  readFakeAgenticGraphStorageRawRows,
  readFakeAgenticGraphStorageRows,
  type FakeRow,
} from './fake-agentic-graph-storage-d1-reads'

const normalizeSql = (sql: string): string =>
  String(sql || '')
    .toLowerCase()
    .replace(/["`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

type FakeD1BlobObjectRow = { object_key: string; content_type: string; content_hash: string | null; custom_metadata_json: string; size_bytes: number; etag: string; updated_at: string }
type FakeD1BlobReadRow = FakeD1BlobObjectRow & { chunk_index: number | null; body: Uint8Array | null }

export class FakeAgenticGraphStorageD1Database {
  statementTime = () => new Date().toISOString()
  d1BlobObjects = new Map<string, FakeD1BlobObjectRow>()
  d1BlobChunks = new Map<string, Uint8Array[]>()
  private d1BlobUsedBytes = 0
  workspaces = new Map<string, FakeRow>()
  documents = new Map<string, FakeRow>()
  mediaArtifacts = new Map<string, FakeRow>()
  documentChunks = new Map<string, FakeRow>()
  graphSnapshots = new Map<string, FakeRow>()
  storageChildState = new Map<string, FakeRow>()
  storageChildSequence = 0
  private nativeStatements = new WeakMap<object, () => NativeStorageStatement>()
  syncDevices = new Map<string, FakeRow>()
  syncEvents = new Map<string, FakeRow>()
  users = new Map<string, FakeRow>()
  authSessions = new Map<string, FakeRow>()
  workspaceMemberships = new Map<string, FakeRow>()
  workspaceProviderPolicies = new Map<string, FakeRow>()
  documentPublications = new Map<string, FakeRow>()
  chatProxyAudit = new Map<string, FakeRow>()
  stripeCheckoutSessions = new Map<string, FakeRow>()
  stripeWebhookEvents = new Map<string, FakeRow>()
  agenticCommerceSessions = new Map<string, FakeRow>()
  agenticCommerceProofs = new Map<string, FakeRow>()
  agenticCommerceTraceEvents = new Map<string, FakeRow>()
  storageRecordWriteCounts = {
    documents: 0,
    documentChunks: 0,
    graphSnapshots: 0,
  }

  prepare(sql: string) {
    let boundValues: unknown[] = []
    const statement = {
      bind(...values: unknown[]) {
        boundValues = values
        return statement
      },
      run: async () => {
        this.applyMutation(sql, boundValues)
        return { success: true }
      },
      all: async <T = FakeRow>() => {
        if (normalizeSql(sql).includes('agentic_graph_d1_blob_objects')) {
          return { results: this.readD1BlobRows(sql, boundValues) as T[] }
        }
        return { results: this.readRows(sql, boundValues) as T[] }
      },
      raw: async <T = unknown[]>() => {
        return this.readRawRows(sql, boundValues) as T[]
      },
    }
    this.nativeStatements.set(statement, () => ({ sql, values: [...boundValues] }))
    return statement
  }

  async batch(statements: object[]) {
    const inputs = statements.map(statement => {
      const input = this.nativeStatements.get(statement)
      if (!input) throw new Error('Storage batch requires statements from this fixture database')
      return input()
    })
    const blobInputs = inputs.filter(input => normalizeSql(input.sql).includes('agentic_graph_d1_blob_'))
    if (blobInputs.length > 0) {
      if (blobInputs.length !== inputs.length) throw new Error('D1 blob batches cannot mix table owners')
      const nextObjects = new Map(this.d1BlobObjects), nextChunks = new Map(this.d1BlobChunks)
      let nextUsedBytes = this.d1BlobUsedBytes
      for (const { sql, values } of blobInputs) {
        const normalized = normalizeSql(sql), key = String(values[0] || '')
        if (normalized.startsWith('delete from agentic_graph_d1_blob_chunks')) nextChunks.delete(key)
        else if (normalized.startsWith('delete from agentic_graph_d1_blob_objects')) {
          const previous = nextObjects.get(key)
          if (previous) nextUsedBytes -= previous.size_bytes
          nextObjects.delete(key)
        } else if (normalized.includes('insert into agentic_graph_d1_blob_objects')) {
          const object: FakeD1BlobObjectRow = { object_key: key, content_type: String(values[1]),
            content_hash: values[2] as string | null, custom_metadata_json: String(values[3]),
            size_bytes: Number(values[4]), etag: String(values[5]), updated_at: String(values[6]) }
          if (nextUsedBytes + object.size_bytes > 67_108_864) throw new Error('graph_d1_blob_quota_exceeded')
          nextUsedBytes += object.size_bytes
          nextObjects.set(key, object)
        } else if (normalized.includes('insert into agentic_graph_d1_blob_chunks')) {
          const chunks = nextChunks.get(key) || []
          chunks[Number(values[1])] = values[2] as Uint8Array
          nextChunks.set(key, chunks)
        }
      }
      this.d1BlobObjects.clear()
      for (const [key, value] of nextObjects) this.d1BlobObjects.set(key, value)
      this.d1BlobChunks.clear()
      for (const [key, value] of nextChunks) this.d1BlobChunks.set(key, value)
      this.d1BlobUsedBytes = nextUsedBytes
      return statements.map(() => ({ success: true }))
    }
    return runNativeStorageStatements(this, inputs)
  }

  private applyMutation(sql: string, values: unknown[]) {
    const normalizedSql = normalizeSql(sql)
    if (mutateFakeMediaArtifacts(this.mediaArtifacts, normalizedSql, values)) return
    if (normalizedSql.includes('insert into workspaces')) {
      const [id, slug, title, createdAt, updatedAt] = values
      this.workspaces.set(String(id), { id, slug, title, visibility: 'private', created_at: createdAt, updated_at: updatedAt })
      return
    }
    if (normalizedSql.includes('insert into sync_devices')) {
      const [id, workspaceId, deviceLabel, updatedAt] = values
      const existing = this.syncDevices.get(String(id)) || {}
      this.syncDevices.set(String(id), {
        ...existing,
        id,
        workspace_id: workspaceId,
        device_label: deviceLabel,
        last_pull_cursor: existing.last_pull_cursor ?? null,
        last_push_cursor: existing.last_push_cursor ?? null,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('insert into sync_events')) {
      const [id, workspaceId, deviceId, eventType, payloadJson, createdAt] = values
      this.syncEvents.set(String(id), {
        id,
        workspace_id: workspaceId,
        device_id: deviceId,
        event_type: eventType,
        payload_json: payloadJson,
        created_at: createdAt,
      })
      return
    }
    if (normalizedSql.includes('insert into chat_proxy_audit')) {
      const [
        id,
        workspaceId,
        userId,
        membershipId,
        providerId,
        authMode,
        requestId,
        upstreamStatus,
        relayStatus,
        modelId,
        requestBytes,
        responseBytes,
        latencyMs,
        errorCode,
        errorMessage,
        createdAt,
      ] = values
      this.chatProxyAudit.set(String(id), {
        id,
        workspace_id: workspaceId,
        user_id: userId,
        membership_id: membershipId,
        provider_id: providerId,
        auth_mode: authMode,
        request_id: requestId ?? null,
        upstream_status: upstreamStatus ?? null,
        relay_status: relayStatus,
        model_id: modelId ?? null,
        request_bytes: requestBytes ?? null,
        response_bytes: responseBytes ?? null,
        latency_ms: latencyMs ?? null,
        error_code: errorCode ?? null,
        error_message: errorMessage ?? null,
        created_at: createdAt,
      })
      return
    }
    if (
      normalizedSql.startsWith('delete from sync_events')
      && normalizedSql.includes('created_at < ?')
    ) {
      const cutoff = String(values[0] || '')
      for (const [id, row] of this.syncEvents.entries()) {
        if (String(row.created_at || '') < cutoff) this.syncEvents.delete(id)
      }
      return
    }
    if (normalizedSql.includes('insert into documents')) {
      this.storageRecordWriteCounts.documents += 1
      const [
        id,
        workspaceId,
        canonicalPath,
        title,
        docType,
        lang,
        graphId,
        sourceKind,
        contentMd,
        contentHash,
        parserVersion,
        revision,
        deleted,
        createdAt,
      ] = values
      const existingByPath = Array.from(this.documents.entries()).find(
        ([, row]) => row.workspace_id === workspaceId && row.canonical_path === canonicalPath,
      )
      const targetId = String(existingByPath?.[0] || id)
      const existing = this.documents.get(targetId) || {}
      this.documents.set(targetId, {
        ...existing,
        id: targetId,
        workspace_id: workspaceId,
        canonical_path: canonicalPath,
        title,
        doc_type: docType,
        lang,
        graph_id: graphId,
        source_kind: sourceKind,
        content_md: contentMd,
        content_hash: contentHash,
        parser_version: parserVersion,
        revision,
        deleted,
        created_at: existing.created_at || createdAt,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('update documents set')) {
      this.storageRecordWriteCounts.documents += 1
      const [
        canonicalPath,
        title,
        docType,
        lang,
        graphId,
        sourceKind,
        contentMd,
        contentHash,
        parserVersion,
        revision,
        deleted,
        id,
        workspaceId,
      ] = values
      const existing = this.documents.get(String(id))
      if (!existing || existing.workspace_id !== workspaceId) return
      this.documents.set(String(id), {
        ...existing,
        canonical_path: canonicalPath,
        title,
        doc_type: docType,
        lang,
        graph_id: graphId,
        source_kind: sourceKind,
        content_md: contentMd,
        content_hash: contentHash,
        parser_version: parserVersion,
        revision,
        deleted,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('insert into document_chunks')) {
      this.storageRecordWriteCounts.documentChunks += 1
      const [id, documentId, workspaceId, chunkKey, chunkOrder, heading, markdown, tokenEstimate, contentHash] = values
      this.documentChunks.set(String(id), {
        id,
        document_id: documentId,
        workspace_id: workspaceId,
        chunk_key: chunkKey,
        chunk_order: chunkOrder,
        heading,
        markdown,
        token_estimate: tokenEstimate,
        content_hash: contentHash,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('update document_chunks set')) {
      this.storageRecordWriteCounts.documentChunks += 1
      const [documentId, workspaceId, chunkKey, chunkOrder, heading, markdown, tokenEstimate, contentHash, id] = values
      const existing = this.documentChunks.get(String(id))
      if (!existing || existing.workspace_id !== workspaceId) return
      this.documentChunks.set(String(id), {
        ...existing,
        document_id: documentId,
        workspace_id: workspaceId,
        chunk_key: chunkKey,
        chunk_order: chunkOrder,
        heading,
        markdown,
        token_estimate: tokenEstimate,
        content_hash: contentHash,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('delete from document_chunks')) {
      this.documentChunks.delete(String(values[0]))
      return
    }
    if (normalizedSql.includes('insert into graph_snapshots')) {
      this.storageRecordWriteCounts.graphSnapshots += 1
      const [id, documentId, workspaceId, graphRevision, graphHash, graphJson, layoutJson, derivedFromDocumentRevision] = values
      this.graphSnapshots.set(String(id), {
        id,
        document_id: documentId,
        workspace_id: workspaceId,
        graph_revision: graphRevision,
        graph_hash: graphHash,
        graph_json: graphJson,
        layout_json: layoutJson,
        derived_from_document_revision: derivedFromDocumentRevision,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('update graph_snapshots set')) {
      this.storageRecordWriteCounts.graphSnapshots += 1
      const [
        documentId,
        workspaceId,
        graphRevision,
        graphHash,
        graphJson,
        layoutJson,
        derivedFromDocumentRevision,
        id,
      ] = values
      const existing = this.graphSnapshots.get(String(id))
      if (!existing || existing.workspace_id !== workspaceId) return
      this.graphSnapshots.set(String(id), {
        ...existing,
        document_id: documentId,
        workspace_id: workspaceId,
        graph_revision: graphRevision,
        graph_hash: graphHash,
        graph_json: graphJson,
        layout_json: layoutJson,
        derived_from_document_revision: derivedFromDocumentRevision,
        updated_at: this.statementTime(),
      })
      return
    }
    if (normalizedSql.includes('insert into stripe_checkout_sessions')) {
      const [
        id,
        workspaceId,
        status,
        paymentStatus,
        mode,
        amountTotal,
        currency,
        customerId,
        customerEmail,
        url,
        metadataJson,
        createdAt,
        updatedAt,
        completedAt,
      ] = values
      const existing = this.stripeCheckoutSessions.get(String(id)) || {}
      this.stripeCheckoutSessions.set(String(id), {
        ...existing,
        id,
        workspace_id: workspaceId,
        status,
        payment_status: paymentStatus,
        mode,
        amount_total: amountTotal,
        currency,
        customer_id: customerId,
        customer_email: customerEmail,
        url: url || existing.url || null,
        metadata_json: metadataJson,
        created_at: existing.created_at || createdAt,
        updated_at: updatedAt,
        completed_at: completedAt || existing.completed_at || null,
      })
      return
    }
    if (normalizedSql.includes('insert into stripe_webhook_events')) {
      const [id, eventType, livemode, payloadHash, receivedAt, processedAt, processingStatus, processingError] = values
      this.stripeWebhookEvents.set(String(id), {
        id,
        event_type: eventType,
        livemode,
        payload_hash: payloadHash,
        received_at: receivedAt,
        processed_at: processedAt,
        processing_status: processingStatus || 'processed',
        processing_error: processingError || null,
      })
      return
    }
    if (normalizedSql.includes('update stripe_webhook_events')) {
      const existingByLastValue = this.stripeWebhookEvents.get(String(values[values.length - 1]))
      if (!existingByLastValue) return
      if (normalizedSql.includes('event_type = ?')) {
        const [eventType, livemode, payloadHash, receivedAt, processingStatus, id] = values
        this.stripeWebhookEvents.set(String(id), {
          ...existingByLastValue,
          event_type: eventType,
          livemode,
          payload_hash: payloadHash,
          received_at: receivedAt,
          processing_status: processingStatus,
          processing_error: null,
        })
        return
      }
      if (normalizedSql.includes('processed_at = ?')) {
        const [processedAt, processingStatus, id] = values
        this.stripeWebhookEvents.set(String(id), {
          ...existingByLastValue,
          processed_at: processedAt,
          processing_status: processingStatus,
          processing_error: null,
        })
        return
      }
      if (normalizedSql.includes('processing_error = ?')) {
        const [processingStatus, processingError, id] = values
        this.stripeWebhookEvents.set(String(id), {
          ...existingByLastValue,
          processing_status: processingStatus,
          processing_error: processingError,
        })
      }
      return
    }
    if (normalizedSql.includes('insert into agentic_commerce_sessions')) {
      const [
        id,
        sellerId,
        idempotencyKey,
        payloadHash,
        status,
        paymentRail,
        amountTotal,
        currency,
        payerDid,
        depositAddress,
        requestJson,
        responseJson,
        riskSignalsJson,
        createdAt,
        updatedAt,
        completedAt,
        cancelledAt,
      ] = values
      const existing = this.agenticCommerceSessions.get(String(id)) || {}
      this.agenticCommerceSessions.set(String(id), {
        ...existing,
        id,
        seller_id: sellerId,
        idempotency_key: idempotencyKey,
        payload_hash: payloadHash,
        status,
        payment_rail: paymentRail,
        amount_total: amountTotal,
        currency,
        payer_did: payerDid,
        deposit_address: depositAddress,
        request_json: existing.request_json || requestJson,
        response_json: responseJson,
        risk_signals_json: riskSignalsJson,
        created_at: existing.created_at || createdAt,
        updated_at: updatedAt,
        completed_at: completedAt || existing.completed_at || null,
        cancelled_at: cancelledAt || existing.cancelled_at || null,
      })
      return
    }
    if (normalizedSql.includes('update agentic_commerce_sessions')) {
      const [status, responseJson, riskSignalsJson, updatedAt, completedAt, cancelledAt, id] = values
      const existing = this.agenticCommerceSessions.get(String(id))
      if (existing) {
        this.agenticCommerceSessions.set(String(id), {
          ...existing,
          status,
          response_json: responseJson,
          risk_signals_json: riskSignalsJson,
          updated_at: updatedAt,
          completed_at: completedAt || existing.completed_at || null,
          cancelled_at: cancelledAt || existing.cancelled_at || null,
        })
      }
      return
    }
    if (normalizedSql.includes('insert into agentic_commerce_proofs')) {
      const [id, sessionId, proofJson, createdAt] = values
      this.agenticCommerceProofs.set(String(id), {
        id,
        session_id: sessionId,
        proof_json: proofJson,
        created_at: createdAt,
      })
      return
    }
    if (normalizedSql.includes('insert into agentic_commerce_trace_events')) {
      const [id, sessionId, eventType, payloadJson, createdAt] = values
      this.agenticCommerceTraceEvents.set(String(id), {
        id,
        session_id: sessionId,
        event_type: eventType,
        payload_json: payloadJson,
        created_at: createdAt,
      })
      return
    }
    if (normalizedSql.includes('delete from graph_snapshots')) {
      this.graphSnapshots.delete(String(values[0]))
      return
    }
    if (normalizedSql.includes('update sync_devices set last_push_cursor')) {
      const [cursor, updatedAt, id, workspaceId] = values
      const existing = this.syncDevices.get(String(id))
      if (existing && existing.workspace_id === workspaceId) {
        this.syncDevices.set(String(id), { ...existing, last_push_cursor: cursor, updated_at: updatedAt })
      }
      return
    }
    if (normalizedSql.includes('update sync_devices set last_pull_cursor')) {
      const [cursor, updatedAt, id, workspaceId] = values
      const existing = this.syncDevices.get(String(id))
      if (existing && existing.workspace_id === workspaceId) {
        this.syncDevices.set(String(id), { ...existing, last_pull_cursor: cursor, updated_at: updatedAt })
      }
    }
  }

  private readD1BlobRows(sql: string, values: unknown[]): FakeD1BlobReadRow[] {
    const object = this.d1BlobObjects.get(String(values[0] || ''))
    if (!object) return []
    const chunks = this.d1BlobChunks.get(object.object_key) || []
    return normalizeSql(sql).includes('left join agentic_graph_d1_blob_chunks')
      ? (chunks.length ? chunks.map((body, chunk_index) => ({ ...object, chunk_index, body }))
        : [{ ...object, chunk_index: null, body: null }])
      : [{ ...object, chunk_index: null, body: null }]
  }

  private readRows(sql: string, values: unknown[]): FakeRow[] {
    if (/^\s*WITH candidates AS MATERIALIZED\b/i.test(sql) || /\bFROM storage_child_state\b/i.test(sql)) {
      return runNativeStorageStatements(this, [{ sql, values }])[0]!.results
    }
    return readFakeAgenticGraphStorageRows(this, sql, values)
  }

  private readRawRows(sql: string, values: unknown[]): unknown[][] {
    return readFakeAgenticGraphStorageRawRows(this, sql, values)
  }
}

export const createFakeAgenticGraphStorageWorkerEnv = () => ({
  DB: new FakeAgenticGraphStorageD1Database(),
  AGENTIC_OS_STORAGE_BLOB_BUCKET: new FakeAgenticGraphStorageR2Bucket(),
  AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'true',
  verifyProviderCostEvidence: createZeroCostR2TestVerifier(),
})
