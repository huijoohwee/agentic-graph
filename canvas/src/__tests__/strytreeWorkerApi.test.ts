import paymentWorkerModule from '../../../cloudflare/workers/agentic-graph-payment/index.ts'

type FakeRow = Record<string, unknown>

const normalizeSql = (sql: string): string =>
  String(sql || '').toLowerCase().replace(/\s+/g, ' ').trim()

class FakeStrytreeD1Database {
  users = new Map<string, FakeRow>()
  sessions = new Map<string, FakeRow>()
  stories = new Map<string, FakeRow>()
  nodes = new Map<string, FakeRow>()
  assets = new Map<string, FakeRow>()
  unlocks = new Map<string, FakeRow>()
  tokenLedger = new Map<string, FakeRow>()
  paymentSessions = new Map<string, FakeRow>()
  generationJobs = new Map<string, FakeRow>()
  candidateRuns = new Map<string, FakeRow>()
  branchCandidates = new Map<string, FakeRow>()
  mergePlans = new Map<string, FakeRow>()
  auditEvents = new Map<string, FakeRow>()

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
    }
    return statement
  }

  private applyMutation(sql: string, values: unknown[]) {
    const normalizedSql = normalizeSql(sql)
    if (normalizedSql.includes('insert into strytree_token_ledger')) {
      const [
        id,
        userId,
        eventType,
        amountCredits,
        balanceAfterCredits,
        relatedObjectType,
        relatedObjectId,
        providerEventId,
        idempotencyKey,
        metadataJson,
        createdAt,
      ] = values
      this.tokenLedger.set(String(id), {
        id,
        user_id: userId,
        event_type: eventType,
        amount_credits: amountCredits,
        balance_after_credits: balanceAfterCredits,
        related_object_type: relatedObjectType,
        related_object_id: relatedObjectId,
        provider_event_id: providerEventId,
        idempotency_key: idempotencyKey,
        metadata_json: metadataJson,
        created_at: createdAt,
      })
      return
    }
    if (normalizedSql.includes('insert into strytree_unlocks')) {
      const [id, userId, nodeId, ledgerEventId, idempotencyKey, createdAt] = values
      this.unlocks.set(String(id), {
        id,
        user_id: userId,
        node_id: nodeId,
        ledger_event_id: ledgerEventId,
        idempotency_key: idempotencyKey,
        created_at: createdAt,
      })
      return
    }
    if (normalizedSql.includes('insert into strytree_payment_sessions')) {
      const [
        id,
        userId,
        packageId,
        status,
        provider,
        providerSessionId,
        amountTotal,
        currency,
        creditAmount,
        idempotencyKey,
        requestJson,
        responseJson,
        createdAt,
        updatedAt,
        completedAt,
      ] = values
      this.paymentSessions.set(String(id), {
        id,
        user_id: userId,
        package_id: packageId,
        status,
        provider,
        provider_session_id: providerSessionId,
        amount_total: amountTotal,
        currency,
        credit_amount: creditAmount,
        idempotency_key: idempotencyKey,
        request_json: requestJson,
        response_json: responseJson,
        created_at: createdAt,
        updated_at: updatedAt,
        completed_at: completedAt,
      })
      return
    }
    if (normalizedSql.includes('update strytree_payment_sessions')) {
      const [status, responseJson, updatedAt, completedAt, id, userId] = values
      const row = this.paymentSessions.get(String(id))
      if (row && row.user_id === userId) {
        this.paymentSessions.set(String(id), {
          ...row,
          status,
          response_json: responseJson,
          updated_at: updatedAt,
          completed_at: completedAt,
        })
      }
      return
    }
    if (normalizedSql.includes('insert into strytree_generation_jobs')) {
      const [
        id,
        userId,
        storyId,
        parentNodeId,
        status,
        debitLedgerEventId,
        refundLedgerEventId,
        provider,
        providerJobId,
        requestJson,
        resultJson,
        fallbackArtifactJson,
        errorCode,
        errorMessage,
        createdAt,
        updatedAt,
      ] = values
      this.generationJobs.set(String(id), {
        id,
        user_id: userId,
        story_id: storyId,
        parent_node_id: parentNodeId,
        status,
        debit_ledger_event_id: debitLedgerEventId,
        refund_ledger_event_id: refundLedgerEventId,
        provider,
        provider_job_id: providerJobId,
        request_json: requestJson,
        result_json: resultJson,
        fallback_artifact_json: fallbackArtifactJson,
        error_code: errorCode,
        error_message: errorMessage,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('update strytree_generation_jobs')) {
      const rowId = String(values[values.length - 1])
      const row = this.generationJobs.get(rowId)
      if (!row) return
      if (normalizedSql.includes('provider_job_id')) {
        const [status, providerJobId, resultJson, errorCode, errorMessage, updatedAt] = values
        this.generationJobs.set(rowId, {
          ...row,
          status,
          provider_job_id: providerJobId,
          result_json: resultJson,
          error_code: errorCode,
          error_message: errorMessage,
          updated_at: updatedAt,
        })
        return
      }
      if (normalizedSql.includes('refund_ledger_event_id')) {
        const [status, refundLedgerEventId, fallbackArtifactJson, errorCode, errorMessage, updatedAt] = values
        this.generationJobs.set(rowId, {
          ...row,
          status,
          refund_ledger_event_id: refundLedgerEventId,
          fallback_artifact_json: fallbackArtifactJson,
          error_code: errorCode,
          error_message: errorMessage,
          updated_at: updatedAt,
        })
        return
      }
      const [status, updatedAt] = values
      this.generationJobs.set(rowId, { ...row, status, updated_at: updatedAt })
      return
    }
    if (normalizedSql.includes('update strytree_nodes set paid_unlocks_count')) {
      const [updatedAt, id] = values
      const row = this.nodes.get(String(id))
      if (row) {
        this.nodes.set(String(id), {
          ...row,
          paid_unlocks_count: Number(row.paid_unlocks_count || 0) + 1,
          updated_at: updatedAt,
        })
      }
      return
    }
    if (normalizedSql.includes('insert into strytree_candidate_runs')) {
      const [
        id,
        userId,
        storyId,
        parentNodeId,
        status,
        maxCandidates,
        quotedCostCredits,
        idempotencyKey,
        requestJson,
        scorecardJson,
        createdAt,
        updatedAt,
      ] = values
      this.candidateRuns.set(String(id), {
        id,
        user_id: userId,
        story_id: storyId,
        parent_node_id: parentNodeId,
        status,
        max_candidates: maxCandidates,
        quoted_cost_credits: quotedCostCredits,
        idempotency_key: idempotencyKey,
        request_json: requestJson,
        scorecard_json: scorecardJson,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('insert into strytree_branch_candidates')) {
      const [
        id,
        candidateRunId,
        generationJobId,
        userId,
        storyId,
        parentNodeId,
        provider,
        status,
        title,
        synopsis,
        prompt,
        videoObjectKey,
        thumbnailObjectKey,
        creditCost,
        elapsedMs,
        inheritedAssetCount,
        continuityScore,
        moderationStatus,
        publishEligible,
        resultJson,
        tokenCostJson,
        createdAt,
        updatedAt,
      ] = values
      this.branchCandidates.set(String(id), {
        id,
        candidate_run_id: candidateRunId,
        generation_job_id: generationJobId,
        user_id: userId,
        story_id: storyId,
        parent_node_id: parentNodeId,
        provider,
        status,
        title,
        synopsis,
        prompt,
        video_object_key: videoObjectKey,
        thumbnail_object_key: thumbnailObjectKey,
        credit_cost: creditCost,
        elapsed_ms: elapsedMs,
        inherited_asset_count: inheritedAssetCount,
        continuity_score: continuityScore,
        moderation_status: moderationStatus,
        publish_eligible: publishEligible,
        result_json: resultJson,
        token_cost_json: tokenCostJson,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('insert into strytree_nodes')) {
      const [
        id,
        storyId,
        parentNodeId,
        selectedCandidateId,
        creatorUserId,
        title,
        synopsis,
        prompt,
        status,
        visibility,
        isFreeWindow,
        unlockPriceCredits,
        videoObjectKey,
        thumbnailObjectKey,
        ageDays,
        likesCount,
        impressionsCount,
        paidUnlocksCount,
        moderationStatus,
        createdAt,
        updatedAt,
      ] = values
      this.nodes.set(String(id), {
        id,
        story_id: storyId,
        parent_node_id: parentNodeId,
        selected_candidate_id: selectedCandidateId,
        creator_user_id: creatorUserId,
        title,
        synopsis,
        prompt,
        status,
        visibility,
        is_free_window: isFreeWindow,
        unlock_price_credits: unlockPriceCredits,
        video_object_key: videoObjectKey,
        thumbnail_object_key: thumbnailObjectKey,
        age_days: ageDays,
        likes_count: likesCount,
        impressions_count: impressionsCount,
        paid_unlocks_count: paidUnlocksCount,
        moderation_status: moderationStatus,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('insert into strytree_candidate_merge_plans')) {
      const [
        id,
        userId,
        storyId,
        parentNodeId,
        selectedCandidateId,
        status,
        mergeJson,
        publishedNodeId,
        idempotencyKey,
        createdAt,
        updatedAt,
      ] = values
      this.mergePlans.set(String(id), {
        id,
        user_id: userId,
        story_id: storyId,
        parent_node_id: parentNodeId,
        selected_candidate_id: selectedCandidateId,
        status,
        merge_json: mergeJson,
        published_node_id: publishedNodeId,
        idempotency_key: idempotencyKey,
        created_at: createdAt,
        updated_at: updatedAt,
      })
      return
    }
    if (normalizedSql.includes('update strytree_branch_candidates set status')) {
      const [status, updatedAt, id] = values
      const row = this.branchCandidates.get(String(id))
      if (row) this.branchCandidates.set(String(id), { ...row, status, updated_at: updatedAt })
      return
    }
    if (normalizedSql.includes('update strytree_stories set snapshot_version')) {
      const [updatedAt, id] = values
      const row = this.stories.get(String(id))
      if (row) {
        this.stories.set(String(id), {
          ...row,
          snapshot_version: Number(row.snapshot_version || 1) + 1,
          updated_at: updatedAt,
        })
      }
      return
    }
    if (normalizedSql.includes('insert into strytree_audit_events')) {
      const [id, actorUserId, action, objectType, objectId, status, idempotencyKey, metadataJson, createdAt] = values
      this.auditEvents.set(String(id), {
        id,
        actor_user_id: actorUserId,
        action,
        object_type: objectType,
        object_id: objectId,
        status,
        idempotency_key: idempotencyKey,
        metadata_json: metadataJson,
        created_at: createdAt,
      })
    }
  }

  private readRows(sql: string, values: unknown[]): FakeRow[] {
    const normalizedSql = normalizeSql(sql)
    if (normalizedSql.includes('select user_id from strytree_sessions')) {
      const [id, nowIso] = values
      const row = this.sessions.get(String(id))
      return row && String(row.expires_at || '') > String(nowIso || '') ? [{ user_id: row.user_id }] : []
    }
    if (normalizedSql.includes('select id, display_name, role from strytree_users')) {
      const row = this.users.get(String(values[0]))
      return row ? [{ id: row.id, display_name: row.display_name, role: row.role }] : []
    }
    if (normalizedSql.includes('from strytree_stories') && normalizedSql.includes('where id = ? or slug = ?')) {
      const [id, slug] = values
      return Array.from(this.stories.values()).filter(row => row.id === id || row.slug === slug).slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_nodes') && normalizedSql.includes('where id = ?')) {
      const row = this.nodes.get(String(values[0]))
      return row ? [row] : []
    }
    if (normalizedSql.includes('from strytree_nodes') && normalizedSql.includes('where story_id = ?')) {
      return Array.from(this.nodes.values())
        .filter(row => row.story_id === values[0])
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    }
    if (normalizedSql.includes('from strytree_assets') && normalizedSql.includes('where story_id = ?')) {
      return Array.from(this.assets.values()).filter(row => row.story_id === values[0])
    }
    if (normalizedSql.includes('select node_id from strytree_unlocks')) {
      return Array.from(this.unlocks.values())
        .filter(row => row.user_id === values[0])
        .map(row => ({ node_id: row.node_id }))
    }
    if (normalizedSql.includes('select ledger_event_id from strytree_unlocks')) {
      return Array.from(this.unlocks.values())
        .filter(row => row.user_id === values[0] && row.node_id === values[1])
        .slice(0, 1)
        .map(row => ({ ledger_event_id: row.ledger_event_id }))
    }
    if (normalizedSql.includes('select balance_after_credits') && normalizedSql.includes('from strytree_token_ledger')) {
      return Array.from(this.tokenLedger.values())
        .filter(row => row.user_id === values[0])
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 1)
        .map(row => ({ balance_after_credits: row.balance_after_credits }))
    }
    if (normalizedSql.includes('from strytree_token_ledger') && normalizedSql.includes('user_id = ? and idempotency_key = ?')) {
      const [userId, idempotencyKey] = values
      return Array.from(this.tokenLedger.values())
        .filter(row => row.user_id === userId && row.idempotency_key === idempotencyKey)
        .slice(0, 1)
        .map(row => ({ id: row.id, balance_after_credits: row.balance_after_credits }))
    }
    if (normalizedSql.includes('from strytree_token_ledger') && normalizedSql.includes('related_object_type = ?') && normalizedSql.includes('related_object_id = ?')) {
      const [userId, relatedObjectType, relatedObjectId] = values
      return Array.from(this.tokenLedger.values())
        .filter(row => row.user_id === userId && row.related_object_type === relatedObjectType && row.related_object_id === relatedObjectId)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 1)
        .map(row => ({ id: row.id, balance_after_credits: row.balance_after_credits }))
    }
    if (normalizedSql.includes('from strytree_payment_sessions') && normalizedSql.includes('user_id = ? and idempotency_key = ?')) {
      return Array.from(this.paymentSessions.values())
        .filter(row => row.user_id === values[0] && row.idempotency_key === values[1])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_payment_sessions') && normalizedSql.includes('where id = ? limit 1')) {
      return Array.from(this.paymentSessions.values())
        .filter(row => row.id === values[0])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_payment_sessions') && normalizedSql.includes('where provider_session_id = ?')) {
      return Array.from(this.paymentSessions.values())
        .filter(row => row.provider_session_id === values[0])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_payment_sessions') && normalizedSql.includes('where user_id = ? and status = ?')) {
      return Array.from(this.paymentSessions.values())
        .filter(row => row.user_id === values[0] && row.status === values[1])
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    }
    if (normalizedSql.includes('from strytree_payment_sessions') && normalizedSql.includes('id = ? and user_id = ?')) {
      return Array.from(this.paymentSessions.values())
        .filter(row => row.id === values[0] && row.user_id === values[1])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_generation_jobs') && normalizedSql.includes('id = ? and user_id = ?')) {
      return Array.from(this.generationJobs.values())
        .filter(row => row.id === values[0] && row.user_id === values[1])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_generation_jobs') && normalizedSql.includes('where id = ?')) {
      const row = this.generationJobs.get(String(values[0]))
      return row ? [row] : []
    }
    if (normalizedSql.includes('from strytree_candidate_runs') && normalizedSql.includes('user_id = ? and idempotency_key = ?')) {
      return Array.from(this.candidateRuns.values())
        .filter(row => row.user_id === values[0] && row.idempotency_key === values[1])
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_candidate_runs') && normalizedSql.includes('id = ? and user_id = ?')) {
      const [id, userId] = values
      return Array.from(this.candidateRuns.values())
        .filter(row => row.id === id && row.user_id === userId)
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_branch_candidates') && normalizedSql.includes('where candidate_run_id = ?')) {
      return Array.from(this.branchCandidates.values())
        .filter(row => row.candidate_run_id === values[0])
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
    }
    if (normalizedSql.includes('from strytree_branch_candidates') && normalizedSql.includes('where id = ? and user_id = ?')) {
      const [id, userId] = values
      return Array.from(this.branchCandidates.values())
        .filter(row => row.id === id && row.user_id === userId)
        .slice(0, 1)
    }
    if (normalizedSql.includes('from strytree_candidate_merge_plans') && normalizedSql.includes('selected_candidate_id = ?')) {
      return Array.from(this.mergePlans.values())
        .filter(row => row.selected_candidate_id === values[0])
        .slice(0, 1)
        .map(row => ({ published_node_id: row.published_node_id }))
    }
    return []
  }
}

class FakeQueue {
  messages: unknown[] = []

  async send(body: unknown): Promise<void> {
    this.messages.push(body)
  }
}

class FakeR2Bucket {
  objects = new Map<string, unknown>()

  async put(key: string, value: unknown): Promise<void> {
    this.objects.set(key, value)
  }
}

class FakeKVNamespace {
  values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) || null
  }
}

const worker = (
  typeof (paymentWorkerModule as { fetch?: unknown }).fetch === 'function'
    ? paymentWorkerModule
    : (paymentWorkerModule as unknown as { default: typeof paymentWorkerModule }).default
) as typeof paymentWorkerModule

const paymentModule = paymentWorkerModule as unknown as {
  StrytreeCreditLedgerActor: new (state: unknown, env: Record<string, unknown>) => { fetch: (request: Request) => Promise<Response> }
}

class FakeStrytreeCreditLedgerNamespace {
  constructor(private readonly db: FakeStrytreeD1Database) {}

  idFromName(name: string): string {
    return name
  }

  get(id: unknown) {
    void id
    return {
      fetch: (request: Request) => {
        const actor = new paymentModule.StrytreeCreditLedgerActor({}, { DB: this.db })
        return actor.fetch(request)
      },
    }
  }

  getByName(name: string) {
    return this.get(name)
  }
}

const runWorkerQueue = async (
  env: Record<string, unknown>,
  body: unknown,
): Promise<{ acked: boolean; retried: boolean }> => {
  const state = { acked: false, retried: false }
  await (worker as unknown as {
    queue: (batch: { messages: Array<{ body: unknown; ack: () => void; retry: () => void }> }, env: Record<string, unknown>) => Promise<void>
  }).queue({
    messages: [{
      body,
      ack: () => {
        state.acked = true
      },
      retry: () => {
        state.retried = true
      },
    }],
  }, env)
  return state
}

const seedStrytreeEnv = () => {
  const db = new FakeStrytreeD1Database()
  const queue = new FakeQueue()
  const bucket = new FakeR2Bucket()
  const kv = new FakeKVNamespace()
  const creditLedger = new FakeStrytreeCreditLedgerNamespace(db)
  const now = '2026-05-31T00:00:00.000Z'
  db.users.set('user_creator', {
    id: 'user_creator',
    display_name: 'Creator',
    role: 'creator',
    created_at: now,
    updated_at: now,
  })
  db.users.set('user_fan', {
    id: 'user_fan',
    display_name: 'Fan',
    role: 'user',
    created_at: now,
    updated_at: now,
  })
  db.sessions.set('sess_fan', {
    id: 'sess_fan',
    user_id: 'user_fan',
    anonymous_subject: null,
    created_at: now,
    expires_at: '2027-01-01T00:00:00.000Z',
    linked_at: null,
  })
  db.stories.set('story_alpha', {
    id: 'story_alpha',
    slug: 'story-alpha',
    title: 'Orbit Archive',
    tagline: 'A server-owned storytree fixture',
    status: 'active',
    poster_object_key: 'r2://strytree/story_alpha/poster.png',
    root_node_id: 'node_root',
    snapshot_version: 1,
    created_at: now,
    updated_at: now,
  })
  db.nodes.set('node_root', {
    id: 'node_root',
    story_id: 'story_alpha',
    parent_node_id: null,
    selected_candidate_id: null,
    creator_user_id: 'user_creator',
    title: 'Beacon Hall Wakes',
    synopsis: 'An archive hall reopens after a long orbital silence.',
    prompt: 'Keep the archive hall visible and preserve the quiet recovery tone.',
    status: 'active',
    visibility: 'public',
    is_free_window: 1,
    unlock_price_credits: 0,
    video_object_key: 'r2://strytree/story_alpha/root.mp4',
    thumbnail_object_key: 'r2://strytree/story_alpha/root.jpg',
    age_days: 0,
    likes_count: 4,
    impressions_count: 20,
    paid_unlocks_count: 0,
    moderation_status: 'approved',
    created_at: now,
    updated_at: now,
  })
  db.nodes.set('node_locked', {
    id: 'node_locked',
    story_id: 'story_alpha',
    parent_node_id: 'node_root',
    selected_candidate_id: null,
    creator_user_id: 'user_creator',
    title: 'Archivist Hides The Map',
    synopsis: 'The archivist shields the route map until the crew commits.',
    prompt: 'Reveal a protected branch only after entitlement is granted.',
    status: 'active',
    visibility: 'public',
    is_free_window: 0,
    unlock_price_credits: 5,
    video_object_key: 'r2://strytree/story_alpha/locked.mp4',
    thumbnail_object_key: 'r2://strytree/story_alpha/locked.jpg',
    age_days: 1,
    likes_count: 6,
    impressions_count: 40,
    paid_unlocks_count: 0,
    moderation_status: 'approved',
    created_at: '2026-05-31T00:01:00.000Z',
    updated_at: '2026-05-31T00:01:00.000Z',
  })
  db.tokenLedger.set('ledger_seed', {
    id: 'ledger_seed',
    user_id: 'user_fan',
    event_type: 'purchase_credit',
    amount_credits: 40,
    balance_after_credits: 40,
    related_object_type: 'fixture',
    related_object_id: 'seed',
    provider_event_id: null,
    idempotency_key: 'seed',
    metadata_json: '{}',
    created_at: now,
  })
  return {
    env: {
      DB: db,
      STRYTREE_CREDIT_LEDGER: creditLedger,
      STRYTREE_GENERATION_QUEUE: queue,
      STRYTREE_MEDIA_BUCKET: bucket,
      STRYTREE_PROVIDER_BUDGET_KV: kv,
    },
    db,
    queue,
    bucket,
    kv,
    creditLedger,
  }
}

const sessionHeaders = (idempotencyKey = 'idem-1') => ({
  authorization: 'Bearer sess_fan',
  'content-type': 'application/json',
  'idempotency-key': idempotencyKey,
})

const signWebhookPayload = async (
  payload: string,
  secret: string,
): Promise<string> => {
  const timestamp = Math.floor(Date.now() / 1000)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const hex = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

export async function testStrytreeSnapshotAndUnlockRoutesUseServerOwnedD1State() {
  const { env, db } = seedStrytreeEnv()
  const publicSnapshot = await worker.fetch(
    new Request('https://airvio.co/api/strytree/stories/story_alpha/tree'),
    env as never,
  )
  if (!publicSnapshot.ok) throw new Error(`expected public snapshot ok, got ${publicSnapshot.status}`)
  const publicBody = await publicSnapshot.json() as { nodes: Array<Record<string, unknown>> }
  const lockedBefore = publicBody.nodes.find(node => node.id === 'node_locked')
  if (lockedBefore?.entitlement_hint !== 'locked' || lockedBefore?.video_object_key !== null) {
    throw new Error(`expected protected node to hide media before entitlement, got ${JSON.stringify(lockedBefore)}`)
  }

  const unlock = await worker.fetch(
    new Request('https://airvio.co/api/strytree/nodes/node_locked/unlock', {
      method: 'POST',
      headers: sessionHeaders('unlock-node-1'),
      body: JSON.stringify({ quote_id: 'quote-node-locked' }),
    }),
    env as never,
  )
  if (!unlock.ok) throw new Error(`expected unlock ok, got ${unlock.status}: ${await unlock.text()}`)
  const unlockBody = await unlock.json() as { entitlement?: string; balance_after_credits?: number; creator_credit_credits?: number }
  if (unlockBody.entitlement !== 'full' || unlockBody.balance_after_credits !== 35 || unlockBody.creator_credit_credits !== 4) {
    throw new Error(`expected unlock debit and split, got ${JSON.stringify(unlockBody)}`)
  }
  if (db.unlocks.size !== 1) throw new Error(`expected one persisted entitlement, got ${db.unlocks.size}`)
  const ledgerDebits = Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'unlock_debit')
  if (ledgerDebits.length !== 1 || ledgerDebits[0].amount_credits !== -5) {
    throw new Error(`expected one unlock debit ledger event, got ${JSON.stringify(ledgerDebits)}`)
  }
  const unlockMetadata = JSON.parse(String(ledgerDebits[0].metadata_json || '{}')) as { creator_credit_credits?: number; platform_fee_credits?: number }
  if (unlockMetadata.creator_credit_credits !== 4 || unlockMetadata.platform_fee_credits !== 1) {
    throw new Error(`expected unlock debit metadata to preserve creator credit and platform fee splits, got ${JSON.stringify(unlockMetadata)}`)
  }

  const replay = await worker.fetch(
    new Request('https://airvio.co/api/strytree/nodes/node_locked/unlock', {
      method: 'POST',
      headers: sessionHeaders('unlock-node-2'),
      body: JSON.stringify({ quote_id: 'quote-node-locked' }),
    }),
    env as never,
  )
  if (!replay.ok) throw new Error(`expected idempotent unlock replay ok, got ${replay.status}`)
  if (Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'unlock_debit').length !== 1) {
    throw new Error('expected repeated unlock to avoid a second debit')
  }

  const authedSnapshot = await worker.fetch(
    new Request('https://airvio.co/api/strytree/stories/story_alpha/tree', {
      headers: { authorization: 'Bearer sess_fan' },
    }),
    env as never,
  )
  const authedBody = await authedSnapshot.json() as { nodes: Array<Record<string, unknown>> }
  const lockedAfter = authedBody.nodes.find(node => node.id === 'node_locked')
  if (lockedAfter?.entitlement_hint !== 'full' || lockedAfter?.video_object_key !== 'r2://strytree/story_alpha/locked.mp4') {
    throw new Error(`expected protected node media after entitlement, got ${JSON.stringify(lockedAfter)}`)
  }
}

export async function testStrytreeCreditLedgerDurableObjectMutatesD1Atomically() {
  const { db } = seedStrytreeEnv()
  const actor = new paymentModule.StrytreeCreditLedgerActor({}, { DB: db })
  const mutation = {
    id: 'ledger_do_debit_1',
    user_id: 'user_fan',
    event_type: 'generation_debit',
    amount_credits: -5,
    related_object_type: 'strytree_generation_job',
    related_object_id: 'gen_do_1',
    idempotency_key: 'do-debit-1',
    metadata_json: JSON.stringify({ source: 'durable-object-test' }),
    created_at: '2026-05-31T00:02:00.000Z',
  }
  const debit = await actor.fetch(new Request('https://ledger.internal/mutations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mutation),
  }))
  if (!debit.ok) throw new Error(`expected durable object ledger debit ok, got ${debit.status}: ${await debit.text()}`)
  const debitBody = await debit.json() as { ledger_event_id?: string; balance_after_credits?: number; authority?: string; idempotent_replay?: boolean }
  if (
    debitBody.ledger_event_id !== 'ledger_do_debit_1' ||
    debitBody.balance_after_credits !== 35 ||
    debitBody.authority !== 'durable-object' ||
    debitBody.idempotent_replay !== false
  ) {
    throw new Error(`expected DO debit to insert ledger event and return balance, got ${JSON.stringify(debitBody)}`)
  }
  const row = db.tokenLedger.get('ledger_do_debit_1')
  if (row?.amount_credits !== -5 || row?.balance_after_credits !== 35) {
    throw new Error(`expected DO debit ledger row, got ${JSON.stringify(row)}`)
  }

  const replay = await actor.fetch(new Request('https://ledger.internal/mutations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...mutation, id: 'ledger_do_debit_replay_should_not_insert' }),
  }))
  if (!replay.ok) throw new Error(`expected DO debit replay ok, got ${replay.status}`)
  const replayBody = await replay.json() as { ledger_event_id?: string; balance_after_credits?: number; idempotent_replay?: boolean }
  if (replayBody.ledger_event_id !== 'ledger_do_debit_1' || replayBody.balance_after_credits !== 35 || replayBody.idempotent_replay !== true) {
    throw new Error(`expected DO idempotent replay to return existing event, got ${JSON.stringify(replayBody)}`)
  }
  if (Array.from(db.tokenLedger.values()).filter(row => row.id === 'ledger_do_debit_1' || row.id === 'ledger_do_debit_replay_should_not_insert').length !== 1) {
    throw new Error('expected DO replay to avoid duplicate ledger insert')
  }

  const insufficient = await actor.fetch(new Request('https://ledger.internal/mutations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...mutation,
      id: 'ledger_do_debit_too_large',
      amount_credits: -999,
      idempotency_key: 'do-debit-too-large',
    }),
  }))
  if (insufficient.status !== 402) throw new Error(`expected DO insufficient balance to return 402, got ${insufficient.status}`)
  if (db.tokenLedger.has('ledger_do_debit_too_large')) {
    throw new Error('expected DO insufficient balance to avoid ledger insert')
  }
}

export async function testStrytreeCandidateRunAndPublishPersistServerOwnedGraphState() {
  const { env, db, queue } = seedStrytreeEnv()
  const createRun = await worker.fetch(
    new Request('https://airvio.co/api/strytree/candidate-runs', {
      method: 'POST',
      headers: sessionHeaders('candidate-run-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        max_candidates: 3,
        prompt: 'Compare three continuation paths that preserve the archive recovery.',
      }),
    }),
    env as never,
  )
  if (createRun.status !== 202) throw new Error(`expected candidate run accepted, got ${createRun.status}: ${await createRun.text()}`)
  const createBody = await createRun.json() as { candidate_run_id?: string; quoted_cost_credits?: number; status?: string }
  if (!createBody.candidate_run_id || createBody.quoted_cost_credits !== 15 || createBody.status !== 'completed') {
    throw new Error(`expected completed bounded candidate run, got ${JSON.stringify(createBody)}`)
  }
  if (queue.messages.length !== 1) throw new Error(`expected queue notification for candidate run, got ${queue.messages.length}`)
  if (Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'candidate_run_debit').length !== 1) {
    throw new Error('expected candidate run to debit server-owned token ledger')
  }

  const getRun = await worker.fetch(
    new Request(`https://airvio.co/api/strytree/candidate-runs/${createBody.candidate_run_id}`, {
      headers: { authorization: 'Bearer sess_fan' },
    }),
    env as never,
  )
  if (!getRun.ok) throw new Error(`expected candidate run read ok, got ${getRun.status}`)
  const runBody = await getRun.json() as { scorecards?: Array<{ candidate_id?: string; publish_eligible?: boolean }> }
  if (runBody.scorecards?.length !== 3 || !runBody.scorecards.every(scorecard => scorecard.publish_eligible === true)) {
    throw new Error(`expected three publishable private scorecards, got ${JSON.stringify(runBody)}`)
  }
  const candidateId = String(runBody.scorecards[0].candidate_id || '')
  const publish = await worker.fetch(
    new Request(`https://airvio.co/api/strytree/candidates/${candidateId}/publish`, {
      method: 'POST',
      headers: sessionHeaders('publish-candidate-1'),
      body: JSON.stringify({
        title: 'Silent Archive Passage',
        synopsis: 'The team chooses a low-signal passage that keeps the archive reachable.',
        merge_notes: 'Publish the candidate as one normal child branch.',
      }),
    }),
    env as never,
  )
  if (!publish.ok) throw new Error(`expected candidate publish ok, got ${publish.status}: ${await publish.text()}`)
  const publishBody = await publish.json() as { published_node_id?: string; selected_candidate_id?: string; snapshot_version?: number }
  if (!publishBody.published_node_id || publishBody.selected_candidate_id !== candidateId || publishBody.snapshot_version !== 2) {
    throw new Error(`expected published child node response, got ${JSON.stringify(publishBody)}`)
  }
  const publishedNode = db.nodes.get(String(publishBody.published_node_id))
  if (publishedNode?.parent_node_id !== 'node_root' || publishedNode?.selected_candidate_id !== candidateId) {
    throw new Error(`expected persisted child node linked to selected candidate, got ${JSON.stringify(publishedNode)}`)
  }
  const candidate = db.branchCandidates.get(candidateId)
  if (candidate?.status !== 'published') throw new Error(`expected selected candidate status to become published, got ${candidate?.status}`)
  if (db.mergePlans.size !== 1) throw new Error(`expected one merge plan, got ${db.mergePlans.size}`)
}

export async function testStrytreeWriteRoutesRequireSessionAndCandidateBounds() {
  const { env, db } = seedStrytreeEnv()
  const unauthorizedUnlock = await worker.fetch(
    new Request('https://airvio.co/api/strytree/nodes/node_locked/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unauth-unlock' },
      body: JSON.stringify({ quote_id: 'quote-node-locked' }),
    }),
    env as never,
  )
  if (unauthorizedUnlock.status !== 401) throw new Error(`expected unauthorized unlock to return 401, got ${unauthorizedUnlock.status}`)

  const unauthorizedCheckoutComplete = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/sessions/missing-session/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unauth-checkout-complete' },
      body: JSON.stringify({}),
    }),
    env as never,
  )
  if (unauthorizedCheckoutComplete.status !== 401) throw new Error(`expected unauthorized checkout completion to return 401, got ${unauthorizedCheckoutComplete.status}`)

  const unauthorizedGeneration = await worker.fetch(
    new Request('https://airvio.co/api/strytree/generation-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unauth-generation' },
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        prompt: 'This should fail before debit.',
      }),
    }),
    env as never,
  )
  if (unauthorizedGeneration.status !== 401) throw new Error(`expected unauthorized generation to return 401, got ${unauthorizedGeneration.status}`)

  const unauthorizedCandidateRun = await worker.fetch(
    new Request('https://airvio.co/api/strytree/candidate-runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unauth-candidate-run' },
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        max_candidates: 1,
        prompt: 'This should fail before candidate debit.',
      }),
    }),
    env as never,
  )
  if (unauthorizedCandidateRun.status !== 401) throw new Error(`expected unauthorized candidate run to return 401, got ${unauthorizedCandidateRun.status}`)

  const unauthorizedPublish = await worker.fetch(
    new Request('https://airvio.co/api/strytree/candidates/cand_missing/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'unauth-publish' },
      body: JSON.stringify({ title: 'Should not publish' }),
    }),
    env as never,
  )
  if (unauthorizedPublish.status !== 401) throw new Error(`expected unauthorized candidate publish to return 401, got ${unauthorizedPublish.status}`)

  const ledgerAfterUnauthorized = Array.from(db.tokenLedger.values())
    .filter(row => row.id !== 'ledger_seed')
  if (ledgerAfterUnauthorized.length !== 0) {
    throw new Error(`expected unauthorized writes to avoid ledger events, got ${JSON.stringify(ledgerAfterUnauthorized)}`)
  }

  const tooMany = await worker.fetch(
    new Request('https://airvio.co/api/strytree/candidate-runs', {
      method: 'POST',
      headers: sessionHeaders('candidate-bound-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        max_candidates: 4,
        prompt: 'This should fail before debit.',
      }),
    }),
    env as never,
  )
  if (tooMany.status !== 400) throw new Error(`expected candidate bound to return 400, got ${tooMany.status}`)
  const body = await tooMany.json() as { code?: string }
  if (body.code !== 'candidate_bound_exceeded') throw new Error(`expected candidate bound code, got ${JSON.stringify(body)}`)
  if (Array.from(db.tokenLedger.values()).some(row => row.event_type === 'candidate_run_debit')) {
    throw new Error('expected candidate bound failure to avoid token debit')
  }
}

export async function testStrytreeCheckoutSettlementCreditsTokenLedgerIdempotently() {
  const { env, db } = seedStrytreeEnv()
  const unauthorized = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'checkout-unauth-1' },
      body: JSON.stringify({ package_id: 'credits_20' }),
    }),
    env as never,
  )
  if (unauthorized.status !== 401) throw new Error(`expected checkout create without session to return 401, got ${unauthorized.status}`)

  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/sessions', {
      method: 'POST',
      headers: sessionHeaders('checkout-create-1'),
      body: JSON.stringify({ package_id: 'credits_50' }),
    }),
    env as never,
  )
  if (create.status !== 201) throw new Error(`expected checkout create ok, got ${create.status}: ${await create.text()}`)
  const createBody = await create.json() as {
    payment_session_id?: string
    checkout_session_id?: string
    status?: string
    credit_amount?: number
    amount_total?: number
  }
  if (!createBody.payment_session_id || !createBody.checkout_session_id || createBody.status !== 'open') {
    throw new Error(`expected open server-owned payment session, got ${JSON.stringify(createBody)}`)
  }
  if (createBody.credit_amount !== 50 || createBody.amount_total !== 1000) {
    throw new Error(`expected package amount mapping, got ${JSON.stringify(createBody)}`)
  }
  if (Array.from(db.tokenLedger.values()).some(row => row.event_type === 'purchase_credit' && row.related_object_type === 'strytree_payment_session')) {
    throw new Error('expected checkout create to avoid crediting ledger before settlement')
  }

  const complete = await worker.fetch(
    new Request(`https://airvio.co/api/strytree/checkout/sessions/${createBody.payment_session_id}/complete`, {
      method: 'POST',
      headers: sessionHeaders('checkout-complete-1'),
      body: JSON.stringify({}),
    }),
    env as never,
  )
  if (!complete.ok) throw new Error(`expected checkout settlement ok, got ${complete.status}: ${await complete.text()}`)
  const completeBody = await complete.json() as {
    ledger_event_id?: string
    balance_after_credits?: number
    credit_amount?: number
    status?: string
  }
  if (!completeBody.ledger_event_id || completeBody.status !== 'completed' || completeBody.credit_amount !== 50 || completeBody.balance_after_credits !== 90) {
    throw new Error(`expected settlement to credit token ledger, got ${JSON.stringify(completeBody)}`)
  }
  const paymentSession = db.paymentSessions.get(String(createBody.payment_session_id))
  if (paymentSession?.status !== 'completed' || !paymentSession.completed_at) {
    throw new Error(`expected payment session to persist completed status, got ${JSON.stringify(paymentSession)}`)
  }
  const purchaseCredits = Array.from(db.tokenLedger.values())
    .filter(row => row.event_type === 'purchase_credit' && row.related_object_type === 'strytree_payment_session')
  if (purchaseCredits.length !== 1 || purchaseCredits[0].amount_credits !== 50) {
    throw new Error(`expected one checkout ledger credit, got ${JSON.stringify(purchaseCredits)}`)
  }

  const replay = await worker.fetch(
    new Request(`https://airvio.co/api/strytree/checkout/sessions/${createBody.payment_session_id}/complete`, {
      method: 'POST',
      headers: sessionHeaders('checkout-complete-2'),
      body: JSON.stringify({}),
    }),
    env as never,
  )
  if (!replay.ok) throw new Error(`expected checkout settlement replay ok, got ${replay.status}`)
  const replayBody = await replay.json() as { idempotent_replay?: boolean; balance_after_credits?: number }
  if (replayBody.idempotent_replay !== true || replayBody.balance_after_credits !== 90) {
    throw new Error(`expected settlement replay to preserve credited balance, got ${JSON.stringify(replayBody)}`)
  }
  if (Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'purchase_credit' && row.related_object_type === 'strytree_payment_session').length !== 1) {
    throw new Error('expected settlement replay to avoid duplicate credit')
  }
}

export async function testStrytreeSignedCheckoutWebhookSettlesTokenLedgerThroughSharedOwner() {
  const { env, db } = seedStrytreeEnv()
  const runtimeEnv = env as Record<string, unknown>
  const webhookSecret = 'whsec_strytree_fixture_secret'
  runtimeEnv.STRYTREE_CHECKOUT_WEBHOOK_SECRET = webhookSecret
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/sessions', {
      method: 'POST',
      headers: sessionHeaders('checkout-webhook-create-1'),
      body: JSON.stringify({ package_id: 'credits_20' }),
    }),
    runtimeEnv as never,
  )
  if (create.status !== 201) throw new Error(`expected webhook checkout create ok, got ${create.status}: ${await create.text()}`)
  const createBody = await create.json() as {
    payment_session_id?: string
    checkout_session_id?: string
  }
  if (!createBody.payment_session_id || !createBody.checkout_session_id) {
    throw new Error(`expected webhook fixture to create a provider-linked payment session, got ${JSON.stringify(createBody)}`)
  }
  const event = {
    id: 'evt_strytree_checkout_webhook_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: createBody.checkout_session_id,
        payment_status: 'paid',
        status: 'complete',
        metadata: {
          strytree_payment_session_id: createBody.payment_session_id,
        },
      },
    },
  }
  const payload = JSON.stringify(event)
  const bad = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'strytree-signature': 't=1777500000,v1=bad',
      },
      body: payload,
    }),
    runtimeEnv as never,
  )
  if (bad.status !== 400) throw new Error(`expected signed webhook to fail closed on bad signature, got ${bad.status}`)
  if (Array.from(db.tokenLedger.values()).some(row => row.event_type === 'purchase_credit' && row.provider_event_id === event.id)) {
    throw new Error('expected bad webhook signature to avoid token ledger credit')
  }

  const signature = await signWebhookPayload(payload, webhookSecret)
  const accepted = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'strytree-signature': signature,
      },
      body: payload,
    }),
    runtimeEnv as never,
  )
  if (!accepted.ok) throw new Error(`expected signed checkout webhook ok, got ${accepted.status}: ${await accepted.text()}`)
  const acceptedBody = await accepted.json() as {
    provider_event_id?: string
    ledger_event_id?: string
    balance_after_credits?: number
    idempotent_replay?: boolean
  }
  if (acceptedBody.provider_event_id !== event.id || !acceptedBody.ledger_event_id || acceptedBody.balance_after_credits !== 60) {
    throw new Error(`expected signed webhook to credit through settlement owner, got ${JSON.stringify(acceptedBody)}`)
  }
  const ledgerCredits = Array.from(db.tokenLedger.values())
    .filter(row => row.event_type === 'purchase_credit' && row.related_object_type === 'strytree_payment_session')
  if (ledgerCredits.length !== 1 || ledgerCredits[0].provider_event_id !== event.id || ledgerCredits[0].amount_credits !== 20) {
    throw new Error(`expected one provider-event-linked purchase credit, got ${JSON.stringify(ledgerCredits)}`)
  }

  const replay = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'strytree-signature': await signWebhookPayload(payload, webhookSecret),
      },
      body: payload,
    }),
    runtimeEnv as never,
  )
  if (!replay.ok) throw new Error(`expected signed checkout webhook replay ok, got ${replay.status}`)
  const replayBody = await replay.json() as { idempotent_replay?: boolean; balance_after_credits?: number }
  if (replayBody.idempotent_replay !== true || replayBody.balance_after_credits !== 60) {
    throw new Error(`expected webhook replay to reuse existing settlement, got ${JSON.stringify(replayBody)}`)
  }
  if (Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'purchase_credit' && row.related_object_type === 'strytree_payment_session').length !== 1) {
    throw new Error('expected signed webhook replay to avoid duplicate purchase credit')
  }
}

export async function testStrytreeWalletShowsPendingPaymentBeforeWebhookCredit() {
  const { env } = seedStrytreeEnv()
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/checkout/sessions', {
      method: 'POST',
      headers: sessionHeaders('checkout-wallet-pending-1'),
      body: JSON.stringify({ package_id: 'credits_100' }),
    }),
    env as never,
  )
  if (create.status !== 201) throw new Error(`expected checkout create ok, got ${create.status}: ${await create.text()}`)
  const pending = await worker.fetch(
    new Request('https://airvio.co/api/strytree/wallet', {
      headers: { authorization: 'Bearer sess_fan' },
    }),
    env as never,
  )
  if (!pending.ok) throw new Error(`expected pending wallet ok, got ${pending.status}: ${await pending.text()}`)
  const pendingBody = await pending.json() as {
    wallet_status?: string
    balance_credits?: number
    pending_payment?: boolean
    pending_credit_amount?: number
    pending_payment_sessions?: Array<{ payment_session_id?: string }>
  }
  if (
    pendingBody.wallet_status !== 'pending_payment' ||
    pendingBody.balance_credits !== 40 ||
    pendingBody.pending_payment !== true ||
    pendingBody.pending_credit_amount !== 100 ||
    pendingBody.pending_payment_sessions?.length !== 1
  ) {
    throw new Error(`expected wallet pending state before webhook credit, got ${JSON.stringify(pendingBody)}`)
  }
}

export async function testStrytreeGenerationJobQueueWritesR2ArtifactAfterServerDebit() {
  const { env, db, queue, bucket } = seedStrytreeEnv()
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/generation-jobs', {
      method: 'POST',
      headers: sessionHeaders('generation-create-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        prompt: 'Generate a short archival passage without changing the renderer contract.',
        options: { duration_seconds: 5, quality: '720p' },
      }),
    }),
    env as never,
  )
  if (create.status !== 202) throw new Error(`expected generation create accepted, got ${create.status}: ${await create.text()}`)
  const createBody = await create.json() as { job_id?: string; ledger_event_id?: string; quoted_cost_credits?: number; ledger_authority?: string }
  if (!createBody.job_id || !createBody.ledger_event_id || createBody.quoted_cost_credits !== 5 || createBody.ledger_authority !== 'durable-object') {
    throw new Error(`expected queued generation job with debit, got ${JSON.stringify(createBody)}`)
  }
  const debitEvents = Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'generation_debit')
  if (debitEvents.length !== 1 || debitEvents[0].amount_credits !== -5 || debitEvents[0].balance_after_credits !== 35) {
    throw new Error(`expected one generation debit before queue processing, got ${JSON.stringify(debitEvents)}`)
  }
  if (queue.messages.length !== 1) throw new Error(`expected one generation queue message, got ${queue.messages.length}`)

  const queueState = await runWorkerQueue(env, queue.messages[0])
  if (!queueState.acked || queueState.retried) throw new Error(`expected queue message ack without retry, got ${JSON.stringify(queueState)}`)
  const job = db.generationJobs.get(String(createBody.job_id))
  if (job?.status !== 'succeeded' || !job.provider_job_id || !job.result_json) {
    throw new Error(`expected generation consumer to mark job succeeded, got ${JSON.stringify(job)}`)
  }
  if (bucket.objects.size !== 2) throw new Error(`expected R2 video and thumbnail artifact writes, got ${bucket.objects.size}`)

  const read = await worker.fetch(
    new Request(`https://airvio.co/api/strytree/generation-jobs/${createBody.job_id}`, {
      headers: { authorization: 'Bearer sess_fan' },
    }),
    env as never,
  )
  if (!read.ok) throw new Error(`expected generation read ok, got ${read.status}`)
  const readBody = await read.json() as { status?: string; video_object_key?: string; refund_ledger_event_id?: string | null }
  if (readBody.status !== 'succeeded' || !readBody.video_object_key || readBody.refund_ledger_event_id !== null) {
    throw new Error(`expected succeeded generation read with artifact keys, got ${JSON.stringify(readBody)}`)
  }
}

export async function testStrytreeGenerationBudgetCircuitBreakerStopsBeforeDebitAndQueue() {
  const { env, db, queue, kv } = seedStrytreeEnv()
  const runtimeEnv = env as Record<string, unknown>
  runtimeEnv.STRYTREE_DAILY_PROVIDER_BUDGET_CENTS = '100'
  runtimeEnv.STRYTREE_PROVIDER_SPEND_KV_KEY = 'strytree:test-provider-spend'
  kv.values.set('strytree:test-provider-spend', JSON.stringify({ spent_cents: 100 }))
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/generation-jobs', {
      method: 'POST',
      headers: sessionHeaders('generation-budget-block-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        prompt: 'This request should stop before debit when provider budget is exhausted.',
        image_references: [{ type: 'subject', img_id: 101, ref_name: 'archivist' }],
      }),
    }),
    runtimeEnv as never,
  )
  if (create.status !== 429) throw new Error(`expected budget circuit breaker 429, got ${create.status}: ${await create.text()}`)
  const body = await create.json() as { code?: string; provider_spend_cents?: number }
  if (body.code !== 'provider_budget_exceeded' || body.provider_spend_cents !== 100) {
    throw new Error(`expected provider budget error payload, got ${JSON.stringify(body)}`)
  }
  if (Array.from(db.tokenLedger.values()).some(row => row.event_type === 'generation_debit')) {
    throw new Error('expected provider budget circuit breaker to stop before generation debit')
  }
  if (queue.messages.length !== 0) {
    throw new Error(`expected provider budget circuit breaker to avoid queue enqueue, got ${queue.messages.length}`)
  }
}

export async function testStrytreeGenerationQueuePollsExternalVideoProviderWhenServerCredentialsExist() {
  const { env, db, queue, bucket } = seedStrytreeEnv()
  const runtimeEnv = env as Record<string, unknown>
  const providerCalls: Array<{ url: string; method?: string; apiKey?: string | null; body?: unknown }> = []
  runtimeEnv.STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY = 'server-side-external-video-provider-key'
  runtimeEnv.STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS = '3'
  runtimeEnv.STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS = '0'
  runtimeEnv.STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH = async (input: string | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url
    providerCalls.push({
      url,
      method: init?.method,
      apiKey: init?.headers instanceof Headers ? init.headers.get('API-KEY') : (init?.headers as Record<string, string> | undefined)?.['API-KEY'] || null,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    })
    if (url.includes('/openapi/v2/video/fusion/generate')) {
      return new Response(JSON.stringify({ ErrCode: 0, Resp: { video_id: 987654 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({
      ErrCode: 0,
      Resp: {
        id: 987654,
        status: 1,
        url: 'https://provider.example/generated/987654.mp4',
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/generation-jobs', {
      method: 'POST',
      headers: sessionHeaders('generation-live-external-video-provider-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        prompt: 'Generate an external-provider-backed branch continuation with inherited assets.',
        image_references: [
          { type: 'subject', img_id: 101, ref_name: 'archivist' },
          { type: 'background', img_id: 202, ref_name: 'archive_hall' },
        ],
        model: 'v4.5',
        duration: 5,
        quality: '540p',
        aspect_ratio: '16:9',
        seed: 112233,
      }),
    }),
    runtimeEnv as never,
  )
  if (create.status !== 202) throw new Error(`expected credentialed generation create accepted, got ${create.status}: ${await create.text()}`)
  const createBody = await create.json() as { job_id?: string }
  await runWorkerQueue(runtimeEnv, queue.messages[0])
  if (providerCalls.length !== 2) throw new Error(`expected submit and poll provider calls, got ${JSON.stringify(providerCalls)}`)
  if (!providerCalls.every(call => call.apiKey === 'server-side-external-video-provider-key')) {
    throw new Error(`expected provider calls to use server-side env API key, got ${JSON.stringify(providerCalls)}`)
  }
  const submit = providerCalls[0]
  if (!submit.url.endsWith('/openapi/v2/video/fusion/generate')) {
    throw new Error(`expected fusion generation endpoint, got ${submit.url}`)
  }
  const submitBody = submit.body as { image_references?: unknown[]; prompt?: string }
  if (submitBody.image_references?.length !== 2 || !String(submitBody.prompt || '').includes('external-provider-backed')) {
    throw new Error(`expected typed external provider payload with inherited refs, got ${JSON.stringify(submitBody)}`)
  }
  const job = db.generationJobs.get(String(createBody.job_id))
  if (job?.status !== 'succeeded' || job.provider_job_id !== '987654') {
    throw new Error(`expected credentialed provider poll to mark job succeeded, got ${JSON.stringify(job)}`)
  }
  if (bucket.objects.size !== 2) throw new Error(`expected provider result manifests in R2, got ${bucket.objects.size}`)
  const videoManifest = String(bucket.objects.values().next().value || '')
  if (!videoManifest.includes('external-video-provider-live-poll') || !videoManifest.includes('987654')) {
    throw new Error(`expected R2 manifest to record live provider proof, got ${videoManifest}`)
  }
}

export async function testStrytreeGenerationProviderFailureRefundsAndStoresFallback() {
  const { env, db, queue, bucket } = seedStrytreeEnv()
  const create = await worker.fetch(
    new Request('https://airvio.co/api/strytree/generation-jobs', {
      method: 'POST',
      headers: sessionHeaders('generation-fail-1'),
      body: JSON.stringify({
        story_id: 'story_alpha',
        parent_node_id: 'node_root',
        prompt: 'Generate a passage that deliberately exercises provider failure.',
        simulate_provider_failure: true,
      }),
    }),
    env as never,
  )
  if (create.status !== 202) throw new Error(`expected failure generation create accepted, got ${create.status}: ${await create.text()}`)
  const createBody = await create.json() as { job_id?: string }
  const queueState = await runWorkerQueue(env, queue.messages[0])
  if (!queueState.acked || queueState.retried) throw new Error(`expected failed provider message to ack after refund, got ${JSON.stringify(queueState)}`)
  if (bucket.objects.size !== 0) throw new Error(`expected provider failure to avoid R2 writes, got ${bucket.objects.size}`)
  const job = db.generationJobs.get(String(createBody.job_id))
  if (job?.status !== 'failed' || !job.refund_ledger_event_id || !job.fallback_artifact_json || job.error_code !== 'provider_unavailable') {
    throw new Error(`expected failed job with refund and fallback artifact, got ${JSON.stringify(job)}`)
  }
  const refundEvents = Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'refund_credit')
  if (refundEvents.length !== 1 || refundEvents[0].amount_credits !== 5 || refundEvents[0].balance_after_credits !== 40) {
    throw new Error(`expected one refund credit restoring balance, got ${JSON.stringify(refundEvents)}`)
  }

  await runWorkerQueue(env, queue.messages[0])
  if (Array.from(db.tokenLedger.values()).filter(row => row.event_type === 'refund_credit').length !== 1) {
    throw new Error('expected replayed failed generation queue message to avoid duplicate refund')
  }
}
