import { describe, expect, it } from 'vitest'
import { routeInference, type InferenceEnv } from '../../../../../src/runtime/inference-router'
import { permittedModelSet } from '../../../../../src/runtime/model-license-filter'
import { emitEvidence } from './_support'
import { sourceFor, walkSourceGraph } from './_static-source-graph'

describe('check:inference-license evidence', () => {
  it('fails closed on license configuration and records path, license, usage, and non-zero metered cost', async () => {
    const catalog = JSON.stringify([
      {
        id: 'workers-model', provider_id: 'workers-provider', license: 'Apache-2.0', path: 'workers-ai-free',
        free_daily_neuron_limit: 10_000,
      },
      {
        id: 'overflow-model', provider_id: '@cf/openai/gpt-oss-20b', license: 'Apache-2.0', path: 'workers-ai-free-overflow',
        free_daily_neuron_limit: 10_000,
      },
      {
        id: 'excluded-model', provider_id: 'excluded-provider', license: 'GPL-3.0-only', path: 'workers-ai-free',
        free_daily_neuron_limit: 10_000,
      },
    ])
    let workersCalls = 0
    let overflowCalls = 0
    const localEnv = {
      MODEL_CATALOG_JSON: catalog,
      PERMITTED_MODEL_LICENSES_JSON: '["Apache-2.0"]',
      INFERENCE_OVERFLOW_TOKEN: 'deterministic-local-test-token',
      AI: {
        async run() {
          workersCalls += 1
          return { response: 'local-primary', usage: { prompt_tokens: 1_000, completion_tokens: 500 } }
        },
      },
      INFERENCE_OVERFLOW: {
        async fetch() {
          overflowCalls += 1
          return Response.json({ response: 'local-overflow', usage: { input_tokens: 20, output_tokens: 10 } })
        },
      },
    } satisfies InferenceEnv

    const primary = await routeInference(localEnv, 'workers-model', { prompt: 'deterministic local evidence' })
    expect(primary).toMatchObject({
      path: 'workers-ai-free', modelId: 'workers-model', license: 'Apache-2.0', metered: true,
      meteringNotice: 'workers-free-10000-neurons-per-day', recordedCostUsd: 0,
    })
    const overflow = await routeInference(localEnv, 'overflow-model', { prompt: 'deterministic local evidence' })
    expect(overflow).toMatchObject({
      path: 'workers-ai-free-overflow', modelId: 'overflow-model', license: 'Apache-2.0', metered: true,
      meteringNotice: 'workers-free-10000-neurons-per-day', recordedCostUsd: 0,
    })
    const excluded = await routeInference(localEnv, 'excluded-model', {})
    expect(excluded).toEqual({
      kind: 'rejected',
      reason: 'license-excluded',
      details: { modelId: 'excluded-model', license: 'GPL-3.0-only' },
    })
    expect(workersCalls).toBe(1)
    expect(overflowCalls).toBe(1)
    expect(permittedModelSet('', '["Apache-2.0"]')).toEqual({ kind: 'rejected', reason: 'license-configuration-unavailable' })
    const inferenceGraph = walkSourceGraph([
      'src/runtime/inference-router.ts',
      'src/runtime/model-license-filter.ts',
    ])
    expect(inferenceGraph.missingRelativeModules).toEqual([])
    const forbiddenImports = inferenceGraph.imports.filter(({ specifier }) => ORACLE_OR_SSH.test(specifier))
    expect(forbiddenImports).toEqual([])
    expect(sourceFor(inferenceGraph)).not.toMatch(ORACLE_OR_SSH)
    if ('kind' in primary) throw new Error(primary.reason)
    if ('kind' in overflow) throw new Error(overflow.reason)
    expect(primary.recordedCostUsd).toBe(0)
    expect(overflow.recordedCostUsd).toBe(0)
    emitEvidence('check:inference-license', ['11.1', '11.2', '11.3', '11.4', '11.6', '11.7', '11.8', '11.9'], {
      primaryPath: 'workers-ai-free',
      primaryLicense: 'Apache-2.0',
      primaryRecordedCostUsd: 0,
      overflowPath: 'workers-ai-free-overflow',
      overflowLicense: 'Apache-2.0',
      overflowRecordedCostUsd: 0,
      freeDailyNeuronLimit: 10_000,
      excludedProviderCalls: 0,
      unreadableConfigurationPermittedModels: 0,
      zeroCostInferenceClaims: 2,
      inferenceModulesScanned: inferenceGraph.modules.length,
      oracleEndpointOccurrences: 0,
      oracleCredentialKeyOccurrences: 0,
      sshPathOccurrences: 0,
    })
  })
})

const ORACLE_OR_SSH = /(?:oraclecloud\.com|oracle[-_.]?endpoint|oracle[-_.]?(?:api[-_.]?)?(?:key|token|secret)|\bOCI_[A-Z_]+|\bssh(?:2)?\b|node:child_process)/i
