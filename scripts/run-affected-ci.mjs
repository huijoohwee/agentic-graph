import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  readContract,
  repoRoot,
  resolveCiCommandTimeoutMs,
  selectAffectedCommands,
} from './collaboration-contract.mjs'
import { readChangedPaths, ownerInputDigest } from './ci-evidence-inputs.mjs'
export { readChangedPaths, readGitText } from './ci-evidence-inputs.mjs'

export const main = async () => {
  const contract = await readContract()
  let baseRevision
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const { resolveValidationCi } = await import('../node_modules/agentic-os/bin/agentic-os-validation.mjs')
    baseRevision = resolveValidationCi(repoRoot).base
  }
  const changedPaths = readChangedPaths({ baseRevision })
  const plan = selectAffectedCommands(changedPaths, contract)

  console.log(`[agentic-graph] affected paths: ${changedPaths.length}`)
  console.log(`[agentic-graph] affected scopes: ${plan.scopes.join(', ') || 'none'}`)
  if (plan.unmatchedPaths.length > 0) {
    console.log(`[agentic-graph] fallback paths: ${plan.unmatchedPaths.join(', ')}`)
  }

  if (plan.commands.length) {
    const { runValidationStages, recordCiStageReuse } = await import('../node_modules/agentic-os/bin/agentic-os-validation-stages.mjs')
    const stages = plan.commands.map(command => ({
      id: `check-${command.join('-').toLowerCase().replace(/[^a-z0-9.-]+/gu, '-').slice(0, 60)}-${createHash('sha256').update(JSON.stringify(command)).digest('hex').slice(0, 12)}`,
      command, timeoutMs: resolveCiCommandTimeoutMs(command, contract),
    }))
    let reuse = null
    const directory = process.env.AGENTIC_OS_CI_SOURCE_EVIDENCE_DIR
    if (directory && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'push'
      && process.env.GITHUB_REF === 'refs/heads/main') {
      try {
        const { runCiEvidence } = await import('../node_modules/agentic-os/bin/agentic-os-ci-evidence.mjs')
        reuse = runCiEvidence(['verify', '--policy=.agentic-os-ci-source-evidence.json',
          `--lookup=${path.join(directory, 'ci-evidence-lookup.json')}`,
          `--evidence=${path.join(directory, 'protected-ci-evidence/evidence.json')}`,
          `--output=${path.join(directory, 'ci-source-reuse.json')}`],
        { ...process.env, AGENTIC_OS_CI_OWNER_INPUTS: await ownerInputDigest() })
      } catch { console.log('[agentic-graph] source reuse unavailable; executing original plan') }
    }
    if (reuse?.reused === true) {
      recordCiStageReuse(repoRoot, stages, reuse)
      console.log(`[agentic-graph] reused ${stages.length} source checks from ${reuse.runUrl}`)
    } else await runValidationStages(repoRoot, stages)
  }
  console.log('[agentic-graph] affected CI checks passed')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) await main()
