import { describe, expect, it } from 'vitest'
import { routeInference, type InferenceEnv } from '../../../../src/runtime/inference-router'

const catalog = JSON.stringify([
  {
    id: 'workers-model',
    license: 'Apache-2.0',
    path: 'workers-ai',
    input_usd_per_million: 0.2,
    output_usd_per_million: 0.3,
  },
  {
    id: 'overflow-model',
    license: 'Apache-2.0',
    path: 'containers-ollama',
    estimated_usd_per_call: 0.001,
  },
])

describe('inference provider deadlines', () => {
  it('passes an abort signal to both Workers AI and the overflow service', async () => {
    let workersSignal: AbortSignal | undefined
    let overflowSignal: AbortSignal | undefined
    const env: InferenceEnv = {
      MODEL_CATALOG_JSON: catalog,
      PERMITTED_MODEL_LICENSES_JSON: '["Apache-2.0"]',
      INFERENCE_OVERFLOW_TOKEN: 'o'.repeat(32),
      AI: {
        async run(_modelId, _input, options) {
          workersSignal = options?.signal
          return { usage: { prompt_tokens: 1, completion_tokens: 1 }, response: 'ok' }
        },
      },
      INFERENCE_OVERFLOW: {
        async fetch(request) {
          overflowSignal = request.signal
          return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 }, response: 'ok' })
        },
      },
    }

    expect(await routeInference(env, 'workers-model', { prompt: 'bounded' })).toMatchObject({
      path: 'workers-ai',
      modelId: 'workers-model',
    })
    expect(workersSignal).toBeInstanceOf(AbortSignal)
    expect(workersSignal?.aborted).toBe(false)

    expect(await routeInference(env, 'overflow-model', { prompt: 'bounded' })).toMatchObject({
      path: 'containers-ollama',
      modelId: 'overflow-model',
    })
    expect(overflowSignal).toBeInstanceOf(AbortSignal)
    expect(overflowSignal?.aborted).toBe(false)
  })
})
