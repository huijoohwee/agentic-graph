import { createHash } from 'node:crypto'
import {
  LEGACY_MIRROR_NAMED_FILE_PATHS,
  LEGACY_MIRROR_ROOT_INVENTORIES,
} from './mirror-namespace-contract.mjs'

const legacyNamedFilePattern = /(?:^|\/)(?:agenticgraph|knowgrph)-/

const digestRelativePaths = relativePaths => createHash('sha256')
  .update(JSON.stringify([...relativePaths].sort((left, right) => left.localeCompare(right))))
  .digest('hex')

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

export const listSealedLegacyMirrorPaths = async ({ listRelativeFiles }) => {
  if (typeof listRelativeFiles !== 'function') throw new Error('Sealed legacy inventory requires a directory lister')
  const paths = new Set()
  for (const root of Object.keys(LEGACY_MIRROR_ROOT_INVENTORIES).sort((left, right) => left.localeCompare(right))) {
    const relativePaths = await listRelativeFiles(root)
    for (const relativePath of assertSealedLegacyMirrorRootInventory({ root, relativePaths })) {
      paths.add(`${root}/${relativePath}`)
    }
  }
  const namedFiles = await listRelativeFiles('.well-known/agent-skills')
  for (const relativePath of assertSealedLegacyNamedFileInventory({ relativePaths: namedFiles })) {
    paths.add(`.well-known/agent-skills/${relativePath}`)
  }
  return [...paths].sort((left, right) => left.localeCompare(right))
}
