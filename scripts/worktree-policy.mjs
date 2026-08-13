import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { readContract, repoRoot } from './collaboration-contract.mjs'

const runGit = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed in ${cwd}${detail ? `: ${detail}` : ''}`)
  }
  return String(result.stdout || '').trim()
}

export const countRegisteredWorktrees = porcelain => String(porcelain || '')
  .split(/\r?\n/)
  .filter(line => line.startsWith('worktree '))
  .length

export const parseRegisteredWorktrees = porcelain => String(porcelain || '')
  .trim()
  .split(/\r?\n\r?\n/)
  .filter(Boolean)
  .map(block => {
    const record = { path: '', head: '', branch: '', detached: false, bare: false, prunable: false }
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('worktree ')) record.path = line.slice('worktree '.length)
      else if (line.startsWith('HEAD ')) record.head = line.slice('HEAD '.length)
      else if (line.startsWith('branch ')) record.branch = line.slice('branch '.length)
      else if (line === 'detached') record.detached = true
      else if (line === 'bare') record.bare = true
      else if (line.startsWith('prunable')) record.prunable = true
    }
    return record
  })

export const resolvePrimaryWorktreeRoot = ({ cwd, git = runGit }) => {
  const commonDirectory = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  )
  return path.dirname(path.resolve(cwd, commonDirectory))
}

export const resolveCanonicalSourceRoots = ({ cwd, contract, git = runGit }) => {
  const applicationSource = contract.local_development.canonical_sources
    .find(source => source.task_divergence_allowed)
  if (!applicationSource) throw new Error('canonical source registry has no application source')

  const applicationPorcelain = git(['worktree', 'list', '--porcelain'], cwd)
  const applicationWorktrees = parseRegisteredWorktrees(applicationPorcelain)
  const canonicalBranch = `refs/heads/${applicationSource.canonical_branch}`
  const canonicalOwners = applicationWorktrees.filter(worktree => worktree.branch === canonicalBranch)
  if (canonicalOwners.length > 1) {
    throw new Error(`${applicationSource.id} has multiple registered ${applicationSource.canonical_branch} worktrees`)
  }
  const canonicalApplicationRoot = resolvePrimaryWorktreeRoot({ cwd, git })
  const canonicalOwnerPath = canonicalOwners[0]
    ? path.resolve(canonicalOwners[0].path)
    : null
  const roots = new Map(contract.local_development.canonical_sources.map(source => [
    source.id,
    source.id === applicationSource.id
      ? cwd
      : path.resolve(canonicalApplicationRoot, source.repository_path),
  ]))
  return {
    applicationPorcelain,
    applicationSourceId: applicationSource.id,
    canonicalApplicationRoot,
    canonicalOwnerPath,
    roots,
  }
}

export const evaluateWorktreePolicy = (sourceStates, contract) => {
  const settings = contract.local_development
  const minimum = settings.worktree_policy.minimum_registered_per_repository
  const statesById = new Map(sourceStates.map(state => [state.id, state]))
  const sources = settings.canonical_sources.map(source => {
    const state = statesById.get(source.id)
    if (!state) throw new Error(`missing local worktree identity for ${source.id}`)
    if (state.worktreeCount < minimum) {
      throw new Error(
        `${source.id} source requires at least ${minimum} registered worktree per repository on this device; `
        + `found ${state.worktreeCount}`,
      )
    }
    const worktrees = Array.isArray(state.worktrees) ? state.worktrees : []
    if (worktrees.some(worktree => !worktree.path || !worktree.head || worktree.bare || worktree.prunable)) {
      throw new Error(`${source.id} source has an invalid, bare, or prunable registered worktree`)
    }
    const checkedOutBranches = worktrees.map(worktree => worktree.branch).filter(Boolean)
    if (new Set(checkedOutBranches).size !== checkedOutBranches.length) {
      throw new Error(`${source.id} source has one branch checked out in multiple worktrees`)
    }
    return { id: source.id, worktreeCount: state.worktreeCount }
  })

  return {
    message: `${settings.worktree_policy.mode} sources ${sources.map(source => (
      `${source.id}=${source.worktreeCount}`
    )).join('; ')}`,
    sources,
  }
}

export const checkWorktreePolicy = async ({
  cwd = repoRoot,
  git = runGit,
} = {}) => {
  const contract = await readContract()
  const resolved = resolveCanonicalSourceRoots({ cwd, contract, git })
  const sourceStates = contract.local_development.canonical_sources.map(source => {
    const sourceRoot = resolved.roots.get(source.id)
    const porcelain = source.id === resolved.applicationSourceId
      ? resolved.applicationPorcelain
      : git(['worktree', 'list', '--porcelain'], sourceRoot)
    return {
      id: source.id,
      worktreeCount: countRegisteredWorktrees(porcelain),
      worktrees: parseRegisteredWorktrees(porcelain),
    }
  })
  return evaluateWorktreePolicy(sourceStates, contract)
}
