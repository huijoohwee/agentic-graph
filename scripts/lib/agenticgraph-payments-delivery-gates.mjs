import { execFileSync } from 'node:child_process'

const HEX_40_PATTERN = /^[0-9a-f]{40}$/

const runGit = (root, args, fallback = '') => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return fallback
  }
}

export const inspectAgenticGraphPaymentsSourceIdentity = root => {
  const revision = runGit(root, ['rev-parse', 'HEAD'], null)
  const tree = runGit(root, ['rev-parse', 'HEAD^{tree}'], null)
  const branch = runGit(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], 'DETACHED')
  const status = runGit(root, ['status', '--porcelain=v1', '--untracked-files=all'], null)
  return {
    revision: HEX_40_PATTERN.test(revision || '') ? revision : null,
    tree: HEX_40_PATTERN.test(tree || '') ? tree : null,
    branch,
    clean: status === '',
  }
}

export const inspectAgenticGraphPaymentsCanonicalRuntime = (root, sourceIdentity) => {
  const originMain = runGit(root, ['rev-parse', 'refs/remotes/origin/main'], null)
  const exactMainSourceIdentity =
    sourceIdentity.branch === 'main'
    && sourceIdentity.clean
    && sourceIdentity.revision !== null
    && sourceIdentity.revision === originMain
  return {
    status: 'not-proven',
    requiredForExit: false,
    sourceIdentityExactMain: exactMainSourceIdentity,
    detail: exactMainSourceIdentity
      ? 'Clean main equals refs/remotes/origin/main, but source identity alone does not prove the supervised Agentic Canvas OS canonical runtime.'
      : 'This local task checkout does not prove exact-main source identity or the supervised Agentic Canvas OS canonical runtime.',
  }
}
