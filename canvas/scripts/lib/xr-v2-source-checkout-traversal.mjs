import { execFileSync } from 'node:child_process'

const SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE = Object.freeze({
  attached: Object.freeze([]),
  'github-pull-request-merge': Object.freeze(['--ancestry-path']),
})

export function isGitAncestor(repositoryRoot, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    })
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.status === 1) return false
    throw error
  }
}

export function resolveXrV2SourceAheadGitArgs({
  sourceCheckoutState,
  sourceUpstreamRef,
}) {
  if (!Object.hasOwn(SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE, sourceCheckoutState)) {
    throw new Error(`unsupported XR v2 source checkout state: ${String(sourceCheckoutState)}`)
  }
  const checkoutOptions = SOURCE_AHEAD_OPTIONS_BY_CHECKOUT_STATE[sourceCheckoutState]
  if (typeof sourceUpstreamRef !== 'string' || sourceUpstreamRef.trim() === '') {
    throw new Error('XR v2 source upstream ref must be a non-empty string')
  }
  return Object.freeze([
    'rev-list',
    '--count',
    ...checkoutOptions,
    `${sourceUpstreamRef}..HEAD`,
  ])
}
