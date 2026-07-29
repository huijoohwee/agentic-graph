import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFile,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'
import {
  runIsolatedBrowserProof,
  runSerialBrowserProof,
} from '../../scripts/lib/game-flight-sim-browser-proof-orchestration.mjs'
import {
  assertExactFlightSimBrowserVerificationLedger,
  assertExactFlightSimOptionalBeaconAdmission,
} from '../../scripts/lib/game-flight-sim-browser-evidence.mjs'
import {
  prepareFlightSimBrowserEvidencePublication,
} from '../../scripts/lib/game-flight-sim-browser-evidence-publication.mjs'
import {
  FLIGHT_SIM_OPTIONAL_GLB_PATH,
} from '../../scripts/lib/game-flight-sim-asset-readiness.mjs'
import {
  assertGitVerificationWorkspace,
} from '../../scripts/lib/git-verification-workspace.mjs'
import {
  normalizeGameFlightSimCandidateBranch,
  resolveGameFlightSimBrowserPaths,
} from './lib/game-flight-sim-browser-paths.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const {
  canvasRoot,
  distIndexPath,
  repoRoot,
} = resolveGameFlightSimBrowserPaths(import.meta.url)
const outputRoot = path.join(repoRoot, 'data', 'outputs')
const sourcePath = path.join(
  repoRoot,
  'docs',
  'workspace-seeds',
  'knowgrph-game-flight-sim-demo.md',
)
const sourceRelativePath = 'docs/workspace-seeds/knowgrph-game-flight-sim-demo.md'
const websocketProbePath = '/flight-sim-browser-websocket-proof'
const runCount = 2
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const isolationTokenEnvironmentName = 'KG_GAME_FLIGHT_SIM_ISOLATION_TOKEN'
const browserEvidenceNames = Object.freeze([
  'game-flight-sim-browser-smoke.json',
  'game-flight-sim-browser-smoke.png',
  ...Array.from(
    { length: runCount },
    (_, index) => `game-flight-sim-browser-smoke-run-${index + 1}.json`,
  ),
  ...Array.from(
    { length: runCount },
    (_, index) => `game-flight-sim-browser-smoke-run-${index + 1}.png`,
  ),
])

process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT ||= path.resolve(process.cwd(), '../docs')
process.env.VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT ||= path.resolve(process.cwd(), '../docs/workspace-seeds')
process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL ||= '1'
// The smoke must prove that applying the authored Source File activates Flight.
delete process.env.VITE_KNOWGRPH_RUN_READY_DEMO

function readGitValue(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
}

function readGitBytes(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'buffer',
    maxBuffer: 10 * 1024 * 1024,
  })
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function hasMeterSurface(view, expected) {
  const surface = view?.environmentSurfaceMeters?.find(
    candidate => candidate?.id === expected.id,
  )
  const close = (actual, value, tolerance = 0.12) => (
    Number.isFinite(actual) && Math.abs(actual - value) <= tolerance
  )
  return Boolean(
    surface
    && close(surface.baseHeightMeters, expected.baseHeightMeters, 0.01)
    && close(surface.heightMeters, expected.heightMeters, 0.01)
    && close(surface.widthMeters, expected.widthMeters)
    && close(surface.depthMeters, expected.depthMeters)
    && (!expected.viewportBounded || surface.viewportBounded === true),
  )
}

function hasExactCityHandoffEvidence(handoff) {
  const before = handoff?.before
  const city = handoff?.city
  const disposal = handoff?.mapDisposalClear
  const restored = handoff?.restored
  const reopened = handoff?.reopened
  return (
    before?.flightActive === true
    && before?.hudVisible === true
    && before?.activeMapPresent === true
    && city?.flightActive === false
    && city?.cityActive === true
    && city?.cityStageActive === true
    && city?.activeMapPresent === false
    && city?.mapLibreCanvasCount === 0
    && city?.threeCanvasOwnerCount === 1
    && city?.hudVisible === false
    && disposal?.styleLoaded === true
    && disposal?.flight?.present === true
    && disposal?.flight?.features === 0
    && disposal?.environment?.present === true
    && disposal?.environment?.features === 0
    && restored?.flightActive === false
    && restored?.cityActive === false
    && restored?.activeMapPresent === true
    && restored?.mapLibreCanvasCount === 1
    && restored?.flightSourceFeatures === 0
    && restored?.environmentSourceFeatures === 0
    && reopened?.flightActive === true
    && reopened?.cityActive === false
    && reopened?.hudVisible === true
    && reopened?.flightSourceFeatures >= 7
    && reopened?.environmentSourceFeatures >= 10
  )
}

function hasExactInitialReadyFrameEvidence(initialReadyFrame) {
  const overlay = initialReadyFrame?.overlay
  const presentation = initialReadyFrame?.presentation
  const map = initialReadyFrame?.map
  return (
    map?.environment?.loaded === true
    && map?.overlay?.loaded === true
    && presentation?.stoppedEnvironmentLoaded === '1'
    && presentation?.stoppedOverlayLoaded === '1'
    && presentation?.stoppedProfileId === overlay?.profileId
    && presentation?.stoppedRunId === '0'
    && typeof presentation?.stoppedRevision === 'string'
    && presentation.stoppedRevision.length > 0
    && typeof presentation?.stoppedCameraSignature === 'string'
    && presentation.stoppedCameraSignature.length > 0
    && presentation.stoppedCameraSignature
      === presentation?.cameraSignature
    && /^\d+$/.test(String(presentation?.attempts || ''))
  )
}

async function assertCandidateState({
  expectedBranch,
  expectedHead,
  expectedSourceSha256,
  expectedTree,
}) {
  const status = readGitValue(['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) {
    throw new Error(
      'Game Flight Sim browser proof requires a clean exact-HEAD checkout:\n'
      + status,
    )
  }
  const actualHead = readGitValue(['rev-parse', 'HEAD'])
  const actualTree = readGitValue(['rev-parse', 'HEAD^{tree}'])
  const actualBranch = normalizeGameFlightSimCandidateBranch(
    readGitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
  )
  const diskSource = await readFile(sourcePath)
  const committedSource = readGitBytes([
    'show',
    `${expectedHead}:${sourceRelativePath}`,
  ])
  if (
    actualHead !== expectedHead
    || actualTree !== expectedTree
    || actualBranch !== expectedBranch
    || sha256(diskSource) !== expectedSourceSha256
    || sha256(committedSource) !== expectedSourceSha256
    || !diskSource.equals(committedSource)
  ) {
    throw new Error(
      'Game Flight Sim branch, candidate HEAD/tree, committed seed, and disk seed '
      + 'are not byte-identical',
    )
  }
}

async function buildExactProductionPreview(candidate) {
  await assertCandidateState(candidate)
  await new Promise((resolvePromise, reject) => {
    const child = spawn(npmCommand, ['run', 'build'], {
      cwd: canvasRoot,
      env: {
        ...process.env,
        KG_SKIP_DOCS_UPDATE: '1',
        VITE_BASE_PATH: '/',
        VITE_KNOWGRPH_FLIGHT_SIM_BROWSER_PROOF: '1',
      },
      shell: false,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(
        signal
          ? `production preview build terminated by signal ${signal}`
          : `production preview build exited with status ${code ?? 'unknown'}`,
      ))
    })
  })
  await assertCandidateState(candidate)
  const indexBytes = await readFile(distIndexPath)
  const indexSource = indexBytes.toString('utf8')
  if (
    !indexSource.includes('<main id="root"></main>')
    || indexSource.includes('/@vite/client')
  ) {
    throw new Error(
      'Flight browser proof requires a built root shell without the Vite client',
    )
  }
  return Object.freeze({
    basePath: '/',
    indexSha256: sha256(indexBytes),
    mode: 'vite-preview',
  })
}

async function clearPriorEvidence() {
  await Promise.all(browserEvidenceNames.map(name => rm(path.join(outputRoot, name), {
    force: true,
  })))
}

async function readValidatedRunEvidence({
  candidateBranch,
  candidateHead,
  candidateTree,
  runIndex,
  sourceSha256,
}) {
  const evidencePath = path.join(
    outputRoot,
    `game-flight-sim-browser-smoke-run-${runIndex}.json`,
  )
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
  const expectedWebSocketProbeUrl = new URL(
    websocketProbePath,
    evidence?.targetUrl,
  )
  expectedWebSocketProbeUrl.protocol = (
    expectedWebSocketProbeUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  )
  const expectedWebSocketOperation = (
    `websocket:${expectedWebSocketProbeUrl.toString()}`
  )
  const deadlineContracts = {
    webglAdmission: {
      limitMs: 100,
      source: 'browser-webgl-probe',
      synchronous: true,
    },
    readyFrame: {
      limitMs: 100,
      source: 'native-maplibre-flight-ready-frame',
      synchronous: false,
    },
    hudUpdate: {
      limitMs: 100,
      source: 'runtime-publish-to-hud-layout',
      synchronous: false,
    },
    gameplayNetworkBlock: {
      limitMs: 1_000,
      source: 'flight-runtime-network-guard',
      synchronous: true,
    },
    gameplayWebSocketBlock: {
      limitMs: 1_000,
      source: 'flight-runtime-network-guard',
      synchronous: true,
    },
  }
  const deadlinesPassed = Object.entries(deadlineContracts).every(
    ([name, contract]) => {
      const observation = evidence?.deadlines?.[name]
      return (
        observation?.withinLimit === true
        && observation?.source === contract.source
        && observation?.synchronous === contract.synchronous
        && observation?.limitMs === contract.limitMs
        && Number.isFinite(observation?.elapsedMs)
        && observation.elapsedMs <= contract.limitMs
      )
    },
  ) && (
    evidence?.deadlines?.webglAdmission?.available === true
    && evidence?.deadlines?.readyFrame?.tick === 0
    && evidence?.deadlines?.gameplayNetworkBlock?.operation
      === 'fetch:GET:/api/storage/flight-sim-browser-deadline-proof'
    && evidence?.deadlines?.gameplayNetworkExecutorInvoked === false
    && evidence?.deadlines?.gameplayNetworkMissionStateRetained === true
    && evidence?.deadlines?.gameplayNetworkBlockedSnapshot?.runtimeError
      === 'Flight Sim blocked gameplay network operation: fetch:GET:/api/storage/flight-sim-browser-deadline-proof'
    && evidence?.deadlines?.gameplayNetworkTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketBlock?.operation
      === expectedWebSocketOperation
    && evidence?.deadlines?.gameplayWebSocketExecutorInvoked === false
    && evidence?.deadlines?.gameplayWebSocketBlockedSnapshot?.runtimeError
      === `Flight Sim blocked gameplay network operation: ${expectedWebSocketOperation}`
    && evidence?.deadlines?.gameplayWebSocketFlightActive === true
    && evidence?.deadlines?.gameplayWebSocketMissionStateRetained === true
    && evidence?.deadlines?.gameplayWebSocketTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketFenceEscapeObserved === false
    && evidence?.deadlines?.gameplayWebSocketEvents?.length === 0
    && evidence?.deadlines?.gameplayWebSocketRouteHits?.length === 0
    && evidence?.deadlines?.hudUpdate?.browserElapsedMs <= 100
    && hasExactInitialReadyFrameEvidence(
      evidence?.deadlines?.initialReadyFrame,
    )
  )
  const expectedGeoXrViews = [
    {
      viewMode: '2d',
      projection: 'mercator',
      styleUrl: 'https://demotiles.maplibre.org/style.json',
    },
    {
      viewMode: '2d-modern',
      projection: 'mercator',
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    },
    {
      viewMode: '3d',
      projection: 'globe',
      styleUrl: 'https://demotiles.maplibre.org/globe.json',
    },
    {
      viewMode: '3d-modern',
      projection: 'globe',
      styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    },
  ]
  const geoXrViews = evidence?.geoXrPresentation?.views
  const geoXrPresentationPassed = (
    Array.isArray(geoXrViews)
    && geoXrViews.length === expectedGeoXrViews.length
    && geoXrViews.every((view, index) => {
      const expected = expectedGeoXrViews[index]
      return (
        view?.viewMode === expected.viewMode
        && view?.projection === expected.projection
        && view?.styleUrl === expected.styleUrl
        && view?.hostActive === true
        && typeof view?.hostRevision === 'string'
        && view.hostRevision.length > 0
        && view?.visibleMapLibreCanvasCount === 1
        && view?.rendererCanvasCount === 1
        && view?.rendererAlpha === true
        && view?.nativeVisualCount === 0
        && view?.flightR3fVisualCount === 0
        && view?.visualProjection === 'maplibre'
        && view?.rendererPointerTransparent === true
        && view?.exclusivePlainGeoOverlayCount === 0
        && view?.flightLayersReady === true
        && view?.flightLayersTopmost === true
        && view?.aircraftLayerType === 'symbol'
        && view?.aircraftGeometryType === 'Polygon'
        && view?.aircraftImagesReady === true
        && Number(view?.aircraftImagePixelWidth || 0) >= 40
        && view?.environmentId === 'singapore'
        && JSON.stringify(view?.environmentPresentationBounds)
          === JSON.stringify([[103.605, 1.158], [104.09, 1.48]])
        && view?.environmentLayersReady === true
        && Number(view?.environmentSourceFeatures || 0) >= 10
        && hasMeterSurface(view, {
          id: 'singapore:footprint',
          baseHeightMeters: 0,
          heightMeters: 0.08,
          widthMeters: 32,
          depthMeters: 24,
          viewportBounded: true,
        })
        && hasMeterSurface(view, {
          id: 'skyline-center',
          baseHeightMeters: 0,
          heightMeters: 12,
          widthMeters: 4.4,
          depthMeters: 4.4,
        })
        && view?.selectedEnvironmentSubjectsExact === true
        && view?.environmentSourceExactlyMatchesOverlay === true
        && ['stage-footprint', 'structure', 'subject'].every(kind =>
          view?.renderedEnvironmentKinds?.includes(kind),
        )
        && view?.renderedEnvironmentSubjectIds?.some(subjectId =>
          String(subjectId).includes('vehicle-'),
        )
        && view?.objectiveGuideFeatureCount === 1
        && view?.routeInViewport === true
        && view?.aircraftInViewport === true
        && Number(view?.center?.[0]) >= 103.605
        && Number(view?.center?.[0]) <= 104.09
        && Number(view?.center?.[1]) >= 1.158
        && Number(view?.center?.[1]) <= 1.48
        && (
          expected.viewMode.startsWith('3d')
            ? Number(view?.pitch || 0) >= 22
            : Math.abs(Number(view?.pitch || 0)) < 0.01
        )
        && Math.max(
          Number(view?.routeScreenSpan?.x || 0),
          Number(view?.routeScreenSpan?.y || 0),
        ) >= 80
        && JSON.stringify(view?.renderedKinds)
          === JSON.stringify([
            'aircraft',
            'objective-guide',
            'route',
            'route-point',
          ])
        && Number(view?.renderedFeatureCount || 0) >= 4
        && Number.isFinite(view?.mapPointerHit?.x)
        && Number.isFinite(view?.mapPointerHit?.y)
      )
    })
    && evidence?.geoXrPresentation?.sourceView
      === evidence?.geoXrPresentation?.restoredView?.viewMode
    && evidence?.geoXrPresentation?.sourceStyleUrl
      === evidence?.geoXrPresentation?.restoredView?.styleUrl
    && hasExactCityHandoffEvidence(
      evidence?.geoXrPresentation?.cityHandoff,
    )
    && evidence?.geoXrPresentation?.liveMovement?.after?.flightTick
      > evidence?.geoXrPresentation?.liveMovement?.before?.flightTick
    && evidence?.geoXrPresentation?.liveMovement?.after?.overlayRevision
      !== evidence?.geoXrPresentation?.liveMovement?.before?.overlayRevision
    && JSON.stringify(
      evidence?.geoXrPresentation?.liveMovement?.after?.aircraftCoordinate,
    ) !== JSON.stringify(
      evidence?.geoXrPresentation?.liveMovement?.before?.aircraftCoordinate,
    )
  )
  await assertExactFlightSimBrowserVerificationLedger(
    evidence?.verificationLedger,
  )
  assertExactFlightSimOptionalBeaconAdmission(
    evidence?.renderer?.optionalBeacon,
    {
      expectedPath: FLIGHT_SIM_OPTIONAL_GLB_PATH,
      expectedSha256: sha256(await readFile(
        path.join(repoRoot, FLIGHT_SIM_OPTIONAL_GLB_PATH),
      )),
    },
  )
  if (
    evidence?.schema !== 'knowgrph-flight-sim-browser-run/v5'
    || evidence?.candidate?.head !== candidateHead
    || evidence?.candidate?.tree !== candidateTree
    || evidence?.candidate?.branch !== candidateBranch
    || evidence?.candidate?.runtimeRevision !== candidateHead
    || evidence?.candidate?.runtimeBranch !== candidateBranch
    || evidence?.source?.sha256 !== sourceSha256
    || evidence?.source?.authoredSeedSha256 !== sourceSha256
    || evidence?.source?.workspaceSourceSha256 !== sourceSha256
    || evidence?.runIndex !== runIndex
    || evidence?.runCount !== runCount
    || evidence?.inputProof?.touchInteraction?.exercised !== true
    || evidence?.inputProof?.touchInteraction?.runId
      !== evidence?.missionProof?.runId
    || evidence?.inputProof?.motionControlPanelHandoff?.flightPreservedWhileMotionPanelOpen !== true
    || evidence?.inputProof?.motionControlPanelHandoff?.captureSurfacePreservedAfterFlightReturn !== true
    || JSON.stringify(evidence?.navigation?.views)
      !== JSON.stringify(['chase', 'cockpit', 'survey'])
    || evidence?.navigation?.buttonSelection !== 'cockpit'
    || evidence?.navigation?.keyboardCycle !== 'survey'
    || evidence?.navigation?.restored !== 'chase'
    || evidence?.navigation?.routePointCount !== 5
    || evidence?.navigation?.activeRoutePointCount !== 1
    || evidence?.navigation?.sharedCameraSourceRetained !== true
    || evidence?.navigation?.singleCanvasRetained !== true
    || evidence?.navigation?.tickAfter <= evidence?.navigation?.tickBefore
    || !Object.values(evidence?.navigation?.forwardAlignment || {})
      .every(value => Number.isFinite(value) && value > 0.2)
    || evidence?.missionProof?.phase !== 'completed'
    || evidence?.missionProof?.waypointIndex !== 3
    || evidence?.missionProof?.transitions?.length !== 3
    || evidence?.missionProof?.pendingUntilExplicitSave !== true
    || evidence?.webSocketProbe?.url
      !== expectedWebSocketProbeUrl.toString()
    || evidence?.webSocketProbe?.productionFenceEscapeObserved !== false
    || evidence?.webSocketProbe?.serverTransportAllowed !== false
    || evidence?.webSocketProbe?.transportObserved !== false
    || evidence?.webSocketProbe?.events?.length !== 0
    || evidence?.webSocketProbe?.routeHits?.length !== 0
    || evidence?.webSocketAttempts?.routePattern !== '**/*'
    || evidence?.webSocketAttempts?.serverTransportAllowed !== false
    || evidence?.webSocketAttempts?.events?.length !== 0
    || evidence?.webSocketAttempts?.routeHits?.length !== 0
    || evidence?.webSocketAttempts?.unexpectedEvents?.length !== 0
    || evidence?.webSocketAttempts?.unexpectedRouteHits?.length !== 0
    || evidence?.renderer?.mapLibreCanvasCount !== 1
    || evidence?.renderer?.visibleMapLibreCanvasCount !== 1
    || evidence?.renderer?.transparentFlightRuntimeCanvas !== true
    || evidence?.renderer?.mapLibreOwnsVisualProjection !== true
    || evidence?.renderer?.nativeXrVisualsSuppressed !== true
    || evidence?.renderer?.r3fFlightVisualsSuppressed !== true
    || !geoXrPresentationPassed
    || !Array.isArray(evidence?.geoProviderRequests)
    || evidence.geoProviderRequests.length === 0
    || evidence?.unexpectedNonLocalRequests?.length !== 0
    || evidence?.blockedRequests?.length !== 0
    || !deadlinesPassed
  ) {
    throw new Error(
      `Browser proof run ${runIndex} did not preserve identity, trusted touch, `
      + 'local navigation, ordered mission completion, blocked transports, deadlines, and named '
      + 'verifications',
    )
  }
  return evidence
}

async function runCandidateProof() {
  const candidateHead = readGitValue(['rev-parse', 'HEAD'])
  const candidateTree = readGitValue(['rev-parse', 'HEAD^{tree}'])
  const candidateBranch = normalizeGameFlightSimCandidateBranch(
    readGitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
  )
  const sourceSha256 = sha256(await readFile(sourcePath))
  const candidate = {
    expectedBranch: candidateBranch,
    expectedHead: candidateHead,
    expectedSourceSha256: sourceSha256,
    expectedTree: candidateTree,
  }
  const firstPort = Number(process.env.KG_GAME_FLIGHT_SIM_SMOKE_PORT || '4187')
  if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65534) {
    throw new Error(`Invalid KG_GAME_FLIGHT_SIM_SMOKE_PORT: ${firstPort}`)
  }
  process.env.KNOWGRPH_SOURCE_REVISION = candidateHead
  const productionBuild = await buildExactProductionPreview(candidate)

  const runs = await runSerialBrowserProof({
    assertExactCandidate: () => assertCandidateState(candidate),
    clearPriorEvidence,
    executeRun: async runIndex => {
      process.env.KG_GAME_FLIGHT_SIM_EXPECTED_HEAD = candidateHead
      process.env.KG_GAME_FLIGHT_SIM_EXPECTED_TREE = candidateTree
      process.env.KG_GAME_FLIGHT_SIM_EXPECTED_BRANCH = candidateBranch
      process.env.KG_GAME_FLIGHT_SIM_EXPECTED_SOURCE_SHA256 = sourceSha256
      process.env.KG_GAME_FLIGHT_SIM_SMOKE_RUN_INDEX = String(runIndex)
      process.env.KG_GAME_FLIGHT_SIM_SMOKE_RUN_COUNT = String(runCount)
      await runLocalViteBrowserSmoke({
        logLabel: `game-flight-sim-browser-smoke-run-${runIndex}`,
        devServerPort: String(firstPort + runIndex - 1),
        devServerPath: '/',
        baseUrlEnvName: 'KG_GAME_FLIGHT_SIM_SMOKE_BASE_URL',
        verifierCommand: 'python3',
        verifierArgs: ['scripts/verify_game_flight_sim_browser_smoke.py'],
        verifierFailureLabel: `Game Flight Sim browser smoke run ${runIndex}`,
        prepareBeforeStart: false,
        devServerStartMode: 'vite-preview-runner',
        existingServerPolicy: 'forbid',
      })
    },
    runCount,
    validateRunEvidence: runIndex => readValidatedRunEvidence({
      candidateBranch,
      candidateHead,
      candidateTree,
      runIndex,
      sourceSha256,
    }),
  })

  const aggregate = {
    schema: 'knowgrph-flight-sim-browser-proof/v5',
    candidate: {
      head: candidateHead,
      tree: candidateTree,
      branch: candidateBranch,
    },
    source: {
      path: sourceRelativePath,
      sha256: sourceSha256,
    },
    runCount,
    productionBuild,
    freshServerPerRun: true,
    serial: true,
    runs,
  }
  const aggregatePath = path.join(
    outputRoot,
    'game-flight-sim-browser-smoke.json',
  )
  const aggregateTemporaryPath = `${aggregatePath}.tmp-${process.pid}`
  await writeFile(
    aggregateTemporaryPath,
    `${JSON.stringify(aggregate, null, 2)}\n`,
    'utf8',
  )
  await rename(aggregateTemporaryPath, aggregatePath)
  await copyFile(
    path.join(outputRoot, `game-flight-sim-browser-smoke-run-${runCount}.png`),
    path.join(outputRoot, 'game-flight-sim-browser-smoke.png'),
  )
  console.log(
    `[game-flight-sim-browser-smoke] two fresh serial runs passed at ${candidateHead}`,
  )
}

async function executeIsolatedProof(isolatedRepositoryRoot, token) {
  const isolatedCanvasRoot = path.join(isolatedRepositoryRoot, 'canvas')
  const isolatedScriptPath = path.join(
    isolatedCanvasRoot,
    'scripts',
    path.basename(scriptPath),
  )
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [isolatedScriptPath], {
      cwd: isolatedCanvasRoot,
      env: {
        ...process.env,
        [isolationTokenEnvironmentName]: token,
        VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: path.join(
          isolatedRepositoryRoot,
          'docs',
        ),
        VITE_KNOWGRPH_WORKSPACE_SEEDS_ABS_ROOT: path.join(
          isolatedRepositoryRoot,
          'docs',
          'workspace-seeds',
        ),
      },
      shell: false,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(new Error(
        signal
          ? `isolated browser proof terminated by signal ${signal}`
          : `isolated browser proof exited with status ${code ?? 'unknown'}`,
      ))
    })
  })
}

async function prepareIsolatedEvidence(isolatedRepositoryRoot) {
  return prepareFlightSimBrowserEvidencePublication({
    destinationRoot: outputRoot,
    names: browserEvidenceNames,
    sourceRoot: path.join(isolatedRepositoryRoot, 'data', 'outputs'),
  })
}

async function run() {
  const isolationToken = process.env[isolationTokenEnvironmentName]
  if (isolationToken) {
    await assertGitVerificationWorkspace({
      repositoryRoot: repoRoot,
      token: isolationToken,
    })
    await runCandidateProof()
    return
  }
  await runIsolatedBrowserProof({
    prepareEvidence: prepareIsolatedEvidence,
    repositoryRoot: repoRoot,
    runProof: executeIsolatedProof,
  })
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
