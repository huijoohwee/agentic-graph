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
  prepareFlightSimBrowserEvidencePublication,
} from '../../scripts/lib/game-flight-sim-browser-evidence-publication.mjs'
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
  'agentic-graph-game-flight-sim-demo.md',
)
const sourceRelativePath = 'docs/workspace-seeds/agentic-graph-game-flight-sim-demo.md'
const websocketProbePath = '/flight-sim-browser-websocket-proof'
const runCount = 2
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const isolationTokenEnvironmentName = 'AG_GAME_FLIGHT_SIM_ISOLATION_TOKEN'
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
process.env.VITE_AGENTIC_OS_RUN_READY_REPO_LOCAL ||= '1'
// The smoke must prove that applying the authored Source File activates Flight.
delete process.env.VITE_AGENTIC_OS_RUN_READY_DEMO

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
        AG_SKIP_DOCS_UPDATE: '1',
        VITE_BASE_PATH: '/',
        VITE_AGENTIC_OS_FLIGHT_SIM_BROWSER_PROOF: '1',
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
  const firstPort = Number(process.env.AG_GAME_FLIGHT_SIM_SMOKE_PORT || '4187')
  if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65534) {
    throw new Error(`Invalid AG_GAME_FLIGHT_SIM_SMOKE_PORT: ${firstPort}`)
  }
  process.env.AGENTIC_OS_SOURCE_REVISION = candidateHead
  const productionBuild = await buildExactProductionPreview(candidate)
  const {
    readValidatedFlightSimBrowserRunEvidence,
  } = await import('./lib/game-flight-sim-browser-evidence-validation.mjs')

  const runs = await runSerialBrowserProof({
    assertExactCandidate: () => assertCandidateState(candidate),
    clearPriorEvidence,
    executeRun: async runIndex => {
      process.env.AG_GAME_FLIGHT_SIM_EXPECTED_HEAD = candidateHead
      process.env.AG_GAME_FLIGHT_SIM_EXPECTED_TREE = candidateTree
      process.env.AG_GAME_FLIGHT_SIM_EXPECTED_BRANCH = candidateBranch
      process.env.AG_GAME_FLIGHT_SIM_EXPECTED_SOURCE_SHA256 = sourceSha256
      process.env.AG_GAME_FLIGHT_SIM_SMOKE_RUN_INDEX = String(runIndex)
      process.env.AG_GAME_FLIGHT_SIM_SMOKE_RUN_COUNT = String(runCount)
      await runLocalViteBrowserSmoke({
        logLabel: `game-flight-sim-browser-smoke-run-${runIndex}`,
        devServerPort: String(firstPort + runIndex - 1),
        devServerPath: '/',
        baseUrlEnvName: 'AG_GAME_FLIGHT_SIM_SMOKE_BASE_URL',
        verifierCommand: 'python3',
        verifierArgs: ['scripts/verify_game_flight_sim_browser_smoke.py'],
        verifierFailureLabel: `Game Flight Sim browser smoke run ${runIndex}`,
        prepareBeforeStart: false,
        devServerStartMode: 'vite-preview-runner',
        existingServerPolicy: 'forbid',
      })
    },
    runCount,
    validateRunEvidence: runIndex => readValidatedFlightSimBrowserRunEvidence({
      candidateBranch,
      candidateHead,
      candidateTree,
      outputRoot,
      repoRoot,
      runCount,
      runIndex,
      sourceSha256,
      websocketProbePath,
    }),
  })

  const aggregate = {
    schema: 'agentic-graph-flight-sim-browser-proof/v5',
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
