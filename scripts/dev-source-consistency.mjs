import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readContract, repoRoot, validateTaskBranch } from './collaboration-contract.mjs'
import {
  countRegisteredWorktrees,
  evaluateWorktreePolicy,
  parseRegisteredWorktrees,
  resolveCanonicalSourceRoots,
} from './worktree-policy.mjs'

const runGit = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }
  return String(result.stdout || '').trim()
}

const canonicalRef = source => `${source.canonical_remote}/${source.canonical_branch}`

const requireCanonicalSource = (state, source) => {
  if (source.task_divergence_allowed) {
    const invocationRoot = path.resolve(state.root || '')
    const canonicalRoot = path.resolve(state.canonicalRoot || '')
    const canonicalOwnerPath = state.canonicalOwnerPath
      ? path.resolve(state.canonicalOwnerPath)
      : null
    if (!state.root || !state.canonicalRoot) {
      throw new Error(`${source.id} canonical Dev source topology is incomplete`)
    }
    if (
      !canonicalOwnerPath
      || canonicalOwnerPath !== canonicalRoot
      || invocationRoot !== canonicalRoot
    ) {
      throw new Error(
        `blocked-canonical-path: canonical ${source.id} Dev must run from ${canonicalRoot}; `
        + `the registered ${source.canonical_branch} owner is ${canonicalOwnerPath || 'unavailable'} and this command ran from ${invocationRoot}. `
        + 'Preserve occupied lanes and restore canonical ownership through the repository lifecycle workflow.',
      )
    }
  }
  if (state.branch !== source.canonical_branch) {
    throw new Error(
      `${source.id} canonical Dev source requires branch ${source.canonical_branch}; received ${state.branch || 'detached HEAD'}`,
    )
  }
  if (source.clean_required && state.status) {
    const taskBranchHint = source.task_divergence_allowed && state.branch === source.canonical_branch
      ? ` Move local work to an agent/<device>/<semantic-scope> branch; npm run dev will select task mode there automatically.`
      : ''
    throw new Error(`${source.id} source requires a clean worktree; commit, stash, or remove local changes first.${taskBranchHint}`)
  }
  if (state.headSha !== state.canonicalSha) {
    const recovery = !state.status && state.branch === source.canonical_branch
      ? ' Run npm run dev:latest to fast-forward clean canonical checkouts safely.'
      : ''
    throw new Error(
      `${source.id} canonical Dev source mismatch: HEAD ${state.headSha} != ${canonicalRef(source)} ${state.canonicalSha}. `
      + `Update the ${source.id} checkout to the fetched canonical revision.${recovery}`,
    )
  }
  return `${source.id}=${canonicalRef(source)}@${state.canonicalSha.slice(0, 12)}`
}

export const resolveDevSourceMode = (sourceStates, contract, environment = process.env) => {
  const settings = contract.local_development
  const configuredMode = String(environment[settings.mode_environment_variable] || '').trim()
  if (configuredMode) return configuredMode

  const applicationSource = settings.canonical_sources.find(source => source.task_divergence_allowed)
  const applicationState = applicationSource
    ? sourceStates.find(state => state.id === applicationSource.id)
    : null
  const taskBranchPattern = new RegExp(contract.coordination.branch_pattern)

  return applicationState && taskBranchPattern.test(applicationState.branch)
    ? settings.task_mode
    : settings.canonical_mode
}

export const evaluateDevSourceConsistency = (sourceStates, contract, mode) => {
  const settings = contract.local_development
  if (mode !== settings.canonical_mode && mode !== settings.task_mode) {
    throw new Error(
      `${settings.mode_environment_variable} must be ${settings.canonical_mode} or ${settings.task_mode}; received ${mode}`,
    )
  }

  evaluateWorktreePolicy(sourceStates, contract)
  const statesById = new Map(sourceStates.map(state => [state.id, state]))
  const identities = settings.canonical_sources.map(source => {
    const state = statesById.get(source.id)
    if (!state) throw new Error(`missing local source identity for ${source.id}`)
    if (mode === settings.task_mode && source.task_divergence_allowed) {
      validateTaskBranch(state.branch, contract)
      return `${source.id}=task:${state.branch}@${state.headSha.slice(0, 12)} (canonical ${canonicalRef(source)}@${state.canonicalSha.slice(0, 12)})`
    }
    return requireCanonicalSource(state, source)
  })

  const canonical = mode === settings.canonical_mode
  return {
    canonical,
    message: canonical
      ? `${mode} sources ${identities.join('; ')}`
      : `${mode} preview only; not canonical Dev or release proof; sources ${identities.join('; ')}`,
  }
}

const requirePath = async targetPath => fs.access(targetPath)

export const checkDevSourceConsistency = async ({
  cwd = repoRoot,
  environment = process.env,
  git = runGit,
  pathCheck = requirePath,
} = {}) => {
  const contract = await readContract()
  const settings = contract.local_development
  const resolved = resolveCanonicalSourceRoots({ cwd, contract, git })
  const sourceStates = []
  for (const source of settings.canonical_sources) {
    const sourceRoot = resolved.roots.get(source.id)
    try {
      await pathCheck(path.resolve(sourceRoot, source.required_path))
    } catch {
      throw new Error(`${source.id} required path is unavailable at ${path.resolve(sourceRoot, source.required_path)}`)
    }
    if (source.fetch_required) git(['fetch', '--quiet', source.canonical_remote, source.canonical_branch], sourceRoot)
    const porcelain = source.id === resolved.applicationSourceId
      ? resolved.applicationPorcelain
      : git(['worktree', 'list', '--porcelain'], sourceRoot)
    sourceStates.push({
      id: source.id,
      root: sourceRoot,
      canonicalRoot: source.id === resolved.applicationSourceId
        ? resolved.canonicalApplicationRoot
        : sourceRoot,
      canonicalOwnerPath: source.id === resolved.applicationSourceId
        ? resolved.canonicalOwnerPath
        : sourceRoot,
      branch: git(['branch', '--show-current'], sourceRoot),
      headSha: git(['rev-parse', 'HEAD'], sourceRoot),
      canonicalSha: git(['rev-parse', `refs/remotes/${source.canonical_remote}/${source.canonical_branch}`], sourceRoot),
      status: git(['status', '--porcelain'], sourceRoot),
      worktreeCount: countRegisteredWorktrees(porcelain),
      worktrees: parseRegisteredWorktrees(porcelain),
    })
  }
  const mode = resolveDevSourceMode(sourceStates, contract, environment)
  return evaluateDevSourceConsistency(sourceStates, contract, mode)
}
