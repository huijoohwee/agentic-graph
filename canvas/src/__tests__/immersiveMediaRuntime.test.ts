import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildImmersiveMediaAgentReadyToolContracts,
  IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS,
} from '@/features/agent-ready/immersiveMediaAgentReadyContract.mjs'
import { buildImmersiveMediaWebMcpToolBuilders } from '@/features/agent-ready/immersiveMediaWebMcpTools'
import {
  buildImmersiveMediaInvocation,
  controlLocalImmersiveMedia,
  inspectLocalImmersiveMedia,
} from '@/features/immersive-media/immersiveMediaMcpRuntime'
import {
  focusImmersiveMediaMarker,
  playImmersiveMediaIntro,
  readImmersiveMediaSnapshot,
  resetImmersiveMediaView,
  resetImmersiveMediaRuntimeForTests,
  setImmersiveMediaPolygonPattern,
  transitionImmersiveMedia,
  zoomImmersiveMedia,
} from '@/features/immersive-media/immersiveMediaRuntime'

export function testImmersiveMediaDefaultsAreZeroConfigAndCapabilityComplete() {
  resetImmersiveMediaRuntimeForTests()
  const inspection = inspectLocalImmersiveMedia()
  assert.equal(inspection.media.source.kind, 'procedural')
  assert.equal(inspection.media.source.url, '')
  assert.equal(inspection.runtime.networkRequiredForDefault, false)
  assert.deepEqual(inspection.runtime.externalDependencies, [])
  assert.deepEqual(inspection.capabilities.markerProjections, ['compass', 'map', 'plan'])
  assert.deepEqual(inspection.capabilities.markerKinds, ['pin', 'element', 'video', 'youtube', 'chroma'])
  assert.equal(inspection.capabilities.youtubeElement, true)
  assert.equal(inspection.capabilities.croppedPanorama, true)
  assert.equal(inspection.capabilities.customNavigation, true)
  assert.equal(inspection.capabilities.customTooltip, true)
  assert.equal(inspection.capabilities.partialOverlay, true)
}

export function testImmersiveMediaProjectionMarkersFocusTheSharedView() {
  resetImmersiveMediaRuntimeForTests()
  const before = readImmersiveMediaSnapshot()
  const focused = focusImmersiveMediaMarker('marker-custom-element', 'map')
  assert.equal(focused.revision, before.revision + 1)
  assert.equal(focused.selectedMarkerId, 'marker-custom-element')
  assert.equal(focused.view.yawDegrees, 38)
  assert.equal(focused.view.pitchDegrees, -4)
  assert.equal(focused.lastAction, 'marker-focus')
  assert.equal(focused.message, 'Focused Info element from the map projection.')

  const cleared = focusImmersiveMediaMarker('marker-custom-element', 'map')
  assert.equal(cleared.selectedMarkerId, null)
  assert.equal(cleared.lastAction, 'marker-clear')
  assert.equal(cleared.message, 'Cleared Info element from the map projection.')

  const unchanged = focusImmersiveMediaMarker('marker-custom-element', 'plan')
  assert.equal(unchanged, cleared)
}

export function testImmersiveMediaContextControlsPublishObservableFeedback() {
  resetImmersiveMediaRuntimeForTests()

  const zoomedIn = zoomImmersiveMedia('in')
  assert.equal(zoomedIn.view.fieldOfViewDegrees, 58)
  assert.equal(zoomedIn.lastAction, 'zoom-in')
  assert.equal(zoomedIn.message, 'Zoomed in to 58° field of view.')

  const zoomedOut = zoomImmersiveMedia('out')
  assert.equal(zoomedOut.view.fieldOfViewDegrees, 68)
  assert.equal(zoomedOut.lastAction, 'zoom-out')
  assert.equal(zoomedOut.message, 'Zoomed out to 68° field of view.')

  focusImmersiveMediaMarker('marker-custom-element', 'map')
  const reset = resetImmersiveMediaView()
  assert.deepEqual(reset.view, {
    yawDegrees: 0,
    pitchDegrees: 0,
    fieldOfViewDegrees: 68,
    lensStrength: 0,
  })
  assert.equal(reset.message, 'Shared Camera view reset.')

  const polygonHidden = setImmersiveMediaPolygonPattern(false)
  assert.equal(polygonHidden.polygonPattern, false)
  assert.equal(polygonHidden.lastAction, 'polygon')
  assert.equal(polygonHidden.message, 'Polygon marker pattern hidden.')

  const intro = playImmersiveMediaIntro()
  assert.equal(intro.lastAction, 'intro')
  assert.equal(intro.message, 'Intro animation queued on the shared Camera.')

  const transition = transitionImmersiveMedia()
  assert.equal(transition.lastAction, 'transition')
  assert.equal(transition.message, 'Bounded panorama transition queued.')

  const panelSource = readFileSync(resolve(process.cwd(), 'src/features/immersive-media/ImmersiveMediaPanelProjection.tsx'), 'utf8')
  assert.match(panelSource, /aria-label="Zoom in immersive Camera"/)
  assert.match(panelSource, /aria-label="Zoom out immersive Camera"/)
  assert.match(panelSource, /focusImmersiveMediaMarker\('marker-custom-element', 'map'\)/)
  assert.match(panelSource, /role=\{snapshot\.error \? 'alert' : 'status'\}/)
  assert.match(panelSource, /data-kg-immersive-media-selected-marker/)
}

export async function testImmersiveMediaNativeInvocationIsStrict() {
  resetImmersiveMediaRuntimeForTests()
  const transitionRevisionBeforeIntro = readImmersiveMediaSnapshot().transitionRevision
  playImmersiveMediaIntro()
  assert.equal(
    readImmersiveMediaSnapshot().transitionRevision,
    transitionRevisionBeforeIntro + 1,
  )
  const cropResult = await controlLocalImmersiveMedia({
    invocation: buildImmersiveMediaInvocation('toggle-crop'),
  })
  assert.equal(cropResult.ok, true)
  assert.equal(readImmersiveMediaSnapshot().crop.horizontalSpanDegrees, 290)

  const layerResult = await controlLocalImmersiveMedia({
    invocation: buildImmersiveMediaInvocation('layer-toggle', { layerId: 'media' }),
  })
  assert.equal(layerResult.ok, true)
  assert.equal(readImmersiveMediaSnapshot().layers.find(layer => layer.id === 'media')?.visible, false)

  const sourceResult = await controlLocalImmersiveMedia({
    invocation: buildImmersiveMediaInvocation('source', { sourceKind: 'procedural' }),
  })
  assert.equal(sourceResult.ok, true)
  assert.equal(readImmersiveMediaSnapshot().source.kind, 'procedural')
  const youtubeResult = await controlLocalImmersiveMedia({
    operation: 'marker-add',
    markerId: 'marker-youtube-approved',
    markerKind: 'youtube',
    mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  assert.equal(youtubeResult.ok, true)
  assert.equal(
    readImmersiveMediaSnapshot().markers.find(marker => marker.id === 'marker-youtube-approved')?.mediaUrl,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  )

  const nativeMarkerResult = await controlLocalImmersiveMedia({
    invocation: buildImmersiveMediaInvocation('marker-add', {
      markerId: 'marker-native',
      markerLabel: 'Native marker',
      markerKind: 'chroma',
      markerColor: '#34d399',
      markerTooltip: 'Native grammar keeps marker metadata.',
      markerLayerId: 'media',
      markerHoverScale: 1.6,
      markerProjections: ['compass', 'plan'],
      yawDegrees: 64,
      pitchDegrees: -12,
    }),
  })
  assert.equal(nativeMarkerResult.ok, true)
  assert.deepEqual(
    readImmersiveMediaSnapshot().markers.find(marker => marker.id === 'marker-native')?.projections,
    ['compass', 'plan'],
  )

  const nativeConfigureResult = await controlLocalImmersiveMedia({
    invocation: buildImmersiveMediaInvocation('configure', {
      cropped: true,
      lensStrength: 0.8,
      doubleClickZoom: false,
      keyboardActions: false,
    }),
  })
  assert.equal(nativeConfigureResult.ok, true)
  assert.equal(readImmersiveMediaSnapshot().view.lensStrength, 0.8)
  assert.equal(readImmersiveMediaSnapshot().navigation.keyboardActions, false)

  const rejectedInvocations = [
    '/media.immersive #canvas-media operation=open',
    '/media.immersive @canvas operation=open',
    '/media.immersive @canvas @canvas #canvas-media operation=open',
    '/media.immersive @canvas #canvas-media #canvas-media operation=open',
    '/media.immersive @canvas #canvas-media operation=open operation=close',
    '/media.immersive @canvas #canvas-media operation=open unknown=value',
    '/media.immersive @media-url @canvas #canvas-media operation=source sourceKind=image',
    '/media.immersive @canvas #canvas-media operation=view url=https%3A%2F%2Fexample.invalid%2Fpano.jpg',
  ]
  for (const invocation of rejectedInvocations) {
    const result = await controlLocalImmersiveMedia({ invocation })
    assert.equal(result.ok, false, invocation)
  }
}

export async function testImmersiveMediaAgentReadyContractsExposeTwoTools() {
  resetImmersiveMediaRuntimeForTests()
  const contracts = buildImmersiveMediaAgentReadyToolContracts({
    buildWebName: (name: string) => `agenticgraph.${name}`,
    readOnlyAnnotations: { readOnlyHint: true },
    mutationAnnotations: { readOnlyHint: false },
  })
  assert.deepEqual(
    contracts.map(contract => contract.name),
    [
      IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia,
      IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia,
    ],
  )
  assert.equal(contracts[0]?.webName, 'agenticgraph.inspect_local_immersive_media')
  assert.equal(contracts[1]?.webName, 'agenticgraph.control_local_immersive_media')
  const builders = buildImmersiveMediaWebMcpToolBuilders(name => {
    const contract = contracts.find(candidate => candidate.name === name)
    if (!contract) throw new Error(`missing test contract: ${name}`)
    return contract
  })
  const inspectTool = builders[IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.inspectLocalImmersiveMedia]?.()
  const controlTool = builders[IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS.controlLocalImmersiveMedia]?.()
  assert.equal(inspectTool?.name, 'agenticgraph.inspect_local_immersive_media')
  assert.equal(controlTool?.name, 'agenticgraph.control_local_immersive_media')
  const inspection = await inspectTool?.execute()
  assert.equal((inspection as ReturnType<typeof inspectLocalImmersiveMedia>).schema, 'agenticgraph-immersive-media-mcp/v1')
}

export function testImmersiveMediaReusesPanelRendererAndCameraOwnership() {
  resetImmersiveMediaRuntimeForTests()
  const panelSource = readFileSync(resolve(process.cwd(), 'src/lib/toolbar/FloatingPanelXrSceneViews.tsx'), 'utf8')
  const graphSource = readFileSync(resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'), 'utf8')
  const controlsSource = readFileSync(resolve(process.cwd(), 'src/features/three/Controls.tsx'), 'utf8')
  const stageSource = readFileSync(resolve(process.cwd(), 'src/features/immersive-media/ImmersiveMediaStage.tsx'), 'utf8')
  const geoProjectionSource = readFileSync(resolve(process.cwd(), 'src/features/immersive-media/ImmersiveMediaGeoProjection.tsx'), 'utf8')
  const projectionSource = readFileSync(resolve(process.cwd(), 'src/features/immersive-media/ImmersiveMediaMarkerProjections.tsx'), 'utf8')
  for (const surface of ['media', 'animation', 'motionControl', 'gameMode', 'flightSim', 'camera']) {
    assert.match(panelSource, new RegExp(`view === '${surface}'`))
  }
  assert.match(panelSource, /ImmersiveMediaPanelProjectionLazy/)
  assert.match(graphSource, /<ThreeGraphImmersiveMediaStage \/>/)
  assert.match(graphSource, /immersiveMediaActive=\{immersiveMediaStageActive\}/)
  assert.match(graphSource, /const immersiveMediaStageActive = immersiveMediaActive && !xrPhysicsSharedRunReadyDemo/)
  assert.match(graphSource, /data-kg-immersive-media-stage=\{immersiveMediaStageActive \? 'active' : immersiveMediaActive \? 'hud-only'/)
  assert.match(graphSource, /\{immersiveMediaActive \? <ThreeGraphImmersiveMediaHud geospatialComposite=\{geospatialComposite\}/)
  assert.match(controlsSource, /useImmersiveMediaCameraControls/)
  assert.doesNotMatch(stageSource, /<Canvas[\s>]/)
  assert.match(stageSource, /lensStrength\*radial/)
  assert.match(graphSource, /<ThreeGraphImmersiveMediaHud geospatialComposite=\{geospatialComposite\}/)
  assert.match(geoProjectionSource, /data-kg-immersive-media-geo-projection="active"/)
  assert.match(geoProjectionSource, /pointer-events-none/)
  assert.match(geoProjectionSource, /<figure/)
  assert.match(geoProjectionSource, /<figcaption/)
  assert.match(geoProjectionSource, /<figure[\s\S]*className="pointer-events-auto/)
  assert.match(geoProjectionSource, /<figcaption[\s\S]*aria-label="Immersive flight context media"/)
  assert.match(geoProjectionSource, /data-kg-rich-media-selectable-surface=\{selectableSurfaceDataAttr\}/)
  assert.match(geoProjectionSource, /className="pointer-events-auto[^"]*"[\s\S]*data-kg-rich-media-selectable-surface/)
  assert.match(geoProjectionSource, /role="img"/)
  assert.match(geoProjectionSource, /aria-label="Polygon connecting visible immersive markers"/)
  assert.match(geoProjectionSource, /<aside[\s\S]*className="pointer-events-none/)
  assert.match(geoProjectionSource, /<svg[\s\S]*className="pointer-events-none/)
  assert.match(geoProjectionSource, /<button[\s\S]*aria-pressed=\{selected\}/)
  assert.match(geoProjectionSource, /setSelectedImmersiveMediaMarker\(selected \? null : marker\.id\)/)
  assert.match(geoProjectionSource, /setHoveredImmersiveMediaMarker\(marker\.id\)/)
  assert.match(geoProjectionSource, /<output/)
  assert.doesNotMatch(geoProjectionSource, /<div\b/)
  assert.doesNotMatch(geoProjectionSource, /aria-hidden/)
  assert.match(geoProjectionSource, /completeImmersiveMediaTransition\(revision\)/)
  assert.match(projectionSource, /focusImmersiveMediaMarker/)
  assert.match(projectionSource, /aria-pressed=\{selected\}/)
  assert.match(projectionSource, /Cycle \$\{label\} projection markers/)
  for (const projection of ['compass', 'map', 'plan']) {
    assert.match(projectionSource, new RegExp(`projection-surface=\{id\}|${projection}`))
  }
}
