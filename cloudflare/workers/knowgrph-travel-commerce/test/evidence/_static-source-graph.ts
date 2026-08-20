import provenanceArchive from '../../../../../src/archive/provenance-archive.ts?raw'
import bundleGraphAdjacency from '../../../../../src/bundle/bundle-graph-adjacency.ts?raw'
import bundleGraphInitialization from '../../../../../src/bundle/bundle-graph-initialization.ts?raw'
import bundleGraphObservability from '../../../../../src/bundle/bundle-graph-observability.ts?raw'
import bundleGraphRecords from '../../../../../src/bundle/bundle-graph-records.ts?raw'
import bundleGraphSchema from '../../../../../src/bundle/bundle-graph-schema.ts?raw'
import bundleGraphStorage from '../../../../../src/bundle/bundle-graph-storage.ts?raw'
import bundleGraphStore from '../../../../../src/bundle/bundle-graph-store.ts?raw'
import bundleGraphValidation from '../../../../../src/bundle/bundle-graph-validation.ts?raw'
import bundleReconciliation from '../../../../../src/bundle/bundle-reconciliation.ts?raw'
import bundleRuntime from '../../../../../src/bundle/bundle-runtime.ts?raw'
import bundleSettlementState from '../../../../../src/bundle/bundle-settlement-state.ts?raw'
import bundleTypes from '../../../../../src/bundle/bundle-types.ts?raw'
import cascadeDeadline from '../../../../../src/bundle/cascade-deadline.ts?raw'
import cascadeOutcomes from '../../../../../src/bundle/cascade-outcomes.ts?raw'
import cascadeRecovery from '../../../../../src/bundle/cascade-recovery.ts?raw'
import reconciliationOperator from '../../../../../src/bundle/reconciliation-operator.ts?raw'
import reoptDispatch from '../../../../../src/bundle/reopt-dispatch.ts?raw'
import reoptWorker from '../../../../../src/bundle/reopt-worker.ts?raw'
import topoOrder from '../../../../../src/bundle/topo-order.ts?raw'
import offerCache from '../../../../../src/cache/offer-cache.ts?raw'
import guardrailEnvelopeAdapter from '../../../../../src/gate/guardrail-envelope-adapter.ts?raw'
import travelAgencyGuardrailService from '../../../../../src/gate/travel-agency-guardrail-service.ts?raw'
import envelopeLedger from '../../../../../src/ledger/envelope-ledger.ts?raw'
import envelopeLedgerAlarms from '../../../../../src/ledger/envelope-ledger-alarms.ts?raw'
import envelopeLedgerRecords from '../../../../../src/ledger/envelope-ledger-records.ts?raw'
import envelopeLedgerSchema from '../../../../../src/ledger/envelope-ledger-schema.ts?raw'
import envelopeLedgerState from '../../../../../src/ledger/envelope-ledger-state.ts?raw'
import holdLifecycle from '../../../../../src/ledger/hold-lifecycle.ts?raw'
import ordinaryOfferHolds from '../../../../../src/ledger/ordinary-offer-holds.ts?raw'
import reconciliationCustody from '../../../../../src/ledger/reconciliation-custody.ts?raw'
import costLog from '../../../../../src/runtime/cost-log.ts?raw'
import deployBoundary from '../../../../../src/runtime/deploy-boundary.ts?raw'
import inferenceRouter from '../../../../../src/runtime/inference-router.ts?raw'
import boundedJson from '../../../../../src/runtime/bounded-json.ts?raw'
import modelLicenseFilter from '../../../../../src/runtime/model-license-filter.ts?raw'
import readiness from '../../../../../src/runtime/readiness.ts?raw'
import storagePlacementGuard from '../../../../../src/runtime/storage-placement-guard.ts?raw'

export const SOURCE_MODULES: Readonly<Record<string, string>> = Object.freeze({
  'src/archive/provenance-archive.ts': provenanceArchive,
  'src/bundle/bundle-graph-adjacency.ts': bundleGraphAdjacency,
  'src/bundle/bundle-graph-initialization.ts': bundleGraphInitialization,
  'src/bundle/bundle-graph-observability.ts': bundleGraphObservability,
  'src/bundle/bundle-graph-records.ts': bundleGraphRecords,
  'src/bundle/bundle-graph-schema.ts': bundleGraphSchema,
  'src/bundle/bundle-graph-storage.ts': bundleGraphStorage,
  'src/bundle/bundle-graph-store.ts': bundleGraphStore,
  'src/bundle/bundle-graph-validation.ts': bundleGraphValidation,
  'src/bundle/bundle-reconciliation.ts': bundleReconciliation,
  'src/bundle/bundle-runtime.ts': bundleRuntime,
  'src/bundle/bundle-settlement-state.ts': bundleSettlementState,
  'src/bundle/bundle-types.ts': bundleTypes,
  'src/bundle/cascade-deadline.ts': cascadeDeadline,
  'src/bundle/cascade-outcomes.ts': cascadeOutcomes,
  'src/bundle/cascade-recovery.ts': cascadeRecovery,
  'src/bundle/reconciliation-operator.ts': reconciliationOperator,
  'src/bundle/reopt-dispatch.ts': reoptDispatch,
  'src/bundle/reopt-worker.ts': reoptWorker,
  'src/bundle/topo-order.ts': topoOrder,
  'src/cache/offer-cache.ts': offerCache,
  'src/gate/guardrail-envelope-adapter.ts': guardrailEnvelopeAdapter,
  'src/gate/travel-agency-guardrail-service.ts': travelAgencyGuardrailService,
  'src/ledger/envelope-ledger.ts': envelopeLedger,
  'src/ledger/envelope-ledger-alarms.ts': envelopeLedgerAlarms,
  'src/ledger/envelope-ledger-records.ts': envelopeLedgerRecords,
  'src/ledger/envelope-ledger-schema.ts': envelopeLedgerSchema,
  'src/ledger/envelope-ledger-state.ts': envelopeLedgerState,
  'src/ledger/hold-lifecycle.ts': holdLifecycle,
  'src/ledger/ordinary-offer-holds.ts': ordinaryOfferHolds,
  'src/ledger/reconciliation-custody.ts': reconciliationCustody,
  'src/runtime/cost-log.ts': costLog,
  'src/runtime/deploy-boundary.ts': deployBoundary,
  'src/runtime/inference-router.ts': inferenceRouter,
  'src/runtime/bounded-json.ts': boundedJson,
  'src/runtime/model-license-filter.ts': modelLicenseFilter,
  'src/runtime/readiness.ts': readiness,
  'src/runtime/storage-placement-guard.ts': storagePlacementGuard,
})

export type SourceGraph = Readonly<{
  modules: readonly string[]
  imports: readonly Readonly<{ importer: string; specifier: string }>[]
  missingRelativeModules: readonly string[]
}>

export function walkSourceGraph(roots: readonly string[]): SourceGraph {
  const visited = new Set<string>()
  const imports: { importer: string; specifier: string }[] = []
  const missing = new Set<string>()
  const queue = [...roots]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const moduleName = queue[cursor]
    if (visited.has(moduleName)) continue
    visited.add(moduleName)
    const source = SOURCE_MODULES[moduleName]
    if (typeof source !== 'string') {
      missing.add(moduleName)
      continue
    }
    for (const specifier of readImportSpecifiers(source)) {
      imports.push({ importer: moduleName, specifier })
      if (!specifier.startsWith('.')) continue
      const resolved = resolveRelative(moduleName, specifier)
      if (!(resolved in SOURCE_MODULES)) missing.add(`${moduleName} -> ${resolved}`)
      else queue.push(resolved)
    }
  }
  return Object.freeze({
    modules: Object.freeze([...visited].sort()),
    imports: Object.freeze(imports.map((entry) => Object.freeze(entry))),
    missingRelativeModules: Object.freeze([...missing].sort()),
  })
}

export function sourceFor(graph: SourceGraph): string {
  return graph.modules.map((moduleName) => SOURCE_MODULES[moduleName] ?? '').join('\n')
}

function readImportSpecifiers(source: string): readonly string[] {
  const result: string[] = []
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) result.push(match[1])
  return result
}

function resolveRelative(importer: string, specifier: string): string {
  const segments = [...importer.split('/').slice(0, -1), ...specifier.split('/')]
  const normalized: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') normalized.pop()
    else normalized.push(segment)
  }
  const joined = normalized.join('/')
  return /\.[cm]?[jt]sx?$/.test(joined) ? joined : `${joined}.ts`
}
