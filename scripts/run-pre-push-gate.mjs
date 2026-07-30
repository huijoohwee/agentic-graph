import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { readContract, repoRoot } from './collaboration-contract.mjs'
import { findProtectedPushes, parsePrePushEntries } from './check-pre-push-refs.mjs'
import {
  assertFastForwardPublication,
  buildImmutableReleaseManifest,
  ZERO_SHA,
} from './immutable-release-manifest.mjs'

const runGit = args => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

export const withoutGitLocalEnvironment = (environment, localVariableNames) => {
  const sanitized = { ...environment }
  for (const variableName of String(localVariableNames || '').split(/\s+/).filter(Boolean)) {
    delete sanitized[variableName]
  }
  return sanitized
}

const runCheckoutIntegration = () => {
  const environment = withoutGitLocalEnvironment(
    process.env,
    runGit(['rev-parse', '--local-env-vars']),
  )
  const result = spawnSync('npm', ['run', 'ci:integration'], {
    cwd: repoRoot,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`checkout integration exited with status ${result.status}`)
}

export const classifyPrePushGate = ({ entries, headRevision, headRef }) => {
  if (!entries.length) return 'empty'
  return entries.every(entry => entry.localSha === headRevision && entry.localRef === headRef)
    ? 'checkout'
    : 'object'
}

const main = async () => {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk
  const contract = await readContract()
  const violations = findProtectedPushes(input, contract.coordination.protected_push_refs)
  if (violations.length) {
    throw new Error(`direct pushes to protected refs are forbidden: ${violations.join(', ')}`)
  }
  const entries = parsePrePushEntries(input)
  const headRevision = runGit(['rev-parse', 'HEAD'])
  const branch = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  const mode = classifyPrePushGate({ entries, headRevision, headRef: `refs/heads/${branch}` })
  if (mode === 'empty') return
  if (mode === 'checkout') {
    process.stdout.write('[knowgrph] pre-push: validating active checkout\n')
    runCheckoutIntegration()
    return
  }
  for (const entry of entries) {
    if (entry.localSha === ZERO_SHA) throw new Error('checkout-free branch deletion is forbidden')
    assertFastForwardPublication({ sourceRevision: entry.localSha, remoteRevision: entry.remoteSha })
    await buildImmutableReleaseManifest({
      sourceRevision: entry.localSha,
      targetRef: entry.remoteRef,
      expectedRemoteRevision: entry.remoteSha,
      publicationMode: 'checkout-free',
      pushHookMode: 'repository-owned-object-gate',
    })
  }
  process.stdout.write(`[knowgrph] pre-push: immutable object gate passed for ${entries.length} ref(s)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
