import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readlink } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function git(repositoryRoot, args, encoding = 'utf8') {
  const result = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  })
  return result.stdout
}

async function hashRepositoryFiles(repositoryRoot, relativePaths) {
  const hash = createHash('sha256')
  for (const relativePath of [...relativePaths].sort()) {
    const absolutePath = path.join(repositoryRoot, relativePath)
    const stats = await lstat(absolutePath)
    hash.update(relativePath)
    hash.update('\0')
    hash.update(String(stats.mode))
    hash.update('\0')
    if (stats.isSymbolicLink()) {
      hash.update(await readlink(absolutePath))
    } else if (stats.isFile()) {
      hash.update(await readFile(absolutePath))
    } else {
      hash.update('<non-file>')
    }
    hash.update('\0')
  }
  return hash.digest('hex')
}

export async function captureGitRepositoryState(repositoryRoot) {
  const [head, status, listedFiles] = await Promise.all([
    git(repositoryRoot, ['rev-parse', 'HEAD']),
    git(repositoryRoot, [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]),
    git(repositoryRoot, [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ]),
  ])
  const relativePaths = listedFiles.split('\0').filter(Boolean)
  return Object.freeze({
    contentSha256: await hashRepositoryFiles(repositoryRoot, relativePaths),
    fileCount: relativePaths.length,
    head: head.trim(),
    status,
  })
}

export function repositoryStatesEqual(left, right) {
  return left.head === right.head
    && left.status === right.status
    && left.fileCount === right.fileCount
    && left.contentSha256 === right.contentSha256
}

export function describeRepositoryStateChange(before, after) {
  const changed = []
  if (before.head !== after.head) changed.push('HEAD')
  if (before.status !== after.status) changed.push('git status')
  if (before.fileCount !== after.fileCount) changed.push('tracked/untracked file set')
  if (before.contentSha256 !== after.contentSha256) changed.push('repository bytes')
  return changed.length > 0 ? changed.join(', ') : 'no change'
}
