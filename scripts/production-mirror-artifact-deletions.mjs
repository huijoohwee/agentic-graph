import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listSealedLegacyMirrorPaths } from './legacy-mirror-inventory.mjs'
import { LEGACY_MIRROR_EMPTY_DIRECTORY_ROOTS } from './mirror-namespace-contract.mjs'
import { resolveWithin } from './production-mirror-artifact-paths.mjs'

export const listSealedLegacyPathsAtRevision = ({ readGitTreeRelativeFiles, readGitTreeFile, root, revision }) => listSealedLegacyMirrorPaths({
  listRelativeFiles: async relativeRoot => readGitTreeRelativeFiles({ root, revision, relativeRoot }),
  readRelativeFile: async relativePath => readGitTreeFile({ root, revision, relativePath }),
})

export const assertManagedDeletedPaths = ({ deletedPaths, sealedLegacyPaths, isManagedPath, label }) => {
  const deleted = new Set(deletedPaths)
  for (const deletedPath of deletedPaths) {
    if (!isManagedPath(deletedPath, sealedLegacyPaths)) throw new Error(`${label} deleted unmanaged path: ${deletedPath}`)
  }
  const unretired = [...sealedLegacyPaths].filter(relativePath => !deleted.has(relativePath))
  if (unretired.length > 0) {
    throw new Error(`${label} did not retire every sealed legacy path: ${unretired.slice(0, 3).join(', ')}`)
  }
}

export const assertTrackedDeletedPaths = ({ deletedPaths, trackedPaths, label }) => {
  for (const deletedPath of deletedPaths) {
    if (!trackedPaths.has(deletedPath)) throw new Error(`${label} deletion is not a tracked base file: ${deletedPath}`)
  }
}

export const createProductionArtifactDeletionPlan = ({
  deletedPaths, sealedLegacyPaths, isManagedPath, trackedPaths, readGitTreeFile, root, revision, label,
}) => {
  assertManagedDeletedPaths({ deletedPaths, sealedLegacyPaths, isManagedPath, label })
  assertTrackedDeletedPaths({ deletedPaths, trackedPaths, label })
  return deletedPaths.map(relativePath => {
    const contents = readGitTreeFile({ root, revision, relativePath })
    if (!contents) throw new Error(`${label} deletion is missing from its base revision: ${relativePath}`)
    return { relativePath, sha256: createHash('sha256').update(contents).digest('hex') }
  })
}

export const assertPlannedMirrorFile = async ({ root, entry: { relativePath, sha256 }, label }) => {
  const filePath = resolveWithin(root, relativePath)
  const stat = await fs.lstat(filePath).catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (!stat) throw new Error(`${label} disappeared before operation: ${relativePath}`)
  if (!stat.isFile()) throw new Error(`${label} must remain a regular file: ${relativePath}`)
  const currentSha256 = createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
  if (currentSha256 !== sha256) {
    throw new Error(
      `${label} content drifted for ${relativePath}: expected sha256=${sha256}, received sha256=${currentSha256}`,
    )
  }
  return filePath
}

export const removePlannedMirrorFiles = async ({ root, entries, label }) => {
  for (const entry of entries) {
    const filePath = await assertPlannedMirrorFile({ root, entry, label })
    await fs.unlink(filePath)
  }
}

const removeEmptyDirectoryTree = async directory => {
  const stat = await fs.lstat(directory).catch(error => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (!stat) return
  if (!stat.isDirectory()) throw new Error(`Legacy cleanup root is not a directory: ${directory}`)
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await removeEmptyDirectoryTree(path.resolve(directory, entry.name))
  }
  if ((await fs.readdir(directory)).length === 0) await fs.rmdir(directory)
}

export const removeEmptyLegacyMirrorDirectories = async ({ root }) => {
  for (const relativePath of LEGACY_MIRROR_EMPTY_DIRECTORY_ROOTS) {
    await removeEmptyDirectoryTree(resolveWithin(root, relativePath))
  }
}
