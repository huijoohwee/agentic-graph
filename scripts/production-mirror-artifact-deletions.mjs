import { createHash } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
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

export const assertPlannedMirrorPathsAbsent = async ({ root, entries, label }) => {
  for (const { relativePath } of entries) {
    const filePath = resolveWithin(root, relativePath)
    if (!(await absent(filePath))) {
      throw mirrorDeletionError({
        code: 'mirror_deletion_path_reappeared',
        message: `${label} path reappeared after committed deletion: ${relativePath}`,
        details: { committed: true, relativePath, originalPath: filePath },
      })
    }
  }
}

const mirrorDeletionError = ({ code, message, details = {}, cause }) => {
  const error = new Error(message, cause ? { cause } : undefined)
  error.name = 'ProductionMirrorDeletionError'
  error.code = code
  error.details = details
  return error
}

const statIdentity = stat => ({
  device: String(stat.dev),
  inode: String(stat.ino),
  bytes: String(stat.size),
  modifiedNanoseconds: String(stat.mtimeNs),
  changedNanoseconds: String(stat.ctimeNs),
})

const sameStatIdentity = (left, right) => (
  left.dev === right.dev
  && left.ino === right.ino
  && left.size === right.size
  && left.mtimeNs === right.mtimeNs
  && left.ctimeNs === right.ctimeNs
)

const digestOpenFile = async handle => {
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(256 * 1024)
  let position = 0
  while (true) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
    if (bytesRead === 0) return hash.digest('hex')
    hash.update(buffer.subarray(0, bytesRead))
    position += bytesRead
  }
}

const absent = async filePath => fs.lstat(filePath).then(() => false, error => {
  if (error?.code === 'ENOENT') return true
  throw error
})

const restoreQuarantinedFiles = async quarantined => {
  const preserved = []
  for (const entry of [...quarantined].reverse()) {
    if (entry.handle) await entry.handle.close().catch(() => {})
    entry.handle = null
    if (!(await absent(entry.quarantinePath))) {
      let restorationError = null
      try {
        await fs.link(entry.quarantinePath, entry.originalPath)
        const [quarantineStat, originalStat] = await Promise.all([
          fs.lstat(entry.quarantinePath, { bigint: true }),
          fs.lstat(entry.originalPath, { bigint: true }),
        ])
        if (quarantineStat.dev !== originalStat.dev || quarantineStat.ino !== originalStat.ino) {
          throw new Error('restored path does not reference the quarantined inode')
        }
        await fs.unlink(entry.quarantinePath)
      } catch (error) {
        restorationError = error
      }
      if (restorationError) {
        preserved.push({
          relativePath: entry.relativePath,
          quarantinePath: entry.quarantinePath,
          originalPath: entry.originalPath,
          restorationError: restorationError?.code || restorationError?.message || 'unknown',
        })
      }
    }
  }
  return preserved.reverse()
}

export const removePlannedMirrorFiles = async ({
  root, entries, label, onFilesQuarantined, purgeQuarantineFile = filePath => fs.unlink(filePath),
}) => {
  if (onFilesQuarantined !== undefined && typeof onFilesQuarantined !== 'function') {
    throw new TypeError('onFilesQuarantined must be a function')
  }
  if (typeof purgeQuarantineFile !== 'function') throw new TypeError('purgeQuarantineFile must be a function')
  const quarantineRoot = await fs.mkdtemp(path.join(path.resolve(root), '.agentic-graph-delete-'))
  const quarantined = []
  const purged = []
  let committed = false
  let completed = false
  try {
    for (const [index, entry] of entries.entries()) {
      const { relativePath, sha256 } = entry
      const originalPath = resolveWithin(root, relativePath)
      const before = await fs.lstat(originalPath).catch(error => {
        if (error?.code === 'ENOENT') return null
        throw error
      })
      if (!before) throw mirrorDeletionError({
        code: 'mirror_deletion_source_missing',
        message: `${label} disappeared before quarantine: ${relativePath}`,
        details: { relativePath },
      })
      if (!before.isFile()) throw mirrorDeletionError({
        code: 'mirror_deletion_source_not_regular',
        message: `${label} must remain a regular file: ${relativePath}`,
        details: { relativePath },
      })
      const quarantinePath = path.join(quarantineRoot, String(index).padStart(6, '0'))
      await fs.rename(originalPath, quarantinePath)
      const quarantinedEntry = { relativePath, sha256, originalPath, quarantinePath, handle: null, admitted: null }
      quarantined.push(quarantinedEntry)
      const handle = await fs.open(quarantinePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
      const admitted = await handle.stat({ bigint: true })
      Object.assign(quarantinedEntry, { handle, admitted })
      if (!admitted.isFile()) throw mirrorDeletionError({
        code: 'mirror_deletion_quarantine_not_regular',
        message: `${label} quarantine entry is not a regular file: ${relativePath}`,
        details: { relativePath, quarantinePath },
      })
      const currentSha256 = await digestOpenFile(handle)
      const verified = await handle.stat({ bigint: true })
      if (!sameStatIdentity(admitted, verified)) throw mirrorDeletionError({
        code: 'mirror_deletion_identity_drift',
        message: `${label} identity drifted during quarantine verification: ${relativePath}`,
        details: { relativePath, quarantinePath, admitted: statIdentity(admitted), verified: statIdentity(verified) },
      })
      if (currentSha256 !== sha256) throw mirrorDeletionError({
        code: 'mirror_deletion_content_drift',
        message: `${label} content drifted for ${relativePath}: expected sha256=${sha256}, received sha256=${currentSha256}`,
        details: { relativePath, quarantinePath, expectedSha256: sha256, receivedSha256: currentSha256 },
      })
    }
    await onFilesQuarantined?.({
      quarantineRoot,
      entries: quarantined.map(({ relativePath, originalPath, quarantinePath }) => (
        { relativePath, originalPath, quarantinePath }
      )),
    })
    for (const entry of quarantined) {
      if (!(await absent(entry.originalPath))) throw mirrorDeletionError({
        code: 'mirror_deletion_exclusive_ownership_lost',
        message: `${label} path was replaced after quarantine: ${entry.relativePath}`,
        details: { relativePath: entry.relativePath, quarantinePath: entry.quarantinePath,
          originalPath: entry.originalPath },
      })
      const current = await entry.handle.stat({ bigint: true })
      const pathStat = await fs.lstat(entry.quarantinePath, { bigint: true })
      if (!sameStatIdentity(entry.admitted, current)
          || current.dev !== pathStat.dev || current.ino !== pathStat.ino) throw mirrorDeletionError({
        code: 'mirror_deletion_quarantine_identity_drift',
        message: `${label} quarantine identity drifted before deletion: ${entry.relativePath}`,
        details: { relativePath: entry.relativePath, quarantinePath: entry.quarantinePath,
          admitted: statIdentity(entry.admitted), current: statIdentity(current), path: statIdentity(pathStat) },
      })
    }
    committed = true
    for (const entry of quarantined) {
      await entry.handle.close()
      entry.handle = null
      await purgeQuarantineFile(entry.quarantinePath, entry)
      purged.push(entry.relativePath)
    }
    await fs.rmdir(quarantineRoot)
    completed = true
  } catch (cause) {
    if (committed) {
      const preserved = []
      const observedPurged = new Set(purged)
      for (const entry of quarantined) {
        if (entry.handle) await entry.handle.close().catch(() => {})
        entry.handle = null
        if (await absent(entry.quarantinePath)) observedPurged.add(entry.relativePath)
        else preserved.push({ relativePath: entry.relativePath, quarantinePath: entry.quarantinePath,
          sha256: entry.sha256 })
      }
      throw mirrorDeletionError({
        code: 'mirror_deletion_committed_cleanup_required',
        message: `${cause?.message || label}; deletion committed and exact quarantine cleanup is required`,
        details: { committed: true, quarantineRoot,
          purged: quarantined.filter(entry => observedPurged.has(entry.relativePath)).map(entry => entry.relativePath), preserved },
        cause,
      })
    }
    const preserved = await restoreQuarantinedFiles(quarantined)
    if (preserved.length === 0) await fs.rmdir(quarantineRoot).catch(error => {
      if (error?.code !== 'ENOENT') throw error
    })
    if (preserved.length > 0) {
      throw mirrorDeletionError({
        code: cause?.code || 'mirror_deletion_failed',
        message: `${cause?.message || label}; quarantined bytes retained for deterministic recovery`,
        details: { ...(cause?.details || {}), quarantineRoot, preserved },
        cause,
      })
    }
    throw cause
  } finally {
    if (!completed) {
      for (const entry of quarantined) {
        if (entry.handle) await entry.handle.close().catch(() => {})
      }
    }
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
