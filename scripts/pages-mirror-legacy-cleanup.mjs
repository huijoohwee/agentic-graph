import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CANONICAL_IMAGE_ROOT,
  canonicalImageDestinationForLegacyPath,
  LEGACY_MIRROR_EXACT_PATHS,
} from './mirror-namespace-contract.mjs'
import { listSealedLegacyMirrorEntries } from './legacy-mirror-inventory.mjs'
import { assertPlannedMirrorFile, removePlannedMirrorFiles } from './production-mirror-artifact-deletions.mjs'

const joinRelativePath = (...parts) => parts.join('/')

const listRegularFiles = async directory => {
  const files = []
  const walk = async current => {
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.resolve(current, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile()) throw new Error(`Legacy mirror inventory rejects non-file entry: ${absolutePath}`)
      files.push(path.relative(directory, absolutePath).split(path.sep).join('/'))
    }
  }
  try {
    await walk(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  return files.sort((left, right) => left.localeCompare(right))
}

export const createPagesMirrorLegacyCleanup = ({ mirrorRoot }) => {
  const resolveMirrorRelativePath = relativePath => path.resolve(mirrorRoot, ...relativePath.split('/'))
  const listRelativeFiles = relativeRoot => listRegularFiles(resolveMirrorRelativePath(relativeRoot))

  const regularFileHash = async (filePath, label) => {
    const stat = await fs.lstat(filePath).catch(error => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    if (!stat) return null
    if (!stat.isFile()) throw new Error(`${label} must be a regular file: ${filePath}`)
    return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
  }

  const readRelativeFile = async relativePath => {
    const filePath = resolveMirrorRelativePath(relativePath)
    const stat = await fs.lstat(filePath).catch(error => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    if (!stat) return null
    if (!stat.isFile()) throw new Error(`Legacy mirror inventory entry must be a regular file: ${filePath}`)
    return fs.readFile(filePath)
  }

  const sealedLegacyEntries = async () => listSealedLegacyMirrorEntries({ listRelativeFiles, readRelativeFile })

  const assertLegacyMirrorInventoryIsBounded = async () => {
    const entries = await sealedLegacyEntries()
    const knownLegacyImageFiles = new Set(
      LEGACY_MIRROR_EXACT_PATHS.filter(relativePath => relativePath.startsWith('image/knowgrph/')),
    )
    const legacyImageFiles = (await listRelativeFiles('image/knowgrph'))
      .map(relativePath => joinRelativePath('image/knowgrph', relativePath))
    const unexpectedLegacyImageFiles = legacyImageFiles.filter(relativePath => !knownLegacyImageFiles.has(relativePath))
    if (unexpectedLegacyImageFiles.length > 0) {
      throw new Error(`Legacy image namespace contains unmanaged files: ${unexpectedLegacyImageFiles.join(', ')}`)
    }
    return entries
  }

  const collectLegacyMirrorFilesToRemove = async ({ obsoleteGeneratedMirrorFiles }) => {
    const sealedEntries = await assertLegacyMirrorInventoryIsBounded()
    const files = new Map(sealedEntries
      .filter(entry => !entry.relativePath.startsWith('image/agenticgraph/'))
      .map(entry => [entry.relativePath, entry]))
    for (const relativePath of obsoleteGeneratedMirrorFiles) {
      const sha256 = await regularFileHash(resolveMirrorRelativePath(relativePath), 'Legacy generated mirror file')
      if (!sha256) continue
      const sealedEntry = files.get(relativePath)
      if (sealedEntry && sealedEntry.sha256 !== sha256) {
        throw new Error(`Sealed legacy mirror content drifted while planning deletion: ${relativePath}`)
      }
      if (!sealedEntry) files.set(relativePath, { relativePath, sha256 })
    }
    return [...files.values()].sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }

  const removeLegacyMirrorFiles = entries => removePlannedMirrorFiles({
    root: mirrorRoot,
    entries,
    label: 'Planned legacy mirror deletion',
  })

  const copyLegacyImageFile = async entry => {
    const sourcePath = await assertPlannedMirrorFile({
      root: mirrorRoot,
      entry: { relativePath: entry.sourceRelativePath, sha256: entry.sourceSha256 },
      label: 'Planned legacy image copy',
    })
    await fs.mkdir(path.dirname(entry.destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, entry.destinationPath)
  }

  const createLegacyImageMigrationPlan = async () => {
    const sealedEntries = new Map(
      (await assertLegacyMirrorInventoryIsBounded()).map(entry => [entry.relativePath, entry]),
    )
    const legacyImageFiles = (await listRelativeFiles('image/agenticgraph'))
      .map(relativePath => joinRelativePath('image/agenticgraph', relativePath))
    const canonicalImageFiles = (await listRelativeFiles(CANONICAL_IMAGE_ROOT))
      .map(relativePath => joinRelativePath(CANONICAL_IMAGE_ROOT, relativePath))
    const runtimeEntries = new Map(canonicalImageFiles.map(relativePath => [relativePath, resolveMirrorRelativePath(relativePath)]))
    const destinationDigests = new Map()
    const entries = []
    for (const sourceRelativePath of legacyImageFiles) {
      const destinationRelativePath = canonicalImageDestinationForLegacyPath(sourceRelativePath)
      if (!destinationRelativePath) throw new Error(`Legacy image namespace contains an unmanaged file: ${sourceRelativePath}`)
      const sourcePath = resolveMirrorRelativePath(sourceRelativePath)
      const sourceDigest = sealedEntries.get(sourceRelativePath)?.sha256
      if (!sourceDigest) throw new Error(`Legacy image payload is outside the sealed inventory: ${sourceRelativePath}`)
      const currentSourceDigest = await regularFileHash(sourcePath, 'Legacy image payload')
      if (currentSourceDigest !== sourceDigest) {
        throw new Error(`Sealed legacy image content drifted while planning migration: ${sourceRelativePath}`)
      }
      const destinationPath = resolveMirrorRelativePath(destinationRelativePath)
      const destinationDigest = await regularFileHash(destinationPath, 'Canonical image payload')
      const priorSourceDigest = destinationDigests.get(destinationRelativePath)
      if (priorSourceDigest && priorSourceDigest !== sourceDigest) {
        throw new Error(`Legacy image migration has conflicting sources for ${destinationRelativePath}`)
      }
      destinationDigests.set(destinationRelativePath, sourceDigest)
      if (destinationDigest && destinationDigest !== sourceDigest) {
        throw new Error(`Legacy image migration refuses to overwrite ${destinationRelativePath} with different bytes`)
      }
      entries.push({
        sourceRelativePath,
        sourcePath,
        sourceSha256: sourceDigest,
        destinationRelativePath,
        destinationPath,
        needsCopy: !destinationDigest,
      })
      runtimeEntries.set(destinationRelativePath, destinationDigest ? destinationPath : sourcePath)
    }
    return {
      entries,
      legacyImageFiles,
      runtimeEntries: [...runtimeEntries.entries()]
        .map(([relativePath, absolutePath]) => ({ relativePath, absolutePath }))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    }
  }

  const removeEmptyDirs = async rootDir => {
    const readDirectory = async directory => {
      try {
        return await fs.readdir(directory, { withFileTypes: true })
      } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
      }
    }
    const walk = async directory => {
      const entries = await readDirectory(directory)
      if (!entries) return
      for (const entry of entries) {
        if (entry.isDirectory()) await walk(path.resolve(directory, entry.name))
      }
      if (directory === rootDir) return
      const after = await readDirectory(directory)
      if (after && after.length === 0) {
        await fs.rmdir(directory)
      }
    }
    await walk(rootDir)
  }

  return {
    assertLegacyMirrorInventoryIsBounded,
    collectLegacyMirrorFilesToRemove,
    copyLegacyImageFile,
    createLegacyImageMigrationPlan,
    removeLegacyMirrorFiles,
    removeEmptyDirs,
    resolveMirrorRelativePath,
  }
}
