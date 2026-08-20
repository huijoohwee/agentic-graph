import { evictDurableObject, reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { ALLOWED_STORAGE_SYSTEMS, authorizeD1Access } from '../../../../../src/runtime/storage-placement-guard'
import { demoSeed, emitEvidence } from './_support'
import { initialize } from './_runtime'
import { sourceFor, walkSourceGraph } from './_static-source-graph'

afterEach(() => reset())

describe('check:storage-placement evidence', () => {
  it('rejects hot-path D1 and restores Durable Object state after eviction', async () => {
    for (const component of ['Bundle_Graph_Store', 'Envelope_Ledger', 'Reopt_Worker']) {
      expect(authorizeD1Access(component, 'aggregate-reporting')).toEqual({
        kind: 'rejected', reason: 'storage-placement', details: { component, purpose: 'aggregate-reporting' },
      })
    }
    expect(authorizeD1Access('Operator_Reporting', 'aggregate-reporting')).toEqual({ kind: 'allowed' })
    const seed = demoSeed('hibernate')
    const { graph, ledger, localEnv } = await initialize(seed)
    const before = await graph.getSnapshot()
    expect(await graph.getAdjacencyDiagnostics()).toEqual({ buildsThisWake: 1, edgeCount: seed.edges.length })
    await graph.affectedSet('flight-sin-nrt')
    await graph.affectedSet('experience-tsukiji')
    expect(await graph.getAdjacencyDiagnostics()).toEqual({ buildsThisWake: 1, edgeCount: seed.edges.length })
    await evictDurableObject(graph)
    await evictDurableObject(ledger)
    const restoredGraph = localEnv.BUNDLE_GRAPH.getByName(seed.bundleId)
    const restoredLedger = localEnv.ENVELOPE_LEDGER.getByName(seed.principalId)
    expect(await restoredGraph.getSnapshot()).toEqual(before)
    expect(await restoredGraph.getAdjacencyDiagnostics()).toEqual({ buildsThisWake: 1, edgeCount: seed.edges.length })
    expect(await restoredLedger.getAvailableBalance()).toMatchObject({ principalId: seed.principalId })
    const websocket = await restoredGraph.fetch(new Request('https://bundle-graph.internal/events', {
      headers: {
        upgrade: 'websocket',
        'sec-websocket-protocol': 'knowgrph.v1',
      },
    }))
    expect(websocket.status).toBe(101)
    expect(websocket.webSocket).not.toBeNull()

    const coreGraph = walkSourceGraph([
      'src/bundle/reopt-worker.ts',
      'src/bundle/bundle-graph-store.ts',
      'src/ledger/envelope-ledger.ts',
    ])
    expect(coreGraph.missingRelativeModules).toEqual([])
    expect(coreGraph.imports.filter(({ specifier }) => MODEL_CLIENT_IMPORT.test(specifier))).toEqual([])
    const coreSource = sourceFor(coreGraph)
    expect(coreSource).not.toMatch(MODEL_CALL)
    expect(coreSource).not.toMatch(HOT_PATH_D1)
    emitEvidence('check:storage-placement', ['8.1', '8.2', '8.3', '8.4', '8.6', '8.7', '8.8', '10.1', '10.6'], {
      hotPathD1Rejections: 3,
      aggregateReportingAllowed: true,
      stateRestoredAfterEviction: true,
      adjacencyBuildsBeforeEviction: 1,
      adjacencyBuildsAfterTwoMutationWalks: 1,
      adjacencyBuildsAfterWake: 1,
      hibernatableWebSocketUpgradeStatus: websocket.status,
      coreModulesScanned: coreGraph.modules.length,
      reachableModelClientImports: 0,
      reachableModelCalls: 0,
      reachableHotPathD1Calls: 0,
      allowedStorageSystems: ALLOWED_STORAGE_SYSTEMS,
    })
  })
})

const MODEL_CLIENT_IMPORT = /(?:openai|anthropic|langchain|ollama|ai-sdk|model-client)/i
const MODEL_CALL = /\.(?:runModel|generateText|chatCompletions|completePrompt)\s*\(/
const HOT_PATH_D1 = /\bD1Database\b|\benv\.(?:DB|D1)\b|\bprepareD1\s*\(/
