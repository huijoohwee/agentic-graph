import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  CANONICAL_IMAGE_ROOT,
  canonicalImageDestinationForLegacyPath,
  LEGACY_MIRROR_EXACT_PATHS,
} from './mirror-namespace-contract.mjs'
import { listSealedLegacyMirrorPaths } from './legacy-mirror-inventory.mjs'

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
    const stat = await fs.lstat(filePath).catch(() => null)
    if (!stat) return null
    if (!stat.isFile()) throw new Error(`${label} must be a regular file: ${filePath}`)
    return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
  }

  const sealedLegacyPaths = async () => listSealedLegacyMirrorPaths({ listRelativeFiles })

  const assertLegacyMirrorInventoryIsBounded = async () => {
    await sealedLegacyPaths()
    const knownLegacyImageFiles = new Set(
      LEGACY_MIRROR_EXACT_PATHS.filter(relativePath => relativePath.startsWith('image/knowgrph/')),
    )
    const legacyImageFiles = (await listRelativeFiles('image/knowgrph'))
      .map(relativePath => joinRelativePath('image/knowgrph', relativePath))
    const unexpectedLegacyImageFiles = legacyImageFiles.filter(relativePath => !knownLegacyImageFiles.has(relativePath))
    if (unexpectedLegacyImageFiles.length > 0) {
      throw new Error(`Legacy image namespace contains unmanaged files: ${unexpectedLegacyImageFiles.join(', ')}`)
    }
  }

  const collectLegacyMirrorFilesToRemove = async ({ obsoleteGeneratedMirrorFiles }) => {
    await assertLegacyMirrorInventoryIsBounded()
    const files = new Set((await sealedLegacyPaths()).filter(relativePath => !relativePath.startsWith('image/agenticgraph/')))
    for (const relativePath of obsoleteGeneratedMirrorFiles) {
      if (await regularFileHash(resolveMirrorRelativePath(relativePath), 'Legacy generated mirror file')) files.add(relativePath)
    }
    return [...files].sort((left, right) => left.localeCompare(right))
  }

  const createLegacyImageMigrationPlan = async () => {
    await assertLegacyMirrorInventoryIsBounded()
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
      const sourceDigest = await regularFileHash(sourcePath, 'Legacy image payload')
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
      entries.push({ sourceRelativePath, sourcePath, destinationRelativePath, destinationPath, needsCopy: !destinationDigest })
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
    createLegacyImageMigrationPlan,
    removeEmptyDirs,
    resolveMirrorRelativePath,
  }
}
