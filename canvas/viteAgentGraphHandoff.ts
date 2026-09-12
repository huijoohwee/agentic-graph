import path from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { worktrees, headSha } from 'agentic-os/compat/git'
import { loadRepositoryProfileAtRef } from 'agentic-os/adapters/git'
import { observeGitHubReview, gh } from 'agentic-os/adapters/github'
import { generationManifest, writeGeneratedFile } from 'agentic-os/generation'
import { acquireOperationLock, finishOperationLock } from '../node_modules/agentic-os/src/git.mjs'
import { createExternalToolApprovalToken, authorizeExternalToolAction } from '../mcp/external-tool-approval.js'
import { execExact } from '../mcp/implementation-run-command.js'
import { runAgentGraphProposal } from './viteAgentGraphProposal'

type Value = Record<string, any>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const secret = randomBytes(32).toString('hex'), consumed = new Set<string>()
let review: Value | null = null
export function launchHandoffBinding(files: Value[], fresh: Value, target: string, base: string) {
  if (!Array.isArray(files) || files.length !== 5 || !files.every((file, i) => file.path === fresh.files[i].path && typeof file.text === 'string' && Buffer.byteLength(file.text) <= 24000 && file.text.startsWith(fresh.files[i].text.split('\nstatus:')[0] + '\n'))) throw new Error('Five bounded documents with unchanged source/revision headers are required')
  return { cid: fresh.evidence.cid, target, base, graphId: fresh.evidence.graphId, snapshotDigest: fresh.evidence.snapshotDigest, sourceCommit: fresh.evidence.sourceCommit, contractRevision: fresh.evidence.contractRevision, evidenceDigest: hash(JSON.stringify(fresh.evidence)), files: files.map(file => ({ path: file.path, sha256: hash(file.text) })) }
}
export const launchHandoffCommitMessage = (cid: string, binding: Value, digest: string) =>
  `docs: proposal ${cid}\n\n${JSON.stringify({ base: binding.base, reviewDigest: digest, filesDigest: hash(JSON.stringify(binding.files)) })}`
export async function runLaunchHandoff(input: Value, context: Parameters<typeof runAgentGraphProposal>[1], roles: string[]): Promise<Value> {
  const root = worktrees(context.rootDir)[0]?.path, cid = input.request?.cid
  if (root !== path.resolve(context.rootDir)) throw new Error('Launch Copilot: use the canonical Graph host for publication')
  const profile = loadRepositoryProfileAtRef({ repository: root, ref: 'refs/heads/main' })
  if (typeof cid !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cid) || cid.length > 80) throw new Error('Launch Copilot: invalid proposal CID')
  if (profile?.repository !== 'github.com/huijoohwee/agentic-graph' || worktrees(root)[0]?.branch !== profile.canonical.localRef.slice(11)) throw new Error('Launch Copilot: enrolled canonical Graph output is required')
  if (!Array.isArray(input.files) || input.files.length !== 5 || !input.files.every((file: Value, i: number) => file.path === `docs/proposals/${cid}/${roles[i]}.md` && typeof file.text === 'string' && Buffer.byteLength(file.text) <= 24000)) throw new Error('Launch Copilot: invalid five-file handoff')
  const scope = `proposal-${cid}`, ref = `agent/launch-copilot/${scope}`
  let publishing = false
  const command = async (executable: string, argv: string[], cwd = root) => {
    const result = await execExact(executable, argv, { cwd, env: context.env, timeoutMs: 900_000, maxOutputBytes: 499999, signal: publishing ? undefined : context.abortSignal })
    if (!result.ok) throw new Error(`Command stopped: ${executable}; inspect retained ${ref} through Agentic OS before recovery`)
    return result.stdout
  }
  const os = (argv: string[], cwd = root) => command(process.execPath, [path.join(root, 'node_modules/agentic-os/bin/agentic-os.mjs'), ...argv], cwd)
  const observe = async () => {
    const head = headSha(`refs/heads/${ref}`, root)
    if (!head) return { status: 'not-started', reason: 'No proposal lane exists.' }
    const message = await command('git', ['show', '-s', '--format=%B', head])
    if (!message.startsWith(`docs: proposal ${cid}\n\n`)) return { status: 'needs-recovery', reason: `Unpublished or interrupted lane retained: ${ref}. No automatic retry.` }
    const receipt = JSON.parse(message.slice(message.indexOf('\n\n') + 2)), paths = input.files.map((file: Value) => file.path).sort()
    if ((await command('git', ['rev-parse', `${head}^`])).trim() !== receipt.base || !/^[a-f0-9]{64}$/.test(receipt.reviewDigest)) throw new Error('Proposal commit/base identity differs from review')
    if (JSON.stringify((await command('git', ['diff', '--name-only', receipt.base, head])).trim().split('\n').sort()) !== JSON.stringify(paths)) throw new Error('Proposal contains a different path set')
    if (receipt.filesDigest !== hash(JSON.stringify(input.files.map((file: Value) => ({ path: file.path, sha256: hash(file.text) }))))) throw new Error('Documents changed after publication; reopen the reviewed versions')
    const observed = observeGitHubReview({ ref, expectedHead: head, profile, cwd: root })
    if (!observed.sourceHeadBound) return { status: 'needs-readback', reason: `Lane retained: ${ref}; ${observed.reason}. No automatic retry.` }
    const pr = observed.review, merged = pr.state === 'MERGED'
    const revision = merged ? gh(['pr', 'view', String(pr.number), '--repo', profile.repository, '--json', 'mergeCommit'], { cwd: root }).mergeCommit?.oid : head
    if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Provider revision unavailable')
    if (merged) await os(['finish', `--ref=${ref}`])
    for (const file of input.files) if (hash(await command('git', ['show', `${revision}:${file.path}`])) !== hash(file.text)) throw new Error('Provider content differs from review')
    return { status: merged ? 'integrated' : pr.state === 'OPEN' ? 'pr-open' : 'pr-closed', reason: `Five exact files verified at ${revision}.`, url: pr.url, revision }
  }
  if (input.action === 'handoff-status') return observe()
  const lock = acquireOperationLock('launch-copilot-handoff', root)
  if (!lock) throw new Error('Launch Copilot: another handoff is active; use status for readback')
  let result, error
  try {
    if (headSha(`refs/heads/${ref}`, root)) return result = await observe()
    if (worktrees(root).some(entry => entry.branch?.startsWith('agent/launch-copilot/proposal-'))) throw new Error('Finish the retained proposal lane before starting another')
    const fresh = await runAgentGraphProposal({ ...input.request, action: 'ground' }, context)
    if (!fresh.evidence.sourceCommit || fresh.evidence.complete !== true) throw new Error('Re-import a complete repository URL before review')
    const base = headSha('HEAD', root)
    if ((await command('git', ['status', '--porcelain'])).trim() || (await command('git', ['ls-tree', '-r', '--name-only', base, '--', ...input.files.map((file: Value) => file.path)])).trim()) throw new Error('Clean canonical output and unused proposal paths are required')
    const binding = launchHandoffBinding(input.files, fresh, profile.repository, base), digest = hash(JSON.stringify(binding))
    const currentBase = async () => {
      if (headSha('HEAD', root) !== base || (await command('git', ['ls-remote', 'origin', profile.canonical.localRef])).split(/\s/)[0] !== base) throw new Error('Output base changed; sync canonical Graph and review again')
    }
    await os(['doctor']); await currentBase(); context.abortSignal.throwIfAborted()
    if (input.action === 'handoff-review') {
      consumed.clear(); review = { digest, token: createExternalToolApprovalToken({ secret, actionDigest: digest }) }
      return result = { status: 'review-required', reason: 'Review all five files and hashes. Approval runs the locked toolchain/checks and publishes these bytes in one protected PR; merge is separate.', ...binding, approval: review.token.signature }
    }
    if (input.action !== 'handoff-approve' || !review || input.approval !== review.token.signature || review.digest !== digest) throw new Error('Approval is missing or stale; review the current exact documents')
    authorizeExternalToolAction({ secret, actionDigest: digest, token: review.token, consumedTokenIds: consumed })
    // After approval, disconnect stops UI waiting, not a publication already in flight.
    publishing = true
    await os(['start', scope, '--device=launch-copilot', `--write=${binding.files.map(file => file.path).join(',')}`])
    const lane = worktrees(root).find(entry => entry.branch === ref)?.path
    if (!lane || headSha('HEAD', lane) !== base) throw new Error('Admitted lane base changed; inspect retained effects')
    await currentBase()
    for (const file of input.files) await writeGeneratedFile(path.join(lane, file.path), file.text)
    const written = generationManifest(lane, { paths: binding.files.map(file => file.path) }).files
    if (JSON.stringify(written.map(file => ({ path: file.path, sha256: file.sha256 }))) !== JSON.stringify([...binding.files].sort((a, b) => a.path.localeCompare(b.path)))) throw new Error('Written file hashes differ from review')
    const body = path.join(context.outputRoot, `${cid}-review.md`)
    await writeGeneratedFile(body, `---\naction: /change\nscope: "#proposal.${cid}"\nactor: "@launch-copilot"\nbase_sha: "${base}"\n---\n\nReviewed proposal ${cid}.\n\n${JSON.stringify(binding)}\n\nReview digest: ${digest}\n`)
    await command('npm', ['ci', '--ignore-scripts'], lane)
    const rechecked = await runAgentGraphProposal({ ...input.request, action: 'ground' }, { ...context, abortSignal: AbortSignal.timeout(30_000) })
    if (hash(JSON.stringify(launchHandoffBinding(input.files, rechecked, profile.repository, base))) !== digest) throw new Error('Source or contract changed after review')
    await currentBase()
    await os(['land', `--message=${launchHandoffCommitMessage(cid, binding, digest)}`, `--body-file=${body}`], lane)
    result = await observe()
  } catch (caught) { error = new Error(`Launch Copilot: ${(caught as Error).message}`) }
  finally { finishOperationLock(lock, { label: 'launch-copilot-handoff', result, error }) }
  return result
}
