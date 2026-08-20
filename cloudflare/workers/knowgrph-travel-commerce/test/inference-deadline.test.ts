import { describe, expect, it } from 'vitest'
import { routeInference, type InferenceEnv } from '../../../../src/runtime/inference-router'

const catalog = JSON.stringify([
  {
    id: 'workers-model', provider_id: 'workers-provider',
    license: 'Apache-2.0',
    path: 'workers-ai-free',
    free_daily_neuron_limit: 10_000,
  },
  {
    id: 'overflow-model', provider_id: '@cf/openai/gpt-oss-20b',
    license: 'Apache-2.0',
    path: 'workers-ai-free-overflow',
    free_daily_neuron_limit: 10_000,
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
      path: 'workers-ai-free',
      modelId: 'workers-model',
    })
    expect(workersSignal).toBeInstanceOf(AbortSignal)
    expect(workersSignal?.aborted).toBe(false)

    expect(await routeInference(env, 'overflow-model', { prompt: 'bounded' })).toMatchObject({
      path: 'workers-ai-free-overflow',
      modelId: 'overflow-model',
    })
    expect(overflowSignal).toBeInstanceOf(AbortSignal)
    expect(overflowSignal?.aborted).toBe(false)
  })
})
