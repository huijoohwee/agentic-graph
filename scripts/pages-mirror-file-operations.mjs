import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const createPagesMirrorFileOperations = ({ isAllowedRelativePath }) => {
  if (typeof isAllowedRelativePath !== 'function') {
    throw new Error('Pages mirror file operations require an allowed-relative-path predicate')
  }

  const toPosixRel = (rootDir, absolutePath) => path.relative(rootDir, absolutePath)
    .split(path.sep)
    .filter(Boolean)
    .join('/')

  const existsDir = async directory => {
    try {
      return (await fs.stat(directory)).isDirectory()
    } catch {
      return false
    }
  }

  const listFiles = async rootDir => {
    const files = []
    const walk = async directory => {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const absolutePath = path.resolve(directory, entry.name)
        const relativePath = toPosixRel(rootDir, absolutePath)
        if (!isAllowedRelativePath(relativePath)) continue
        if (entry.isDirectory()) {
          await walk(absolutePath)
          continue
        }
        if (entry.isFile()) {
          files.push(relativePath)
          continue
        }
        throw new Error(`Mirror file inventory rejects non-file entry: ${relativePath}`)
      }
    }
    await walk(rootDir)
    return files.sort((left, right) => left.localeCompare(right))
  }

  const listAllFiles = async rootDir => {
    const files = []
    const walk = async directory => {
      const entries = await fs.readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        const absolutePath = path.resolve(directory, entry.name)
        const relativePath = toPosixRel(rootDir, absolutePath)
        if (entry.isDirectory()) {
          await walk(absolutePath)
          continue
        }
        if (entry.isFile()) {
          files.push(relativePath)
          continue
        }
        throw new Error(`Mirror file inventory rejects non-file entry: ${relativePath}`)
      }
    }
    await walk(rootDir)
    return files.sort((left, right) => left.localeCompare(right))
  }

  const fileHash = async filePath => createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
  const textHash = value => createHash('sha256').update(value).digest('hex')
  const readPublishContent = async sourcePath => fs.readFile(sourcePath)
  const publishContentHash = async sourcePath => createHash('sha256').update(await readPublishContent(sourcePath)).digest('hex')

  const fileNeedsUpdate = async (sourcePath, destinationPath) => {
    try {
      const [sourceHash, destinationHash] = await Promise.all([
        publishContentHash(sourcePath),
        fileHash(destinationPath),
      ])
      return sourceHash !== destinationHash
    } catch {
      return true
    }
  }

  const plainFileNeedsUpdate = async (sourcePath, destinationPath) => {
    try {
      const [sourceHash, destinationHash] = await Promise.all([
        fileHash(sourcePath),
        fileHash(destinationPath),
      ])
      return sourceHash !== destinationHash
    } catch {
      return true
    }
  }

  const textFileNeedsUpdate = async (body, destinationPath) => {
    try {
      return textHash(body) !== await fileHash(destinationPath)
    } catch {
      return true
    }
  }

  const copyIfChanged = async (sourcePath, destinationPath) => {
    if (!await fileNeedsUpdate(sourcePath, destinationPath)) return false
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.writeFile(destinationPath, await readPublishContent(sourcePath))
    return true
  }

  const copyPlainFile = async (sourcePath, destinationPath) => {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.copyFile(sourcePath, destinationPath)
  }

  const writeTextFile = async (destinationPath, body) => {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true })
    await fs.writeFile(destinationPath, body, 'utf8')
  }

  const productionRuntimeFunctionTargetBody = async ({ source, targetIntegrationHubSpecifier }) => {
    const body = await fs.readFile(source, 'utf8')
    if (!targetIntegrationHubSpecifier) return body
    const sourceIntegrationHubSpecifier = './runtime-integration-hub.mjs'
    if (!body.includes(sourceIntegrationHubSpecifier)) {
      throw new Error(`Production runtime function does not import its source integration helper: ${source}`)
    }
    return body.replaceAll(sourceIntegrationHubSpecifier, targetIntegrationHubSpecifier)
  }

  return {
    copyIfChanged,
    copyPlainFile,
    existsDir,
    fileNeedsUpdate,
    listAllFiles,
    listFiles,
    plainFileNeedsUpdate,
    productionRuntimeFunctionTargetBody,
    textFileNeedsUpdate,
    toPosixRel,
    writeTextFile,
  }
}
