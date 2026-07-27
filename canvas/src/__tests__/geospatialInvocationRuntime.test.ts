import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { GraphData } from '@/lib/graph/types'
import type {
  GeospatialBounds,
  NormalizedEnhancedConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'
import { GEO_COMMAND_SCHEMA_ID } from 'grph-shared/geospatial/enhancedLayerContract'
import {
  KNOWGRPH_GEOSPATIAL_MODE_DOC_INVOCATION,
  getAgenticOsDocInvocations,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { buildChatInvocationCatalog } from '@/features/chat/chatInvocationRegistry'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { tryActivateGeospatialInvocation } from '@/features/chat/floatingPanelChat/geospatialInvocationSubmit'
import {
  buildConsumedGeoCommandUrl,
  claimGeoCommandDeepLink,
} from '@/features/geospatial/geoCommandDeepLink'
import {
  parseGeoInvocation,
  type GeoCommandBridge,
} from '@/features/geospatial/geoInvocationDispatcher'
import {
  applyGeoCommandFromGraph,
  runGeoInvocation,
} from '@/features/geospatial/geoInvocationRuntime'
import { setGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'

const GRAPH_DATA: GraphData = {
  type: 'graph',
  nodes: [
    {
      id: 'geo-node',
      label: 'Geo node',
      type: 'Location',
      properties: { geo: { lat: 1.29, lng: 103.85 } },
    },
    {
      id: 'plain-node',
      label: 'Plain node',
      type: 'Note',
      properties: {},
    },
  ],
  edges: [],
}

const ENHANCED_CONFIG: NormalizedEnhancedConfig = {
  extrusions: [{
    id: 'buildings',
    datasetId: 'city',
    url: '/city.geojson',
    kind: 'building',
    heightProperty: 'height',
    defaultHeightMeters: 12,
    baseHeightMeters: 0,
    fillColor: '#334155',
    fillOpacity: 0.7,
    tags: ['#city'],
    visible: true,
    fetchBound: { timeoutMs: 1_000, maxBytes: 1_024 },
  }],
  assets: [],
  diagnostics: [],
}

type BridgeAction =
  | `mode:${boolean}`
  | `layer:${'extrusion' | 'asset'}:${string}:${boolean}`
  | `tag:${string}:${boolean}`
  | { fitBounds: GeospatialBounds }

const createRecordingBridge = (actions: BridgeAction[]): GeoCommandBridge => ({
  setMode: async enabled => {
    actions.push(`mode:${enabled}`)
    return enabled
  },
  setLayer: async (kind, id, visible) => {
    actions.push(`layer:${kind}:${id}:${visible}`)
    return true
  },
  setTag: async (tag, visible) => {
    actions.push(`tag:${tag}:${visible}`)
    return ['buildings']
  },
  fitBounds: async bounds => {
    actions.push({ fitBounds: bounds })
  },
})

const assertHandledSuccess = (
  result: Awaited<ReturnType<typeof runGeoInvocation>>,
  label: string,
): void => {
  if (result.handled === false || result.result.ok === false) {
    throw new Error(`${label} should succeed: ${JSON.stringify(result)}`)
  }
}

const assertHandledRejection = (
  result: Awaited<ReturnType<typeof runGeoInvocation>>,
  code: string,
): void => {
  if (result.handled === false) {
    throw new Error(`expected ${code} rejection, got ${JSON.stringify(result)}`)
  }
  if (result.result.ok === true || result.result.rejection.code !== code) {
    throw new Error(`expected ${code} rejection, got ${JSON.stringify(result)}`)
  }
  if (result.result.rejection.message.length > 140) {
    throw new Error(`rejection exceeds 140 characters: ${result.result.rejection.message}`)
  }
}

export function testGeospatialInvocationCatalogExposesCanonicalCommand() {
  const docs = getAgenticOsDocInvocations()
  if (!docs.includes(KNOWGRPH_GEOSPATIAL_MODE_DOC_INVOCATION)) {
    throw new Error('expected the canonical geospatial document invocation in the shared document registry')
  }
  const catalogEntries = buildChatInvocationCatalog()
  const slashEntry = catalogEntries.find(entry => entry.token === '/geo')
  if (
    !slashEntry
    || slashEntry.sourcePath !== KNOWGRPH_GEOSPATIAL_MODE_DOC_INVOCATION.sourcePath
    || slashEntry.kind !== 'doc'
  ) {
    throw new Error(`expected /geo discovery through the shared chat catalog, got ${JSON.stringify(slashEntry)}`)
  }
}

export async function testGeospatialInvocationRuntimeClaimsOnlyGeoSurfaces() {
  const actions: BridgeAction[] = []
  const configReads: string[] = []
  const readConfigCount = () => configReads.length
  const dependencies = {
    bridge: createRecordingBridge(actions),
    readConfig: async () => {
      configReads.push('read')
      return ENHANCED_CONFIG
    },
  }

  const modeResult = await runGeoInvocation({ raw: '/geo on', graphData: GRAPH_DATA, dependencies })
  assertHandledSuccess(modeResult, '/geo on')
  if (actions[0] !== 'mode:true' || readConfigCount() !== 0) {
    throw new Error(`mode command should use only the bridge: ${JSON.stringify({ actions, configReads })}`)
  }

  const fitResult = await runGeoInvocation({ raw: '@geo-node', graphData: GRAPH_DATA, dependencies })
  assertHandledSuccess(fitResult, '@geo-node')
  const fitAction = actions[1]
  if (
    !fitAction
    || typeof fitAction === 'string'
    || fitAction.fitBounds.join(',') !== '103.85,1.29,103.85,1.29'
  ) {
    throw new Error(`expected exact geo-node bounds, got ${JSON.stringify(fitAction)}`)
  }

  const tagResult = await runGeoInvocation({ raw: '#city SHOW', graphData: GRAPH_DATA, dependencies })
  assertHandledSuccess(tagResult, '#city SHOW')
  if (actions[2] !== 'tag:#city:true' || readConfigCount() !== 1) {
    throw new Error(`tag command should load config once and use the bridge: ${JSON.stringify({ actions, configReads })}`)
  }

  const actionCountBeforeRejections = actions.length
  assertHandledRejection(
    await runGeoInvocation({ raw: '@plain-node', graphData: GRAPH_DATA, dependencies }),
    'no-geo-bounds',
  )
  assertHandledRejection(
    await runGeoInvocation({ raw: '#missing hide', graphData: GRAPH_DATA, dependencies }),
    'no-tag-match',
  )
  assertHandledRejection(
    await runGeoInvocation({ raw: '/geo explode', graphData: GRAPH_DATA, dependencies }),
    'unknown-action',
  )
  if (actions.length !== actionCountBeforeRejections) {
    throw new Error(`rejected commands must not mutate the bridge: ${JSON.stringify(actions)}`)
  }

  for (const input of ['/canvas.center', '/geo.author buildings', '/geospatially on', '@operator', '#memory.search']) {
    const result = await runGeoInvocation({ raw: input, graphData: GRAPH_DATA, dependencies })
    if (result.handled) throw new Error(`unrelated invocation was claimed by geospatial runtime: ${input}`)
  }
  if (
    parseGeoInvocation('#city').ok
    || parseGeoInvocation('@geo node').ok
    || parseGeoInvocation('/geo on extra').ok
    || parseGeoInvocation('/geo extrusion buildings hide extra').ok
  ) {
    throw new Error('ambiguous bare tags and multi-token @ references must fail closed')
  }
}

export async function testGeospatialChatSubmitBypassesGenericPreflight() {
  const actions: BridgeAction[] = []
  let errorText: string | null = 'stale'
  let input = '/geo on'
  const submitArgs = {
    graphData: GRAPH_DATA,
    setErrorText: (value: string | null) => {
      errorText = value
    },
    setInput: (value: string) => {
      input = value
    },
  } as unknown as FloatingPanelChatSubmitArgs
  const handled = await tryActivateGeospatialInvocation(
    { input, submitArgs },
    { bridge: createRecordingBridge(actions) },
  )
  if (!handled || input !== '' || errorText !== null || actions[0] !== 'mode:true') {
    throw new Error(`expected local geospatial activation before chat transport: ${JSON.stringify({ handled, input, errorText, actions })}`)
  }

  input = '@operator'
  if (await tryActivateGeospatialInvocation({ input, submitArgs }, { bridge: createRecordingBridge(actions) })) {
    throw new Error('an unrelated @ binding must continue to the existing chat invocation path')
  }

  const submitHookSource = readFileSync(
    resolve(process.cwd(), 'src/features/chat/floatingPanelChat/useFloatingPanelChatSubmit.ts'),
    'utf8',
  )
  const geoIndex = submitHookSource.indexOf('activateGeospatialInvocation({')
  const preflightIndex = submitHookSource.indexOf('resolveRequestUrlOrSetError({')
  if (geoIndex < 0 || preflightIndex < 0 || geoIndex >= preflightIndex) {
    throw new Error('expected geospatial activation before generic chat request preflight')
  }
}

export async function testGeospatialMcpDeepLinkIsClaimedOnceAndUsesSharedRuntime() {
  const command = {
    schemaId: GEO_COMMAND_SCHEMA_ID,
    command: { kind: 'extrusion.visibility', layerId: 'buildings', visible: false },
  } as const
  const query = new URLSearchParams({
    kgGeo: '1',
    kgGeoCommand: JSON.stringify(command),
  })
  const claimState = { handled: false }
  const claim = claimGeoCommandDeepLink(`?${query.toString()}`, claimState)
  if (claim?.kind !== 'command') throw new Error(`expected a validated command claim, got ${JSON.stringify(claim)}`)
  if (claimGeoCommandDeepLink(`?${query.toString()}`, claimState) !== null) {
    throw new Error('the same MCP deep link must be claimed at most once')
  }

  const actions: BridgeAction[] = []
  const result = await applyGeoCommandFromGraph({
    command: claim.envelope.command,
    graphData: GRAPH_DATA,
    dependencies: {
      bridge: createRecordingBridge(actions),
      readConfig: async () => ENHANCED_CONFIG,
    },
  })
  if (!result.ok || actions[0] !== 'layer:extrusion:buildings:false') {
    throw new Error(`expected MCP envelope to use the shared bridge-only command runtime: ${JSON.stringify({ result, actions })}`)
  }

  const consumedUrl = buildConsumedGeoCommandUrl(`https://example.test/canvas?${query.toString()}#map`)
  if (consumedUrl.includes('kgGeoCommand') || !consumedUrl.includes('kgGeo=1') || !consumedUrl.endsWith('#map')) {
    throw new Error(`expected one-shot command consumption to preserve mode and hash: ${consumedUrl}`)
  }
  const invalidClaim = claimGeoCommandDeepLink('?kgGeo=1&kgGeoCommand=%7B', { handled: false })
  if (invalidClaim?.kind !== 'invalid') {
    throw new Error(`expected malformed MCP envelopes to fail closed, got ${JSON.stringify(invalidClaim)}`)
  }
  const emptyClaim = claimGeoCommandDeepLink('?kgGeo=1&kgGeoCommand=', { handled: false })
  if (emptyClaim?.kind !== 'invalid') {
    throw new Error(`expected an empty MCP command parameter to fail closed, got ${JSON.stringify(emptyClaim)}`)
  }

  const hostSource = readFileSync(
    resolve(process.cwd(), 'src/features/canvas/useCanvasGeospatialRuntime.ts'),
    'utf8',
  )
  for (const expected of [
    'claimGeoCommandDeepLink',
    'applyGeoCommandFromGraph',
    'setGeospatialModeEnabledThroughBridge',
    'upsertUiToast',
  ]) {
    if (!hostSource.includes(expected)) throw new Error(`geospatial deep-link host is missing ${expected}`)
  }
  for (const forbidden of [
    "import('gympgrph')",
    'resolveNodeBounds: () => null',
    'writeGeospatialOverlayEnabledPreference',
  ]) {
    if (hostSource.includes(forbidden)) throw new Error(`deep-link host bypasses the shared runtime: ${forbidden}`)
  }
}

export async function testGeospatialModeBridgeRollsBackFailedRuntimeImport() {
  const publishedModes: boolean[] = []
  let loadAttempts = 0
  let thrownMessage = ''
  try {
    await setGeospatialModeEnabled(true, {
      loadRuntime: async () => {
        loadAttempts += 1
        throw new Error('runtime-import-failed')
      },
      publishMode: enabled => {
        publishedModes.push(enabled)
        return false
      },
    })
  } catch (error) {
    thrownMessage = error instanceof Error ? error.message : String(error)
  }
  if (
    loadAttempts !== 1
    || thrownMessage !== 'runtime-import-failed'
    || publishedModes.join(',') !== 'true,false'
  ) {
    throw new Error(`expected optimistic mode write to roll back on import failure: ${JSON.stringify({
      loadAttempts,
      thrownMessage,
      publishedModes,
    })}`)
  }

  const bridgeSource = readFileSync(
    resolve(process.cwd(), 'src/features/geospatial/gympgrphBridge.ts'),
    'utf8',
  )
  if (bridgeSource.includes('setGeospatialViewMode')) {
    throw new Error('mode enable rollback must not mutate the persisted geospatial view mode')
  }
}
