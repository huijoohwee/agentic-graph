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
const ISOLATION_PREFIX = '.agentic-graph-flight-verification-'
const ATTESTATION_BASENAME = 'agentic-graph-flight-verification-isolation.json'

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
  tree,
  caller,
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
      tree,
      caller,
      isolationRoot,
      sourceRoot,
      token,
    })}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
}

async function assertCallerIdentity(sourceRoot, caller) {
  const [branch, head, status] = await Promise.all([
    git(sourceRoot, ['branch', '--show-current']),
    git(sourceRoot, ['rev-parse', 'HEAD']),
    git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  ])
  if (branch !== caller.branch || head !== caller.head || status !== caller.status
    || await git(sourceRoot, ['rev-parse', `${head}^{tree}`]) !== caller.tree) {
    throw new Error('Verification caller identity changed')
  }
}

export async function createGitVerificationWorkspace(repositoryRoot) {
  return createVerificationWorkspace(repositoryRoot)
}

/** Exact historical check input; does not grant candidate or release authority. */
export async function createHistoricalGitVerificationWorkspace(repositoryRoot, revision) {
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error('Historical verification requires an exact commit revision')
  }
  return createVerificationWorkspace(repositoryRoot, revision)
}

async function createVerificationWorkspace(repositoryRoot, revision = null) {
  const sourceRoot = path.resolve(repositoryRoot)
  const [sourceBranch, commonGitDirectory, sourceHead, status] = await Promise.all([
    git(sourceRoot, ['branch', '--show-current']),
    git(sourceRoot, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]),
    git(sourceRoot, ['rev-parse', 'HEAD']),
    git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']),
  ])
  const caller = Object.freeze({ branch: sourceBranch, head: sourceHead, status,
    tree: await git(sourceRoot, ['rev-parse', `${sourceHead}^{tree}`]) })
  if (revision) {
    if (status) throw new Error('Historical verification requires a clean caller checkout')
    try {
      if (await git(sourceRoot, ['rev-parse', `${revision}^{commit}`]) !== revision) {
        throw new Error('not an exact commit')
      }
      await git(sourceRoot, ['merge-base', '--is-ancestor', revision, sourceHead])
    } catch {
      throw new Error('Historical verification revision must be a caller ancestor commit')
    }
  }
  const head = revision || sourceHead
  const branch = revision ? '' : sourceBranch
  const tree = await git(sourceRoot, ['rev-parse', `${head}^{tree}`])
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
    if (await git(isolationRoot, ['rev-parse', 'HEAD']) !== head
      || await git(isolationRoot, ['rev-parse', 'HEAD^{tree}']) !== tree) {
      throw new Error('Verification fixture identity differs from its requested commit')
    }
    await assertCallerIdentity(sourceRoot, caller)
    await writeIsolationAttestation({
      branch,
      head,
      tree,
      caller,
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
    tree,
    caller,
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
    || attestation.tree !== await git(isolationRoot, ['rev-parse', 'HEAD^{tree}'])
    || attestation.branch !== await git(isolationRoot, ['branch', '--show-current'])
  ) {
    throw new Error('Flight verification child lacks an exact isolation attestation')
  }
  await assertCallerIdentity(attestation.sourceRoot, attestation.caller)
  return Object.freeze(attestation)
}
