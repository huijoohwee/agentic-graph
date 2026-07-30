import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS,
  readFlightSimOfflineAuthoredOutput,
  writeFlightSimOfflineAuthoredOutput,
} from './lib/game-flight-sim-offline-authoring.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binaryPath = path.join(
  repositoryRoot,
  FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS.glb,
)
const generatedSourcePath = path.join(
  repositoryRoot,
  FLIGHT_SIM_OPTIONAL_PROP_OUTPUT_PATHS.source,
)
const checkOnly = process.argv.includes('--check')

async function readOrNull(filePath) {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function requireExact(filePath, expected) {
  const current = await readOrNull(filePath)
  if (!current || !current.equals(expected)) {
    throw new Error(`${path.relative(repositoryRoot, filePath)} is not the deterministic generated output`)
  }
}

if (checkOnly) {
  const { glb, source } = await readFlightSimOfflineAuthoredOutput()
  await requireExact(binaryPath, glb)
  await requireExact(generatedSourcePath, source)
  console.log(`OK deterministic Flight Sim optional prop GLB (${glb.byteLength} bytes)`)
} else {
  const output = await writeFlightSimOfflineAuthoredOutput()
  console.log(`Wrote deterministic Flight Sim optional prop GLB (${output.glb.byteLength} bytes)`)
}
