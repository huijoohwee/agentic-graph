import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const shaPattern = /^[0-9a-f]{40}$/

export const readCanonicalReleaseOwnerState = ({
  repositoryRoot,
  execGit = createGitExecutor(repositoryRoot),
}) => ({
  branch: execGit(['branch', '--show-current']),
  head: execGit(['rev-parse', 'HEAD']),
  originMain: execGit(['rev-parse', 'origin/main']),
  status: execGit(['status', '--porcelain']),
})

export const validateCanonicalReleaseOwnerState = ({
  state,
  expectedRevision,
  label,
}) => {
  if (!shaPattern.test(String(expectedRevision || ''))) {
    throw new Error(`${label} expected revision must be an exact commit SHA`)
  }
  if (state?.branch !== 'main' ||
      state?.head !== expectedRevision ||
      state?.originMain !== expectedRevision ||
      state?.status !== '') {
    throw new Error(`${label} canonical main drifted from the authorized release input`)
  }
  return state
}

const createGitExecutor = repositoryRoot => argumentsList => execFileSync('git', argumentsList, {
  cwd: repositoryRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()

const validateDependencyCheckout = (state, revision) => {
  if (!shaPattern.test(String(revision || '')) || state.branch !== 'main'
    || state.head !== revision || state.status !== '') {
    throw new Error('Canonical release dependency checkout drifted from its reviewed revision')
  }
}

// Canvas owns admission of its declared consumer pin and verifies ancestry,
// protected checks, canonical roots and runtime residue. Reuse that owner; the
// release adapter additionally requires both exact checkouts to be fully clean.
export const verifyCanonicalReleaseDependency = async ({
  repositoryRoot, agenticCanvasOsRoot, sourceRevision, dependencyRevision,
  loadNativeModule = specifier => import(specifier),
  readState = readCanonicalReleaseOwnerState,
}) => {
  // Verify the reviewed bytes before importing executable controller modules.
  validateDependencyCheckout(readState({ repositoryRoot: agenticCanvasOsRoot }), dependencyRevision)
  const moduleAt = name => loadNativeModule(pathToFileURL(path.join(agenticCanvasOsRoot, 'scripts', name)).href)
  const [candidateOwner, supervisor] = await Promise.all([
    moduleAt('local-runtime-candidate-lib.mjs'), moduleAt('local-runtime-supervisor-lib.mjs'),
  ])
  const candidate = candidateOwner.resolveCanonicalCandidate(
    supervisor.normalizeOptions({ repository: repositoryRoot, agenticCanvasOsRoot }),
    supervisor.createDependencies({}), { verifyProtected: true },
  )
  if (candidate.agenticCanvasOsRoot !== path.resolve(agenticCanvasOsRoot)
    || candidate.agenticGraph.root !== path.resolve(repositoryRoot)) {
    throw new Error('Canonical release dependency resolved a different checkout')
  }
  const source = readState({ repositoryRoot })
  validateCanonicalReleaseOwnerState({ state: source, expectedRevision: sourceRevision, label: 'agentic-graph' })
  const dependency = readState({ repositoryRoot: agenticCanvasOsRoot })
  validateDependencyCheckout(dependency, dependencyRevision)
  const nativeDependency = candidate.agenticCanvasOs
  if (nativeDependency.headSha !== dependencyRevision
    || dependency.originMain !== nativeDependency.remoteSha
    || candidate.agenticGraph.headSha !== sourceRevision
    || candidate.agenticGraph.remoteSha !== source.originMain
    || nativeDependency.protectedChecksVerified !== true
    || !['fetched-tip', 'consumer-pin'].includes(nativeDependency.revisionBinding)) {
    throw new Error('Canonical release dependency drifted from its natively verified pin')
  }
  return { source, dependency, revisionBinding: nativeDependency.revisionBinding }
}
