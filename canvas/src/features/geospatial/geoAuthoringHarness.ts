import { createCostLog, validateCostLog } from '../../../../contracts/cost-log.schema.js'

export type GeoAuthoringInput = {
  intent: string
  datasetId: string
  kind: 'building' | 'road' | 'asset'
  maxIterations: number
  costBudgetUsd: number
  modelTimeoutMs: number
}

export type HarnessError =
  | { code: 'input-invalid'; fields: readonly { path: string; reason: string }[] }
  | { code: 'output-invalid'; reason: string }
  | { code: 'iteration-limit'; iterations: number }
  | { code: 'budget-exceeded'; estimatedCostUsd: number; budgetUsd: number }
  | { code: 'model-unavailable'; upstream: string }

export type HarnessResult = {
  ok: boolean
  draft: Record<string, unknown> | null
  costLogs: readonly object[]
  error: HarnessError | null
}

export type GeoAuthoringModelResult = {
  draft?: unknown
  continue?: boolean
  model?: string
  promptTokens?: number
  completionTokens?: number
  cacheHits?: number
  estimatedCostUsd?: number
}

export type GeoAuthoringModelCall = (
  input: GeoAuthoringInput,
  iteration: number,
) => Promise<GeoAuthoringModelResult>

const finiteNumber = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

export function normalizeGeoAuthoringInput(
  value: unknown,
): { ok: true; input: GeoAuthoringInput } | { ok: false; error: HarnessError } {
  const fields: { path: string; reason: string }[] = []
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const intent = String(record.intent || '').trim()
  const datasetId = String(record.datasetId || '').trim()
  const kind = record.kind
  if (!intent || intent.length > 2_000) fields.push({ path: 'intent', reason: 'must contain 1 to 2000 characters' })
  if (!datasetId) fields.push({ path: 'datasetId', reason: 'must be a non-empty string' })
  if (!['building', 'road', 'asset'].includes(String(kind))) {
    fields.push({ path: 'kind', reason: 'must be building, road, or asset' })
  }
  const rawBudget = finiteNumber(record.costBudgetUsd)
  if (record.costBudgetUsd != null && (rawBudget == null || rawBudget <= 0)) {
    fields.push({ path: 'costBudgetUsd', reason: 'must be greater than zero' })
  }
  if (fields.length > 0) return { ok: false, error: { code: 'input-invalid', fields } }
  return {
    ok: true,
    input: {
      intent,
      datasetId,
      kind: kind as GeoAuthoringInput['kind'],
      maxIterations: Math.max(1, Math.min(50, Math.floor(finiteNumber(record.maxIterations) ?? 10))),
      costBudgetUsd: rawBudget ?? 0.05,
      modelTimeoutMs: Math.max(1_000, Math.min(300_000, Math.floor(finiteNumber(record.modelTimeoutMs) ?? 30_000))),
    },
  }
}

const validateDraft = (value: unknown, input: GeoAuthoringInput): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!record.render || typeof record.render !== 'object' || Array.isArray(record.render)) return null
  const render = record.render as Record<string, unknown>
  if (input.kind === 'asset' && render.kind !== 'asset3d') return null
  if (input.kind !== 'asset' && (render.kind !== 'extrusion' || render.extrusionKind !== input.kind)) return null
  if (!record.fetchBounds || typeof record.fetchBounds !== 'object' || Array.isArray(record.fetchBounds)) return null
  const fetchBounds = record.fetchBounds as Record<string, unknown>
  if ((finiteNumber(fetchBounds.timeoutMs) ?? 0) <= 0 || (finiteNumber(fetchBounds.maxBytes) ?? 0) <= 0) return null
  return record
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('model-timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export async function runGeoAuthoring(
  rawInput: unknown,
  options?: {
    callModel?: GeoAuthoringModelCall
    applyDraft?: (draft: Record<string, unknown>) => Promise<boolean> | boolean
  },
): Promise<HarnessResult> {
  const normalized = normalizeGeoAuthoringInput(rawInput)
  if (normalized.ok === false) return { ok: false, draft: null, costLogs: [], error: normalized.error }
  if (!options?.callModel) {
    return {
      ok: false,
      draft: null,
      costLogs: [],
      error: { code: 'model-unavailable', upstream: 'No geo authoring model adapter is configured.' },
    }
  }
  const costLogs: object[] = []
  let estimatedCostUsd = 0
  for (let iteration = 1; iteration <= normalized.input.maxIterations; iteration += 1) {
    let response: GeoAuthoringModelResult
    try {
      response = await withTimeout(
        options.callModel(normalized.input, iteration),
        normalized.input.modelTimeoutMs,
      )
    } catch (error) {
      return {
        ok: false,
        draft: null,
        costLogs,
        error: {
          code: 'model-unavailable',
          upstream: error instanceof Error && error.message === 'model-timeout'
            ? `Model call exceeded ${normalized.input.modelTimeoutMs} ms.`
            : 'Geo authoring model call failed.',
        },
      }
    }
    const costLog = createCostLog({
      model: String(response.model || 'unknown'),
      prompt_tokens: finiteNumber(response.promptTokens) ?? 0,
      completion_tokens: finiteNumber(response.completionTokens) ?? 0,
      cache_hits: finiteNumber(response.cacheHits) ?? 0,
      estimated_cost_usd: finiteNumber(response.estimatedCostUsd) ?? 0,
    })
    if (!validateCostLog(costLog).valid) {
      return { ok: false, draft: null, costLogs, error: { code: 'output-invalid', reason: 'Model cost log is invalid.' } }
    }
    costLogs.push(costLog)
    estimatedCostUsd += Number(costLog.estimated_cost_usd)
    if (estimatedCostUsd >= normalized.input.costBudgetUsd) {
      return {
        ok: false,
        draft: null,
        costLogs,
        error: { code: 'budget-exceeded', estimatedCostUsd, budgetUsd: normalized.input.costBudgetUsd },
      }
    }
    if (response.continue === true && response.draft == null) continue
    const draft = validateDraft(response.draft, normalized.input)
    if (!draft) {
      return { ok: false, draft: null, costLogs, error: { code: 'output-invalid', reason: 'Model draft does not match the enhanced layer schema.' } }
    }
    if (options.applyDraft && !await options.applyDraft(draft)) {
      return { ok: false, draft: null, costLogs, error: { code: 'output-invalid', reason: 'Validated draft was rejected by the configuration owner.' } }
    }
    return { ok: true, draft, costLogs, error: null }
  }
  return {
    ok: false,
    draft: null,
    costLogs,
    error: { code: 'iteration-limit', iterations: normalized.input.maxIterations },
  }
}
