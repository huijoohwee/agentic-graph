import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  captureGitRepositoryState,
  describeRepositoryStateChange,
  repositoryStatesEqual,
} from './lib/git-repository-state.mjs'
import {
  createGitVerificationWorkspace,
} from './lib/git-verification-workspace.mjs'
import {
  collectNamedVerifications,
  throwForNamedFailures,
} from './lib/named-verification-runner.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), '..')

export const FLIGHT_SIM_RUNTIME_VERIFICATIONS = Object.freeze([
  Object.freeze({
    name: 'linked package preparation',
    command: 'npm',
    args: ['run', 'smoke:prepare'],
  }),
  Object.freeze({
    name: 'source authority',
    command: process.execPath,
    args: ['./scripts/check-game-flight-sim-readiness.mjs'],
  }),
  Object.freeze({
    name: 'native Agentic ECS integration',
    command: 'npm',
    args: ['run', 'ecs:test'],
  }),
  Object.freeze({
    name: 'focused Flight Sim source tests',
    command: 'npm',
    args: ['-C', 'canvas', 'run', 'test:smoke:game-flight-sim:source'],
  }),
  Object.freeze({
    name: 'negative network, provenance, and source-authority gates',
    command: 'npm',
    args: ['run', 'game-flight-sim:negative-gates:test'],
  }),
  Object.freeze({
    name: 'verification aggregation contracts',
    command: 'npm',
    args: ['run', 'game-flight-sim:orchestration:test'],
  }),
  Object.freeze({
    name: 'Canvas TypeScript',
    command: 'npm',
    args: ['-C', 'canvas', 'run', 'check'],
  }),
  Object.freeze({
    name: 'production build',
    command: 'npm',
    args: ['-C', 'canvas', 'run', 'build'],
    env: Object.freeze({ KG_SKIP_DOCS_UPDATE: '1' }),
  }),
])

export function executeVerificationCommand(
  verification,
  repositoryRoot = defaultRepositoryRoot,
) {
  return new Promise((resolve, reject) => {
    const child = spawn(verification.command, verification.args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...verification.env },
      shell: false,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(
        signal
          ? `terminated by signal ${signal}`
          : `exited with status ${code ?? 'unknown'}`,
      ))
    })
  })
}

export async function runFlightSimRuntimeReadiness({
  captureState = captureGitRepositoryState,
  createWorkspace = createGitVerificationWorkspace,
  execute = executeVerificationCommand,
  log = console,
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const before = await captureState(repositoryRoot)
  if (before.status) {
    throwForNamedFailures('Game Flight Sim runtime readiness', [
      Object.freeze({
        name: 'clean checkout preflight',
        message: `runtime-ready requires an initially clean checkout:\n${
          before.status.replaceAll('\0', '\n').trim()
        }`,
      }),
    ])
  }
  const failures = []
  let report = null
  let workspace = null
  try {
    workspace = await createWorkspace(repositoryRoot)
    const isolatedBefore = await captureState(workspace.repositoryRoot)
    report = await collectNamedVerifications({
      execute: verification => execute(
        verification,
        workspace.repositoryRoot,
      ),
      log,
      verifications: FLIGHT_SIM_RUNTIME_VERIFICATIONS,
    })
    failures.push(...report.failures)
    const isolatedAfter = await captureState(workspace.repositoryRoot)
    if (!repositoryStatesEqual(isolatedBefore, isolatedAfter)) {
      failures.push(Object.freeze({
        name: 'repository source immutability',
        message: `runtime-ready changed its isolated checkout ${
          describeRepositoryStateChange(isolatedBefore, isolatedAfter)
        }`,
      }))
    }
  } catch (error) {
    failures.push(Object.freeze({
      name: 'isolated verification workspace',
      message: error instanceof Error ? error.message : String(error),
    }))
  } finally {
    if (workspace) {
      try {
        await workspace.dispose()
      } catch (error) {
        failures.push(Object.freeze({
          name: 'isolated verification cleanup',
          message: error instanceof Error ? error.message : String(error),
        }))
      }
    }
  }
  const after = await captureState(repositoryRoot)
  if (!repositoryStatesEqual(before, after)) {
    failures.push(Object.freeze({
      name: 'caller checkout isolation',
      message: `caller checkout changed outside the isolated verification: ${
        describeRepositoryStateChange(before, after)
      }`,
    }))
  }
  throwForNamedFailures('Game Flight Sim runtime readiness', failures)
  return report
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  runFlightSimRuntimeReadiness().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
