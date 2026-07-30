import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import {
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
  FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL,
} from './game-flight-sim-offline-author-contract.mjs'

export const FLIGHT_SIM_DISALLOWED_AUTHORING_OPERATIONS = Object.freeze([
  'image-to-3d-model-call',
  'network-fetch',
  'cloudflare-resource-request',
])
export const FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS = Object.freeze({
  glb: 'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optional-beacon.glb',
  source:
    'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optionalBeaconGlb.generated.ts',
})

export class FlightSimOfflineAuthoringBlockedError extends Error {
  constructor(operation) {
    super(
      `Flight Sim offline authoring blocked disallowed operation before commit: ${operation}`,
    )
    this.name = 'FlightSimOfflineAuthoringBlockedError'
    this.code = 'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED'
    this.operation = operation
    this.beforeCommit = true
  }
}

const workerUrl = new URL(
  './game-flight-sim-offline-author-worker.mjs',
  import.meta.url,
)
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)
const canonicalOutputTargets = Object.freeze(
  Object.entries(FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS).map(
    ([key, relativePath]) => Object.freeze({
      key,
      relativePath,
      targetPath: path.join(repositoryRoot, relativePath),
    }),
  ),
)

function reviveWorkerError(value) {
  if (value?.code === 'FLIGHT_SIM_OFFLINE_AUTHORING_OPERATION_BLOCKED') {
    return new FlightSimOfflineAuthoringBlockedError(value.operation)
  }
  const error = new Error(String(value?.message || 'Flight Sim offline authoring failed'))
  error.name = String(value?.name || 'Error')
  if (value?.code) error.code = value.code
  if (value?.beforeCommit === true) error.beforeCommit = true
  if (value?.stack) error.stack = value.stack
  return error
}

function runOfflineAuthorWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: {
        authorModuleUrl: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_URL.href,
        authorExport: FLIGHT_SIM_OPTIONAL_PROP_AUTHOR_EXPORT,
      },
    })
    let settled = false
    const finish = async (callback, value) => {
      if (settled) return
      settled = true
      await worker.terminate()
      callback(value)
    }
    worker.once('message', message => {
      if (message?.ok === true) {
        void finish(resolve, message.output)
        return
      }
      void finish(reject, reviveWorkerError(message?.error))
    })
    worker.once('error', error => {
      void finish(reject, error)
    })
    worker.once('exit', code => {
      if (!settled) {
        void finish(
          reject,
          new Error(
            `Flight Sim offline author worker exited without output (status ${code})`,
          ),
        )
      }
    })
  })
}

export function readFlightSimOfflineAuthoredOutput() {
  return runOfflineAuthorWorker()
}

function validateOutputBytes(outputs) {
  for (const { key, relativePath } of canonicalOutputTargets) {
    if (!(outputs?.[key] instanceof Uint8Array) || outputs[key].byteLength === 0) {
      throw new Error(`Flight Sim offline authoring produced invalid ${relativePath}`)
    }
  }
}

async function readReplaceableOutput({ relativePath, targetPath }) {
  try {
    const metadata = await lstat(targetPath)
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(
        `Flight Sim canonical output ${relativePath} must be a regular non-symlink file`,
      )
    }
    return readFile(targetPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function temporaryPath(targetPath, purpose) {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${purpose}.${randomUUID()}.tmp`,
  )
}

async function restoreCommittedOutputs(committedOutputs) {
  const rollbackFailures = []
  for (const output of [...committedOutputs].reverse()) {
    try {
      if (output.previousBytes === null) {
        await rm(output.targetPath, { force: true })
        continue
      }
      const rollbackPath = temporaryPath(output.targetPath, 'rollback')
      try {
        await writeFile(rollbackPath, output.previousBytes, { flag: 'wx' })
        await rename(rollbackPath, output.targetPath)
      } finally {
        await rm(rollbackPath, { force: true })
      }
    } catch (error) {
      rollbackFailures.push(error)
    }
  }
  return rollbackFailures
}

async function commitCanonicalOutputs(outputs) {
  validateOutputBytes(outputs)
  await Promise.all(canonicalOutputTargets.map(({ targetPath }) => (
    mkdir(path.dirname(targetPath), { recursive: true })
  )))
  const plannedOutputs = await Promise.all(canonicalOutputTargets.map(
    async output => ({
      ...output,
      previousBytes: await readReplaceableOutput(output),
      stagedPath: temporaryPath(output.targetPath, 'staged'),
    }),
  ))
  try {
    await Promise.all(plannedOutputs.map(output => (
      writeFile(output.stagedPath, outputs[output.key], { flag: 'wx' })
    )))
    const committedOutputs = []
    try {
      for (const output of plannedOutputs) {
        await rename(output.stagedPath, output.targetPath)
        committedOutputs.push(output)
      }
    } catch (error) {
      const rollbackFailures = await restoreCommittedOutputs(committedOutputs)
      if (rollbackFailures.length > 0) {
        throw new AggregateError(
          [error, ...rollbackFailures],
          'Flight Sim canonical output commit and rollback both failed',
        )
      }
      throw error
    }
  } finally {
    await Promise.all(plannedOutputs.map(output => (
      rm(output.stagedPath, { force: true })
    )))
  }
}

export async function writeFlightSimOfflineAuthoredOutput(...options) {
  if (options.length !== 0) {
    throw new Error(
      'Flight Sim offline authoring accepts no caller-controlled author, path, or commit callback',
    )
  }
  const outputs = await readFlightSimOfflineAuthoredOutput()
  await commitCanonicalOutputs(outputs)
  return outputs
}
