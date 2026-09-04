import { createHash } from 'node:crypto'
import {
  LEGACY_MIRROR_EXACT_FILE_INVENTORY,
  LEGACY_MIRROR_EXACT_PATHS,
  LEGACY_MIRROR_NAMED_FILE_INVENTORY,
  LEGACY_MIRROR_NAMED_FILE_PATHS,
  LEGACY_MIRROR_ROOT_INVENTORIES,
} from './mirror-namespace-contract.mjs'
import { XR_V2_LEGACY_MIRROR_SHA256_BY_PATH } from './xr-v2/production-publish-contract.mjs'

const legacyNamedFilePattern = /(?:^|\/)(?:agenticgraph|knowgrph)-/

const digestRelativePaths = relativePaths => createHash('sha256')
  .update(JSON.stringify([...relativePaths].sort((left, right) => left.localeCompare(right))))
  .digest('hex')

const sha256 = value => createHash('sha256').update(value).digest('hex')

export const digestRelativeFileContents = records => sha256(
  [...records]
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map(record => `${record.relativePath}\0${record.sha256}\n`)
    .join(''),
)

export const assertSealedLegacyContentInventory = async ({
  relativePaths,
  readRelativeFile,
  inventory,
  label,
  readPrefix = '',
}) => {
  if (typeof readRelativeFile !== 'function') throw new Error(`${label} requires a file reader`)
  const records = []
  for (const relativePath of relativePaths) {
    const contents = await readRelativeFile(readPrefix ? `${readPrefix}/${relativePath}` : relativePath)
    if (contents === null || contents === undefined) throw new Error(`${label} is missing ${relativePath}`)
    records.push({ relativePath, sha256: sha256(contents) })
  }
  const contentDigest = digestRelativeFileContents(records)
  if (records.length !== inventory.count || contentDigest !== inventory.contentDigest) {
    throw new Error(
      `${label} content drifted: expected count=${inventory.count} digest=${inventory.contentDigest}, received count=${records.length} digest=${contentDigest}`,
    )
  }
  return records
}

export const assertSealedLegacyFileDigestInventory = async ({
  sha256ByPath,
  readRelativeFile,
  label,
}) => {
  if (typeof readRelativeFile !== 'function') throw new Error(`${label} requires a file reader`)
  const entries = Object.entries(sha256ByPath)
    .sort(([left], [right]) => left.localeCompare(right))
  const records = []
  const missingPaths = []
  for (const [relativePath, expectedSha256] of entries) {
    const contents = await readRelativeFile(relativePath)
    if (contents === null || contents === undefined) {
      missingPaths.push(relativePath)
      continue
    }
    const actualSha256 = sha256(contents)
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `${label} content drifted for ${relativePath}: expected sha256=${expectedSha256}, received sha256=${actualSha256}`,
      )
    }
    records.push({ relativePath, sha256: actualSha256 })
  }
  if (records.length === 0) return []
  if (missingPaths.length > 0) {
    throw new Error(`${label} is incomplete; missing ${missingPaths.join(', ')}`)
  }
  return records
}

const assertSafeRelativePaths = (relativePaths, label) => {
  if (!Array.isArray(relativePaths) || relativePaths.some(relativePath => (
    typeof relativePath !== 'string'
    || !relativePath
    || relativePath.startsWith('/')
    || relativePath.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ))) {
    throw new Error(`${label} contains an unsafe relative path`)
  }
  if (new Set(relativePaths).size !== relativePaths.length) {
    throw new Error(`${label} contains duplicate relative paths`)
  }
  return [...relativePaths].sort((left, right) => left.localeCompare(right))
}

export const assertSealedLegacyMirrorRootInventory = ({ root, relativePaths }) => {
  const inventory = LEGACY_MIRROR_ROOT_INVENTORIES[root]
  if (!inventory) throw new Error(`Unknown sealed legacy mirror root: ${root}`)
  const paths = assertSafeRelativePaths(relativePaths, `Legacy mirror root ${root}`)
  if (paths.length === 0) return []
  const digest = digestRelativePaths(paths)
  if (paths.length !== inventory.count || digest !== inventory.digest) {
    throw new Error(
      `Legacy mirror root inventory drifted for ${root}: expected count=${inventory.count} digest=${inventory.digest}, received count=${paths.length} digest=${digest}`,
    )
  }
  return paths
}

export const assertSealedLegacyNamedFileInventory = ({ relativePaths }) => {
  const paths = assertSafeRelativePaths(relativePaths, 'Legacy named-file inventory')
  const expected = [...LEGACY_MIRROR_NAMED_FILE_PATHS]
    .map(relativePath => relativePath.slice('.well-known/agent-skills/'.length))
    .sort((left, right) => left.localeCompare(right))
  const legacyPaths = paths.filter(relativePath => legacyNamedFilePattern.test(relativePath))
  if (legacyPaths.length === 0) return []
  if (JSON.stringify(legacyPaths) !== JSON.stringify(expected)) {
    throw new Error('Legacy named-file inventory contains an unexpected, missing, or partially retired path')
  }
  return legacyPaths
}

const existingExactPaths = async ({ relativePaths, readRelativeFile }) => {
  const present = []
  for (const relativePath of relativePaths) {
    const contents = await readRelativeFile(relativePath)
    if (contents !== null && contents !== undefined) present.push(relativePath)
  }
  return present
}

export const listSealedLegacyMirrorEntries = async ({ listRelativeFiles, readRelativeFile }) => {
  if (typeof listRelativeFiles !== 'function') throw new Error('Sealed legacy inventory requires a directory lister')
  if (typeof readRelativeFile !== 'function') throw new Error('Sealed legacy inventory requires a file reader')
  const entries = new Map()
  for (const root of Object.keys(LEGACY_MIRROR_ROOT_INVENTORIES).sort((left, right) => left.localeCompare(right))) {
    const relativePaths = await listRelativeFiles(root)
    const sealedPaths = assertSealedLegacyMirrorRootInventory({ root, relativePaths })
    const records = sealedPaths.length > 0 ? await assertSealedLegacyContentInventory({
      relativePaths: sealedPaths,
      readRelativeFile,
      inventory: LEGACY_MIRROR_ROOT_INVENTORIES[root],
      label: `Legacy mirror root ${root}`,
      readPrefix: root,
    }) : []
    for (const record of records) {
      const relativePath = `${root}/${record.relativePath}`
      entries.set(relativePath, { relativePath, sha256: record.sha256 })
    }
  }
  const namedFiles = await listRelativeFiles('.well-known/agent-skills')
  const namedPaths = assertSealedLegacyNamedFileInventory({ relativePaths: namedFiles })
  const namedRecords = namedPaths.length > 0 ? await assertSealedLegacyContentInventory({
    relativePaths: namedPaths,
    readRelativeFile,
    inventory: LEGACY_MIRROR_NAMED_FILE_INVENTORY,
    label: 'Legacy named-file inventory',
    readPrefix: '.well-known/agent-skills',
  }) : []
  for (const record of namedRecords) {
    const relativePath = `.well-known/agent-skills/${record.relativePath}`
    entries.set(relativePath, { relativePath, sha256: record.sha256 })
  }
  const exactPaths = await existingExactPaths({
    relativePaths: LEGACY_MIRROR_EXACT_PATHS,
    readRelativeFile,
  })
  const exactRecords = exactPaths.length > 0 ? await assertSealedLegacyContentInventory({
    relativePaths: exactPaths,
    readRelativeFile,
    inventory: LEGACY_MIRROR_EXACT_FILE_INVENTORY,
    label: 'Legacy exact-file inventory',
  }) : []
  for (const record of exactRecords) entries.set(record.relativePath, record)
  const xrRecords = await assertSealedLegacyFileDigestInventory({
    sha256ByPath: XR_V2_LEGACY_MIRROR_SHA256_BY_PATH,
    readRelativeFile,
    label: 'Legacy XR v2 file inventory',
  })
  for (const record of xrRecords) entries.set(record.relativePath, record)
  return [...entries.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export const listSealedLegacyMirrorPaths = async options => (
  await listSealedLegacyMirrorEntries(options)
).map(entry => entry.relativePath)
