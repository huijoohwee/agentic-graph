import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

export const FLIGHT_SIM_BROWSER_VERIFICATION_CONTRACT_PATH = path.join(
  repositoryRoot,
  'canvas/scripts/contracts/game-flight-sim-browser-verifications.json',
)

export async function readFlightSimBrowserVerificationNames({
  readText = filePath => readFile(filePath, 'utf8'),
} = {}) {
  const names = JSON.parse(
    await readText(FLIGHT_SIM_BROWSER_VERIFICATION_CONTRACT_PATH),
  )
  if (
    !Array.isArray(names)
    || names.length === 0
    || names.some(name => typeof name !== 'string' || !name.trim())
    || new Set(names).size !== names.length
  ) {
    throw new Error(
      'Flight browser verification contract must contain unique non-empty names',
    )
  }
  return Object.freeze([...names])
}

export async function assertExactFlightSimBrowserVerificationLedger(
  ledger,
  options = {},
) {
  const expectedNames = await readFlightSimBrowserVerificationNames(options)
  const actualNames = Array.isArray(ledger)
    ? ledger.map(record => record?.name)
    : []
  const statusesPassed = Array.isArray(ledger)
    && ledger.every(record => record?.status === 'passed')
  if (
    !statusesPassed
    || JSON.stringify(actualNames) !== JSON.stringify(expectedNames)
  ) {
    throw new Error(
      'Flight browser verification ledger did not match the exact required '
      + `all-passed inventory: expected=${JSON.stringify(expectedNames)}, `
      + `actual=${JSON.stringify(actualNames)}`,
    )
  }
  return expectedNames
}

export function assertExactFlightSimOptionalBeaconAdmission(
  optionalBeacon,
  { expectedPath, expectedSha256 },
) {
  const expectedKeys = [
    'assetKind',
    'assetPath',
    'assetSha256',
    'meshDescendantCount',
    'opaque',
    'partNames',
  ]
  const actualKeys = optionalBeacon && typeof optionalBeacon === 'object'
    ? Object.keys(optionalBeacon).sort()
    : []
  if (
    JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
    || optionalBeacon.assetKind !== 'glb-fallback'
    || optionalBeacon.assetPath !== expectedPath
    || optionalBeacon.assetSha256 !== expectedSha256
    || optionalBeacon.opaque !== true
    || optionalBeacon.meshDescendantCount !== 1
    || JSON.stringify(optionalBeacon.partNames)
      !== JSON.stringify(['kg_flight_sim_optional_beacon_part_1'])
  ) {
    throw new Error(
      'Flight browser evidence did not retain the exact admitted optional '
      + `beacon path, SHA-256, opacity, and mesh identity: ${
        JSON.stringify(optionalBeacon)
      }`,
    )
  }
  return optionalBeacon
}
