import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  constants,
  cp as copyDirectory,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ISOLATION_PREFIX = '.knowgrph-flight-verification-'
const ATTESTATION_BASENAME = 'knowgrph-flight-verification-isolation.json'

async function git(repositoryRoot, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return stdout.trim()
}

function isWithin(parentPath, candidatePath) {
  const relativePath = path.relative(parentPath, candidatePath)
  return relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

async function assertNoDependencyLinkEscape(
  directoryRoot,
  isolatedRepositoryRoot,
) {
  const entries = await readdir(directoryRoot, { withFileTypes: true })
  for (const entry of entries) {
    const absolutePath = path.join(directoryRoot, entry.name)
    if (entry.isSymbolicLink()) {
      const target = await readlink(absolutePath)
      const resolvedTarget = path.resolve(path.dirname(absolutePath), target)
      if (!isWithin(isolatedRepositoryRoot, resolvedTarget)) {
        throw new Error(
          `Flight verification dependency link escapes isolation: ${absolutePath}`,
        )
      }
      continue
    }
    if (entry.isDirectory()) {
      await assertNoDependencyLinkEscape(
        absolutePath,
        isolatedRepositoryRoot,
      )
    }
  }
}

async function cloneDependencyDirectory(sourceRoot, destinationRoot) {
  try {
    const metadata = await lstat(sourceRoot)
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${sourceRoot} must be a regular dependency directory`)
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Flight verification requires locally installed dependencies at ${sourceRoot}`,
      )
    }
    throw error
  }
  if (process.platform === 'darwin') {
    await execFileAsync('/bin/cp', ['-cR', sourceRoot, destinationRoot])
    return
  }
  if (process.platform === 'linux') {
    await execFileAsync('cp', [
      '--archive',
      '--reflink=auto',
      sourceRoot,
      destinationRoot,
    ])
    return
  }
  await copyDirectory(sourceRoot, destinationRoot, {
    dereference: false,
    mode: constants.COPYFILE_FICLONE,
    preserveTimestamps: true,
    recursive: true,
    verbatimSymlinks: true,
  })
}

async function installDependencyOverlay(sourceRoot, isolatedRoot) {
  await cloneDependencyDirectory(
    path.join(sourceRoot, 'node_modules'),
    path.join(isolatedRoot, 'node_modules'),
  )
  const canvasDependencyRoot = path.join(sourceRoot, 'canvas', 'node_modules')
  try {
    await cloneDependencyDirectory(
      canvasDependencyRoot,
      path.join(isolatedRoot, 'canvas', 'node_modules'),
    )
  } catch (error) {
    if (!String(error?.message).includes('requires locally installed')) {
      throw error
    }
  }
  await assertNoDependencyLinkEscape(
    path.join(isolatedRoot, 'node_modules'),
    isolatedRoot,
  )
  const isolatedCanvasDependencies = path.join(
    isolatedRoot,
    'canvas',
    'node_modules',
  )
  try {
    await assertNoDependencyLinkEscape(
      isolatedCanvasDependencies,
      isolatedRoot,
    )
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function assertSafeIsolationPath(isolationParent, isolationRoot) {
  if (
    path.dirname(isolationRoot) !== isolationParent
    || !path.basename(isolationRoot).startsWith(ISOLATION_PREFIX)
  ) {
    throw new Error(`Refusing unsafe Flight verification cleanup: ${isolationRoot}`)
  }
}

async function writeIsolationAttestation({
  branch,
  head,
  isolationRoot,
  sourceRoot,
  token,
}) {
  const gitDirectory = await git(isolationRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ])
  await writeFile(
    path.join(gitDirectory, ATTESTATION_BASENAME),
    `${JSON.stringify({
      branch,
      head,
      isolationRoot,
      sourceRoot,
      token,
    })}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
}

export async function createGitVerificationWorkspace(repositoryRoot) {
  const sourceRoot = path.resolve(repositoryRoot)
  const [branch, commonGitDirectory, head] = await Promise.all([
    git(sourceRoot, ['branch', '--show-current']),
    git(sourceRoot, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]),
    git(sourceRoot, ['rev-parse', 'HEAD']),
  ])
  const canonicalRepositoryRoot = path.dirname(commonGitDirectory)
  const isolationParent = path.dirname(canonicalRepositoryRoot)
  const isolationRoot = await mkdtemp(
    path.join(isolationParent, ISOLATION_PREFIX),
  )
  const token = randomUUID()
  try {
    await execFileAsync(
      'git',
      [
        'clone',
        '--quiet',
        '--local',
        '--shared',
        '--no-checkout',
        '--',
        sourceRoot,
        isolationRoot,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    if (branch) {
      await git(isolationRoot, ['checkout', '--quiet', '-B', branch, head])
    } else {
      await git(isolationRoot, ['checkout', '--quiet', '--detach', head])
    }
    await installDependencyOverlay(sourceRoot, isolationRoot)
    await writeIsolationAttestation({
      branch,
      head,
      isolationRoot,
      sourceRoot,
      token,
    })
  } catch (error) {
    assertSafeIsolationPath(isolationParent, isolationRoot)
    await rm(isolationRoot, { recursive: true, force: true })
    throw error
  }
  return Object.freeze({
    branch,
    head,
    repositoryRoot: isolationRoot,
    token,
    async dispose() {
      assertSafeIsolationPath(isolationParent, isolationRoot)
      await rm(isolationRoot, { recursive: true, force: true })
    },
  })
}

export async function assertGitVerificationWorkspace({
  repositoryRoot,
  token,
}) {
  const isolationRoot = path.resolve(repositoryRoot)
  const gitDirectory = await git(isolationRoot, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ])
  const attestation = JSON.parse(
    await readFile(path.join(gitDirectory, ATTESTATION_BASENAME), 'utf8'),
  )
  if (
    !token
    || attestation.token !== token
    || attestation.isolationRoot !== isolationRoot
    || attestation.head !== await git(isolationRoot, ['rev-parse', 'HEAD'])
    || attestation.branch !== await git(isolationRoot, ['branch', '--show-current'])
  ) {
    throw new Error('Flight verification child lacks an exact isolation attestation')
  }
  return Object.freeze(attestation)
}
