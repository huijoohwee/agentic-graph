import { FakeKnowgrphStorageR2Bucket } from './fakeKnowgrphStorageR2'
import {
  readFakeKnowgrphStorageRawRows,
  readFakeKnowgrphStorageRows,
  type FakeRow,
} from './fakeKnowgrphStorageD1Reads'

const normalizeSql = (sql: string): string =>
  String(sql || '')
    .toLowerCase()
    .replace(/["`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export class FakeKnowgrphStorageD1Database {
  workspaces = new Map<string, FakeRow>()
  documents = new Map<string, FakeRow>()
  documentChunks = new Map<string, FakeRow>()
  graphSnapshots = new Map<string, FakeRow>()
  syncDevices = new Map<string, FakeRow>()
  syncEvents = new Map<string, FakeRow>()
  users = new Map<string, FakeRow>()
  authSessions = new Map<string, FakeRow>()
  workspaceMemberships = new Map<string, FakeRow>()
  workspaceProviderPolicies = new Map<string, FakeRow>()
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
        return { results: this.readRows(sql, boundValues) as T[] }
      },
      raw: async <T = unknown[]>() => {
        return this.readRawRows(sql, boundValues) as T[]
      },
    }
    return statement
  }

  private applyMutation(sql: string, values: unknown[]) {
    const normalizedSql = normalizeSql(sql)
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
        updatedAt,
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
        updated_at: updatedAt,
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
        updatedAt,
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
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('insert into document_chunks')) {
      this.storageRecordWriteCounts.documentChunks += 1
      const [id, documentId, workspaceId, chunkKey, chunkOrder, heading, markdown, tokenEstimate, contentHash, updatedAt] = values
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
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('update document_chunks set')) {
      this.storageRecordWriteCounts.documentChunks += 1
      const [documentId, workspaceId, chunkKey, chunkOrder, heading, markdown, tokenEstimate, contentHash, updatedAt, id] = values
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
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('delete from document_chunks')) {
      this.documentChunks.delete(String(values[0]))
      return
    }
    if (normalizedSql.includes('insert into graph_snapshots')) {
      this.storageRecordWriteCounts.graphSnapshots += 1
      const [id, documentId, workspaceId, graphRevision, graphHash, graphJson, layoutJson, derivedFromDocumentRevision, updatedAt] = values
      this.graphSnapshots.set(String(id), {
        id,
        document_id: documentId,
        workspace_id: workspaceId,
        graph_revision: graphRevision,
        graph_hash: graphHash,
        graph_json: graphJson,
        layout_json: layoutJson,
        derived_from_document_revision: derivedFromDocumentRevision,
        updated_at: updatedAt,
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
        updatedAt,
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
        updated_at: updatedAt,
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

  private readRows(sql: string, values: unknown[]): FakeRow[] {
    return readFakeKnowgrphStorageRows(this, sql, values)
  }

  private readRawRows(sql: string, values: unknown[]): unknown[][] {
    return readFakeKnowgrphStorageRawRows(this, sql, values)
  }
}

export const createFakeKnowgrphStorageWorkerEnv = () => ({
  DB: new FakeKnowgrphStorageD1Database(),
  KNOWGRPH_STORAGE_BLOB_BUCKET: new FakeKnowgrphStorageR2Bucket(),
})
