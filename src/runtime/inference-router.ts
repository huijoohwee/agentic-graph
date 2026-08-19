import type { Rejection } from '../bundle/bundle-types'
import { permittedModelSet, readModelDeclaration } from './model-license-filter'

export async function routeInference(
  env: TravelCommerceEnv,
  modelId: string,
  input: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>> | Rejection> {
  const permitted = permittedModelSet(env.MODEL_CATALOG_JSON, env.PERMITTED_MODEL_LICENSES_JSON)
  if ('kind' in permitted) return permitted
  const declared = readModelDeclaration(env.MODEL_CATALOG_JSON, modelId)
  if ('kind' in declared) return declared
  const model = permitted.find((candidate) => candidate.id === modelId)
  if (!model) {
    return { kind: 'rejected', reason: 'license-excluded', details: { modelId, license: declared.license } }
  }
  if (model.path === 'workers-ai') {
    const output = await env.INFERENCE_PRIMARY.fetch(new Request('https://workers-ai.internal/v1/inference', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId, input }),
    }))
    if (!output.ok) return { kind: 'rejected', reason: `inference-primary-${output.status}` }
    return Object.freeze({
      path: 'workers-ai', modelId, license: model.license, metered: true,
      output: await output.json(),
    })
  }
  const overflow = await env.INFERENCE_OVERFLOW.fetch(new Request('https://ollama-overflow.internal/v1/inference', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelId, input }),
  }))
  if (!overflow.ok) return { kind: 'rejected', reason: `inference-overflow-${overflow.status}` }
  return Object.freeze({
    path: 'containers-ollama', modelId, license: model.license, metered: true,
    output: await overflow.json(),
  })
}
