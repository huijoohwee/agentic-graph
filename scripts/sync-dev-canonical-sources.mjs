import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readContract, repoRoot } from './collaboration-contract.mjs'
import {
  countRegisteredWorktrees,
  evaluateWorktreePolicy,
  parseRegisteredWorktrees,
  resolveCanonicalSourceRoots,
} from './worktree-policy.mjs'

const runGit = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    const detail = String(result.error?.message || result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed in ${cwd}${detail ? `: ${detail}` : ''}`)
  }
  return String(result.stdout || '').trim()
}

const requirePath = async targetPath => fs.access(targetPath)
const canonicalRef = source => `refs/remotes/${source.canonical_remote}/${source.canonical_branch}`
const displayCanonicalRef = source => `${source.canonical_remote}/${source.canonical_branch}`

export const planDevCanonicalSourceFastForwards = (sourceStates, contract) => {
  evaluateWorktreePolicy(sourceStates, contract)
  return contract.local_development.canonical_sources.map(source => {
    const state = sourceStates.find(candidate => candidate.id === source.id)
    if (!state) throw new Error(`missing local source identity for ${source.id}`)
    if (state.status) {
      throw new Error(`${source.id} source requires a clean worktree; commit, stash, or remove local changes first`)
    }
    if (state.branch !== source.canonical_branch) {
      throw new Error(
        `${source.id} source must be on ${source.canonical_branch} for dev:latest; received ${state.branch || '(detached HEAD)'}. `
        + 'Use AG_DEV_SOURCE_MODE=task npm run dev for an owned task branch',
      )
    }
    if (state.headSha !== state.canonicalSha && state.mergeBaseSha !== state.headSha) {
      throw new Error(
        `${source.id} source cannot fast-forward from ${state.headSha} to ${displayCanonicalRef(source)} ${state.canonicalSha}; `
        + 'reconcile the divergent history explicitly',
      )
    }
    return {
      ...state,
      canonicalRef: canonicalRef(source),
      displayCanonicalRef: displayCanonicalRef(source),
      updateRequired: state.headSha !== state.canonicalSha,
    }
  })
}

export const syncDevCanonicalSources = async ({
  cwd = repoRoot,
  git = runGit,
  pathCheck = requirePath,
} = {}) => {
  const contract = await readContract()
  const resolved = resolveCanonicalSourceRoots({ cwd, contract, git })
  const sourceStates = []
  for (const source of contract.local_development.canonical_sources) {
    const sourceRoot = resolved.roots.get(source.id)
    try {
      await pathCheck(path.resolve(sourceRoot, source.required_path))
    } catch {
      throw new Error(`${source.id} required path is unavailable at ${path.resolve(sourceRoot, source.required_path)}`)
    }
    git(['fetch', '--quiet', '--prune', source.canonical_remote, source.canonical_branch], sourceRoot)
    const headSha = git(['rev-parse', 'HEAD'], sourceRoot)
    const remoteRef = canonicalRef(source)
    const canonicalSha = git(['rev-parse', remoteRef], sourceRoot)
    const porcelain = source.id === resolved.applicationSourceId
      ? resolved.applicationPorcelain
      : git(['worktree', 'list', '--porcelain'], sourceRoot)
    sourceStates.push({
      id: source.id,
      sourceRoot,
      branch: git(['branch', '--show-current'], sourceRoot),
      headSha,
      canonicalSha,
      mergeBaseSha: headSha === canonicalSha ? headSha : git(['merge-base', 'HEAD', remoteRef], sourceRoot),
      status: git(['status', '--porcelain'], sourceRoot),
      worktreeCount: countRegisteredWorktrees(porcelain),
      worktrees: parseRegisteredWorktrees(porcelain),
    })
  }

  const plan = planDevCanonicalSourceFastForwards(sourceStates, contract)
  for (const source of plan) {
    if (!source.updateRequired) continue
    git(['merge', '--ff-only', source.canonicalRef], source.sourceRoot)
  }

  return {
    message: `canonical Dev sources ready ${plan.map(source => (
      `${source.id}=${source.displayCanonicalRef}@${source.canonicalSha.slice(0, 12)}${source.updateRequired ? ' (fast-forwarded)' : ''}`
    )).join('; ')}`,
    sources: plan,
  }
}
