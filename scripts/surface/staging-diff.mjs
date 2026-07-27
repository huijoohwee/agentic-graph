import path from 'node:path'
import * as fileSystem from 'node:fs/promises'
import { isDiscoverySurfacePath } from './discovery-generate.mjs'

const MAX_FILES = 6_000
const MAX_FILE_BYTES = 500_000
const MAX_TOTAL_BYTES = 250_000_000
const REUSE_DECLARATION = 'REUSE.md'
const SURFACE_DIRECTORIES = new Set(['.well-known', '.well-known/structured-data'])

const byteCompare = (left, right) => Buffer.compare(
  Buffer.from(String(left), 'utf8'),
  Buffer.from(String(right), 'utf8'),
)

const asBufferMap = files => {
  const iterable = files instanceof Map ? files.entries() : Object.entries(files ?? {})
  return new Map([...iterable].map(([name, bytes]) => [name, Buffer.from(bytes)]))
}

const splitLines = buffer => {
  const source = buffer.toString('utf8')
  if (source === '') return []
  return source.split('\n')
}

const containsNul = buffer => buffer.includes(0)

const isSurfaceCandidatePath = relativePath => (
  isDiscoverySurfacePath(relativePath) || relativePath === REUSE_DECLARATION
)

const assertNotAborted = signal => {
  if (signal?.aborted) {
    throw signal.reason ?? new Error('diff operation aborted')
  }
}

export const createUnifiedDiff = (relativePath, trackedBytes, stagedBytes) => {
  const tracked = Buffer.from(trackedBytes)
  const staged = Buffer.from(stagedBytes)
  const header = `--- tracked/${relativePath}\n+++ staging/${relativePath}\n`
  if (containsNul(tracked) || containsNul(staged)) return `${header}Binary files differ\n`

  const oldLines = splitLines(tracked)
  const newLines = splitLines(staged)
  let prefix = 0
  while (
    prefix < oldLines.length
    && prefix < newLines.length
    && oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const contextStart = Math.max(0, prefix - 3)
  const oldChangeEnd = oldLines.length - suffix
  const newChangeEnd = newLines.length - suffix
  const oldEnd = Math.min(oldLines.length, oldChangeEnd + 3)
  const newEnd = Math.min(newLines.length, newChangeEnd + 3)
  const oldCount = oldEnd - contextStart
  const newCount = newEnd - contextStart
  const output = [
    header.trimEnd(),
    `@@ -${contextStart + 1},${oldCount} +${contextStart + 1},${newCount} @@`,
  ]

  for (let index = contextStart; index < prefix; index += 1) output.push(` ${oldLines[index]}`)
  for (let index = prefix; index < oldChangeEnd; index += 1) output.push(`-${oldLines[index]}`)
  for (let index = prefix; index < newChangeEnd; index += 1) output.push(`+${newLines[index]}`)

  const sharedContext = Math.min(oldEnd - oldChangeEnd, newEnd - newChangeEnd)
  for (let index = 0; index < sharedContext; index += 1) {
    output.push(` ${oldLines[oldChangeEnd + index]}`)
  }
  return `${output.join('\n')}\n`
}

export const diffFileMaps = (stagingFiles, trackedFiles) => {
  const staged = asBufferMap(stagingFiles)
  const tracked = asBufferMap(trackedFiles)
  const names = [...new Set([...staged.keys(), ...tracked.keys()])].sort(byteCompare)
  const result = {
    added: [],
    removed: [],
    changed: [],
    identical: [],
  }

  for (const name of names) {
    const stagedBytes = staged.get(name)
    const trackedBytes = tracked.get(name)
    if (stagedBytes === undefined) {
      result.removed.push(name)
      continue
    }
    if (trackedBytes === undefined) {
      result.added.push(name)
      continue
    }
    if (stagedBytes.equals(trackedBytes)) {
      result.identical.push(name)
      continue
    }
    result.changed.push({
      path: name,
      diff: createUnifiedDiff(name, trackedBytes, stagedBytes),
    })
  }
  return result
}

const readBoundedTree = async (
  root,
  {
    fs,
    include,
    rejectUnknown,
    maxFiles,
    maxFileBytes,
    maxTotalBytes,
    signal,
  },
) => {
  const resolvedRoot = path.resolve(root)
  const files = new Map()
  let totalBytes = 0

  const walk = async directory => {
    assertNotAborted(signal)
    const entries = await fs.readdir(directory, { withFileTypes: true })
    assertNotAborted(signal)
    entries.sort((left, right) => byteCompare(left.name, right.name))
    for (const entry of entries) {
      assertNotAborted(signal)
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(resolvedRoot, absolutePath).split(path.sep).join('/')
      if (entry.isDirectory()) {
        if (SURFACE_DIRECTORIES.has(relativePath)) {
          await walk(absolutePath)
        } else if (rejectUnknown) {
          throw new Error(`unrecognised staging directory: ${relativePath}`)
        }
        continue
      }
      if (entry.isSymbolicLink()) {
        if (rejectUnknown || include(relativePath)) {
          throw new Error(`symbolic links are not allowed in diff input: ${relativePath}`)
        }
        continue
      }
      if (!entry.isFile()) continue
      if (!include(relativePath)) {
        if (rejectUnknown) throw new Error(`unrecognised staging file: ${relativePath}`)
        continue
      }
      if (files.size >= maxFiles) throw new Error(`diff file limit exceeded: ${maxFiles}`)
      const stat = await fs.lstat(absolutePath)
      assertNotAborted(signal)
      if (stat.size > maxFileBytes) {
        throw new Error(`diff file byte limit exceeded for ${relativePath}: ${maxFileBytes}`)
      }
      totalBytes += stat.size
      if (totalBytes > maxTotalBytes) throw new Error(`diff total byte limit exceeded: ${maxTotalBytes}`)
      files.set(relativePath, await fs.readFile(absolutePath, { signal }))
    }
  }

  await walk(resolvedRoot)
  return files
}

export const diffStaging = async (
  stagingDir,
  trackedDir,
  {
    fs = fileSystem,
    maxFiles = MAX_FILES,
    maxFileBytes = MAX_FILE_BYTES,
    maxTotalBytes = MAX_TOTAL_BYTES,
    signal,
  } = {},
) => {
  const stagingRoot = path.resolve(stagingDir)
  const trackedRoot = path.resolve(trackedDir)
  if (stagingRoot === trackedRoot) throw new Error('staging and tracked roots must be different')

  const [stagingFiles, trackedFiles] = await Promise.all([
    readBoundedTree(stagingRoot, {
      fs,
      include: isSurfaceCandidatePath,
      rejectUnknown: true,
      maxFiles,
      maxFileBytes,
      maxTotalBytes,
      signal,
    }),
    readBoundedTree(trackedRoot, {
      fs,
      include: isSurfaceCandidatePath,
      rejectUnknown: false,
      maxFiles,
      maxFileBytes,
      maxTotalBytes,
      signal,
    }),
  ])
  return diffFileMaps(stagingFiles, trackedFiles)
}

export const diffGeneratedAgainstTracked = async (
  generatedFiles,
  trackedDir,
  {
    fs = fileSystem,
    maxFiles = MAX_FILES,
    maxFileBytes = MAX_FILE_BYTES,
    maxTotalBytes = MAX_TOTAL_BYTES,
    signal,
  } = {},
) => {
  const trackedFiles = await readBoundedTree(path.resolve(trackedDir), {
    fs,
    include: isSurfaceCandidatePath,
    rejectUnknown: false,
    maxFiles,
    maxFileBytes,
    maxTotalBytes,
    signal,
  })
  return diffFileMaps(generatedFiles, trackedFiles)
}
