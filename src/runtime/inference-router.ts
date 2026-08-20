import type { Rejection } from '../bundle/bundle-types'
import {
  declaredLicenseIsPermitted,
  permittedModelSet,
  readModelDeclaration,
  type ModelDeclaration,
} from './model-license-filter'
import { readBoundedJson } from './bounded-json'

type Usage = Readonly<{ inputTokens: number; outputTokens: number }>
const INFERENCE_REQUEST_TIMEOUT_MS = 30_000
const MAX_INFERENCE_RESPONSE_BYTES = 256 * 1024

export type InferenceEnv = Readonly<{
  MODEL_CATALOG_JSON: string
  PERMITTED_MODEL_LICENSES_JSON: string
  AI: Readonly<{
    run(
      modelId: string,
      input: Record<string, unknown>,
      options?: Readonly<{ signal?: AbortSignal }>,
    ): Promise<unknown>
  }>
  INFERENCE_OVERFLOW: Readonly<{ fetch(request: Request): Promise<Response> }>
  INFERENCE_OVERFLOW_TOKEN: string
}>

export type InferenceRecord = Readonly<{
  path: ModelDeclaration['path']
  modelId: string
  license: string
  metered: true
  meteringNotice: string
  recordedCostUsd: number
  usage: Usage | null
  output: unknown
}>

export async function routeInference(
  env: InferenceEnv,
  modelId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<InferenceRecord | Rejection> {
  const permitted = permittedModelSet(env.MODEL_CATALOG_JSON, env.PERMITTED_MODEL_LICENSES_JSON)
  if ('kind' in permitted) return permitted
  const declared = readModelDeclaration(env.MODEL_CATALOG_JSON, modelId)
  if ('kind' in declared) return declared
  const licensePermitted = declaredLicenseIsPermitted(declared, env.PERMITTED_MODEL_LICENSES_JSON)
  if (typeof licensePermitted !== 'boolean') return licensePermitted
  if (!licensePermitted) return excluded(declared)

  if (declared.path === 'workers-ai-free') {
    if (!permitted.some((candidate) => candidate.id === declared.id)) return excluded(declared)
    try {
      const output = await env.AI.run(
        declared.providerId,
        { ...input, stream: false },
        { signal: AbortSignal.timeout(INFERENCE_REQUEST_TIMEOUT_MS) },
      )
      const usage = readUsage(output)
      if (!usage) return { kind: 'rejected', reason: 'inference-usage-unavailable', details: { modelId } }
      return Object.freeze({
        path: declared.path,
        modelId,
        license: declared.license,
        metered: true as const,
        meteringNotice: `workers-free-${declared.freeDailyNeuronLimit}-neurons-per-day`,
        recordedCostUsd: 0,
        usage,
        output,
      })
    } catch (error) {
      return providerFailure('inference-primary-failed', modelId, error)
    }
  }

  try {
    const response = await env.INFERENCE_OVERFLOW.fetch(new Request('https://workers-ai-overflow.internal/v1/inference', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.INFERENCE_OVERFLOW_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ modelId: declared.providerId, input }),
      signal: AbortSignal.timeout(INFERENCE_REQUEST_TIMEOUT_MS),
    }))
    if (!response.ok) return { kind: 'rejected', reason: `inference-overflow-${response.status}` }
    const output = await readBoundedJson(response, MAX_INFERENCE_RESPONSE_BYTES)
    if (output === null) return { kind: 'rejected', reason: 'inference-overflow-malformed' }
    return Object.freeze({
      path: declared.path,
      modelId,
      license: declared.license,
      metered: true as const,
      meteringNotice: `workers-free-${declared.freeDailyNeuronLimit}-neurons-per-day`,
      recordedCostUsd: 0,
      usage: readUsage(output),
      output,
    })
  } catch (error) {
    return providerFailure('inference-overflow-failed', modelId, error)
  }
}

function readUsage(output: unknown): Usage | null {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  const usage = (output as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return null
  const record = usage as Record<string, unknown>
  const inputTokens = record.prompt_tokens ?? record.input_tokens
  const outputTokens = record.completion_tokens ?? record.output_tokens
  return isTokenCount(inputTokens) && isTokenCount(outputTokens)
    ? Object.freeze({ inputTokens, outputTokens })
    : null
}

function excluded(model: ModelDeclaration): Rejection {
  return { kind: 'rejected', reason: 'license-excluded', details: { modelId: model.id, license: model.license } }
}

function providerFailure(reason: string, modelId: string, error: unknown): Rejection {
  return {
    kind: 'rejected',
    reason,
    details: { modelId, error: error instanceof Error ? error.name : 'unknown-error' },
  }
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
