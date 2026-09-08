

export type HeadersRecord = Record<string, string>

export type StrytreeWorkerEnv = Record<string, unknown> & {
  STRYTREE_CREDIT_LEDGER?: unknown
  STRYTREE_GENERATION_QUEUE?: unknown
  STRYTREE_MEDIA_BUCKET?: unknown
  STRYTREE_PROVIDER_BUDGET_KV?: unknown
  STRYTREE_PROVIDER_MODE?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY?: unknown
  EXTERNAL_VIDEO_PROVIDER_API_KEY?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH?: unknown
  STRYTREE_DAILY_PROVIDER_BUDGET_CENTS?: unknown
  STRYTREE_PROVIDER_SPEND_KV_KEY?: unknown
  STRYTREE_CHECKOUT_WEBHOOK_SECRET?: unknown
  STRYTREE_CHECKOUT_MODE?: unknown
}

export type QueueLike = {
  send?: (body: unknown) => Promise<void>
}

export type R2BucketLike = {
  put?: (key: string, value: string | ArrayBuffer | ReadableStream | Blob, options?: unknown) => Promise<unknown>
}

export type KVNamespaceLike = {
  get?: (key: string) => Promise<string | null>
}

type DurableObjectStubLike = {
  fetch?: (request: Request | string) => Promise<Response>
}

export type DurableObjectNamespaceLike = {
  idFromName?: (name: string) => unknown
  get?: (id: unknown) => DurableObjectStubLike
  getByName?: (name: string) => DurableObjectStubLike
}

export type StrytreeLedgerMutationResult = {
  ledgerEventId: string
  balanceAfterCredits: number
  idempotentReplay: boolean
  authority: 'durable-object' | 'direct-d1'
}

export type FetchLike = (input: string | Request, init?: RequestInit) => Promise<Response>

export type ExternalVideoProviderRequest = {
  endpoint: string
  body: Record<string, unknown>
}

export type ExternalVideoProviderResult = {
  videoId: string
  status: number
  videoUrl: string | null
  responseJson: Record<string, unknown>
  submittedAtMs: number
  completedAtMs: number
}

export type StrytreeUserContext = {
  userId: string
  displayName: string
  role: string
}

export type StrytreeStoryRow = {
  id: string
  slug: string
  title: string
  tagline: string | null
  status: string
  poster_object_key: string | null
  root_node_id: string | null
  snapshot_version: number
}

export type StrytreeNodeRow = {
  id: string
  story_id: string
  parent_node_id: string | null
  selected_candidate_id: string | null
  creator_user_id: string
  title: string
  synopsis: string
  prompt: string | null
  status: string
  visibility: string
  is_free_window: number
  unlock_price_credits: number
  video_object_key: string | null
  thumbnail_object_key: string | null
  age_days: number
  likes_count: number
  impressions_count: number
  paid_unlocks_count: number
  moderation_status: string
  created_at: string
  updated_at: string
}

export type StrytreeAssetRow = {
  id: string
  story_id: string
  owner_node_id: string | null
  asset_type: string
  name: string
  ref_name: string | null
  external_provider_image_id: string | null
  object_key: string | null
  prompt_prefix: string | null
  negative_prompt: string | null
  created_at: string
}

export type StrytreeCandidateRunRow = {
  id: string
  user_id: string
  story_id: string
  parent_node_id: string
  status: string
  max_candidates: number
  quoted_cost_credits: number
  idempotency_key: string
  request_json: string
  scorecard_json: string | null
  created_at: string
  updated_at: string
}

export type StrytreeBranchCandidateRow = {
  id: string
  candidate_run_id: string
  generation_job_id: string | null
  user_id: string
  story_id: string
  parent_node_id: string
  provider: string
  status: string
  title: string | null
  synopsis: string | null
  prompt: string | null
  video_object_key: string | null
  thumbnail_object_key: string | null
  credit_cost: number
  elapsed_ms: number
  inherited_asset_count: number
  continuity_score: number
  moderation_status: string
  publish_eligible: number
  result_json: string | null
  token_cost_json: string | null
  created_at: string
  updated_at: string
}

export type StrytreeGenerationJobRow = {
  id: string
  user_id: string
  story_id: string
  parent_node_id: string
  status: string
  debit_ledger_event_id: string | null
  refund_ledger_event_id: string | null
  provider: string
  provider_job_id: string | null
  request_json: string
  result_json: string | null
  fallback_artifact_json: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type StrytreeGenerationQueueMessage = {
  type?: string
  job_id?: string
  simulate_provider_failure?: boolean
}

export type StrytreePaymentPackage = {
  id: string
  creditAmount: number
  amountTotal: number
  currency: string
}

export type StrytreePaymentSessionRow = {
  id: string
  user_id: string
  package_id: string
  status: string
  provider: string
  provider_session_id: string | null
  amount_total: number
  currency: string
  credit_amount: number
  idempotency_key: string
  request_json: string
  response_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type StrytreePendingPaymentSessionRow = {
  id: string
  package_id: string
  status: string
  provider_session_id: string | null
  amount_total: number
  currency: string
  credit_amount: number
  created_at: string
  updated_at: string
}
