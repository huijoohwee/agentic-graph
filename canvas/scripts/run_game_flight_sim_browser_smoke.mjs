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
  assertExactFlightSimRendererOptionalBeacon,
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
  const actualBranch = readGitValue(['rev-parse', '--abbrev-ref', 'HEAD'])
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
      source: 'shared-r3f-ready-frame',
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
    && evidence?.deadlines?.gameplayNetworkBlockedError?.code
      === 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
    && evidence?.deadlines?.gameplayNetworkTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketBlock?.operation
      === expectedWebSocketOperation
    && evidence?.deadlines?.gameplayWebSocketBlockedError?.code
      === 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED'
    && evidence?.deadlines?.gameplayWebSocketBlockedError?.operation
      === expectedWebSocketOperation
    && evidence?.deadlines?.gameplayWebSocketFlightActive === true
    && evidence?.deadlines?.gameplayWebSocketMissionStateRetained === true
    && evidence?.deadlines?.gameplayWebSocketTransportObserved === false
    && evidence?.deadlines?.gameplayWebSocketFenceEscapeObserved === false
    && evidence?.deadlines?.gameplayWebSocketEvents?.length === 0
    && evidence?.deadlines?.gameplayWebSocketRouteHits?.length === 0
    && evidence?.deadlines?.hudUpdate?.browserElapsedMs <= 100
  )
  await assertExactFlightSimBrowserVerificationLedger(
    evidence?.verificationLedger,
  )
  assertExactFlightSimRendererOptionalBeacon(
    evidence?.renderer?.optionalBeacon,
    {
      expectedPath: FLIGHT_SIM_OPTIONAL_GLB_PATH,
      expectedSha256: sha256(await readFile(
        path.join(repoRoot, FLIGHT_SIM_OPTIONAL_GLB_PATH),
      )),
    },
  )
  if (
    evidence?.candidate?.head !== candidateHead
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
    || !deadlinesPassed
  ) {
    throw new Error(
      `Browser proof run ${runIndex} did not preserve identity, trusted touch, `
      + 'ordered mission completion, blocked transports, deadlines, and named '
      + 'verifications',
    )
  }
  return evidence
}

async function runCandidateProof() {
  const candidateHead = readGitValue(['rev-parse', 'HEAD'])
  const candidateTree = readGitValue(['rev-parse', 'HEAD^{tree}'])
  const candidateBranch = readGitValue(['rev-parse', '--abbrev-ref', 'HEAD'])
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
    schema: 'knowgrph-flight-sim-browser-proof/v3',
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
