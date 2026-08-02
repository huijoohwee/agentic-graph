import { execFileSync, spawn } from 'node:child_process'
import { existsSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectNamedVerifications,
  throwForNamedFailures,
} from './lib/named-verification-runner.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const defaultRepositoryRoot = path.resolve(path.dirname(scriptPath), '..')
const relativeTsxCliPath = path.join('node_modules', 'tsx', 'dist', 'cli.cjs')

export const XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS = Object.freeze([
  Object.freeze({
    name: 'XR native session policy',
    testLabel: 'canvas.xrMode.nativeSessionPolicy',
  }),
  Object.freeze({
    name: 'XR browser smoke contract',
    testLabel: 'xr.spatialCaptureFallback.browserSmokeContract',
  }),
  Object.freeze({
    name: 'XR readiness contract',
    testLabel: 'xr.spatialCaptureFallback.readiness',
  }),
  Object.freeze({
    name: 'XR runtime-ready contract',
    testLabel: 'xr.spatialCaptureFallback.runtimeReady',
  }),
])

function resolveCanonicalRepositoryRoot(repositoryRoot) {
  const commonDir = execFileSync(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  ).trim()
  return path.dirname(commonDir)
}

function resolveTsxCliPath(repositoryRoot) {
  const candidatePaths = [
    path.join(repositoryRoot, relativeTsxCliPath),
    path.join(resolveCanonicalRepositoryRoot(repositoryRoot), relativeTsxCliPath),
  ]
  for (const candidatePath of candidatePaths) {
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }
  throw new Error(
    `XR source smoke could not resolve tsx from: ${candidatePaths.join(', ')}`,
  )
}

function ensureSharedDependencyOverlay(repositoryRoot) {
  const canonicalRepositoryRoot = resolveCanonicalRepositoryRoot(repositoryRoot)
  if (canonicalRepositoryRoot === repositoryRoot) {
    return
  }
  const overlayPairs = [
    ['node_modules', 'node_modules'],
    [path.join('canvas', 'node_modules'), path.join('canvas', 'node_modules')],
  ]
  for (const [relativeOverlayPath, relativeSharedPath] of overlayPairs) {
    const dependencyOverlayPath = path.join(repositoryRoot, relativeOverlayPath)
    if (existsSync(dependencyOverlayPath)) {
      continue
    }
    const sharedDependencyPath = path.join(canonicalRepositoryRoot, relativeSharedPath)
    if (!existsSync(sharedDependencyPath)) {
      if (relativeOverlayPath === path.join('canvas', 'node_modules')) {
        continue
      }
      throw new Error(
        `XR source smoke requires shared dependencies at ${sharedDependencyPath}`,
      )
    }
    symlinkSync(
      sharedDependencyPath,
      dependencyOverlayPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
}

export function executeVerificationCommand(
  verification,
  repositoryRoot = defaultRepositoryRoot,
) {
  ensureSharedDependencyOverlay(repositoryRoot)
  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      resolveTsxCliPath(repositoryRoot),
      'src/tests/ci.ts',
      verification.testLabel,
    ], {
      cwd: path.join(repositoryRoot, 'canvas'),
      env: process.env,
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

export async function runXrSpatialCaptureFallbackSourceSmoke({
  execute = executeVerificationCommand,
  log = console,
  repositoryRoot = defaultRepositoryRoot,
} = {}) {
  const report = await collectNamedVerifications({
    execute: verification => execute(verification, repositoryRoot),
    log,
    verifications: XR_SPATIAL_CAPTURE_FALLBACK_SOURCE_VERIFICATIONS,
  })
  throwForNamedFailures('XR spatial capture fallback source smoke', report.failures)
  return report
}

if (path.resolve(process.argv[1] || '') === scriptPath) {
  runXrSpatialCaptureFallbackSourceSmoke().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
