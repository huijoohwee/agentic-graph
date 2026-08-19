import { describe, expect, it } from 'vitest'
import { routeInference, type InferenceEnv } from '../../../../../src/runtime/inference-router'
import { permittedModelSet } from '../../../../../src/runtime/model-license-filter'
import { emitEvidence } from './_support'
import { sourceFor, walkSourceGraph } from './_static-source-graph'

describe('check:inference-license evidence', () => {
  it('fails closed on license configuration and records path, license, usage, and non-zero metered cost', async () => {
    const catalog = JSON.stringify([
      {
        id: 'workers-model', license: 'Apache-2.0', path: 'workers-ai',
        input_usd_per_million: 0.2, output_usd_per_million: 0.3,
      },
      {
        id: 'overflow-model', license: 'MIT', path: 'containers-ollama',
        estimated_usd_per_call: 0.004,
      },
      {
        id: 'excluded-model', license: 'GPL-3.0-only', path: 'workers-ai',
        input_usd_per_million: 0.2, output_usd_per_million: 0.3,
      },
    ])
    let workersCalls = 0
    let overflowCalls = 0
    const localEnv = {
      MODEL_CATALOG_JSON: catalog,
      PERMITTED_MODEL_LICENSES_JSON: '["Apache-2.0","MIT"]',
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
      path: 'workers-ai', modelId: 'workers-model', license: 'Apache-2.0', metered: true,
      meteringNotice: 'metered-beyond-free-allocation', recordedCostUsd: 0.00035,
    })
    const overflow = await routeInference(localEnv, 'overflow-model', { prompt: 'deterministic local evidence' })
    expect(overflow).toMatchObject({
      path: 'containers-ollama', modelId: 'overflow-model', license: 'MIT', metered: true,
      meteringNotice: 'metered-container-compute', recordedCostUsd: 0.004,
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
    expect(primary.meteringNotice).not.toBe('free')
    expect(overflow.meteringNotice).not.toBe('free')
    expect(primary.recordedCostUsd).toBeGreaterThan(0)
    expect(overflow.recordedCostUsd).toBeGreaterThan(0)
    emitEvidence('check:inference-license', ['11.1', '11.2', '11.3', '11.4', '11.6', '11.7', '11.8', '11.9'], {
      primaryPath: 'workers-ai',
      primaryLicense: 'Apache-2.0',
      primaryRecordedCostUsd: 0.00035,
      overflowPath: 'containers-ollama',
      overflowLicense: 'MIT',
      overflowRecordedCostUsd: 0.004,
      excludedProviderCalls: 0,
      unreadableConfigurationPermittedModels: 0,
      zeroCostInferenceClaims: 0,
      inferenceModulesScanned: inferenceGraph.modules.length,
      oracleEndpointOccurrences: 0,
      oracleCredentialKeyOccurrences: 0,
      sshPathOccurrences: 0,
    })
  })
})

const ORACLE_OR_SSH = /(?:oraclecloud\.com|oracle[-_.]?endpoint|oracle[-_.]?(?:api[-_.]?)?(?:key|token|secret)|\bOCI_[A-Z_]+|\bssh(?:2)?\b|node:child_process)/i
