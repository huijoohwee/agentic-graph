import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

export function readExecutionPartition(args = []) {
  if (args.length === 0) return 'all'
  if (args.length === 1 && /^--partition=(standard|extended-[a-f0-9]{12})$/u.test(args[0])) {
    return args[0].slice('--partition='.length)
  }
  throw new Error('affected validation accepts only --partition=standard or --partition=extended-<command-digest>')
}

const extendedPartition = command => `extended-${createHash('sha256')
  .update(JSON.stringify(command)).digest('hex').slice(0, 12)}`

// Each longer-budget command gets its own native check. Declared command digests
// bind the stable selectors without duplicating the contract's command catalog.
export function partitionAffectedCommands(commands, contract) {
  const partitions = { standard: [] }
  for (const { command, timeout_ms } of contract.ci_command_timeout_overrides ?? []) {
    if (timeout_ms <= contract.ci_command_timeout_ms) continue
    const partition = extendedPartition(command)
    if (Object.hasOwn(partitions, partition)) throw new Error('duplicate extended command partition')
    partitions[partition] = []
  }
  const seen = new Set()
  for (const command of commands) {
    const key = JSON.stringify(command)
    if (seen.has(key)) throw new Error('affected validation selected a duplicate command')
    seen.add(key)
    const partition = resolveCiCommandTimeoutMs(command, contract) > contract.ci_command_timeout_ms
      ? extendedPartition(command) : 'standard'
    if (!Object.hasOwn(partitions, partition)) throw new Error('undeclared extended command partition')
    partitions[partition].push(command)
  }
  // Check the selected CI control contracts before costlier product checks.
  // Commands remain owned by the existing catalog and execute exactly once.
  const controls = new Set(['collaboration', 'protected_ci_evidence'].flatMap(scope =>
    (contract.ci_scopes?.[scope]?.commands ?? []).map(command => JSON.stringify(command))))
  partitions.standard.sort((left, right) =>
    Number(controls.has(JSON.stringify(right))) - Number(controls.has(JSON.stringify(left))))
  return partitions
}

export function validateExecutionPartitions(partitions, policy) {
  const selectors = policy.checks.map(check => {
    if (JSON.stringify(check.command.slice(0, 4)) !== JSON.stringify(['npm', 'run', 'ci:affected:source', '--'])) {
      throw new Error('native validation command does not bind the affected source owner')
    }
    return readExecutionPartition(check.command.slice(4))
  })
  if (JSON.stringify(selectors.sort()) !== JSON.stringify(Object.keys(partitions).sort())) {
    throw new Error('native validation partitions must cover every declared command partition exactly once')
  }
}

export const main = async (args = process.argv.slice(2)) => {
  const partition = readExecutionPartition(args)
  const contract = await readContract()
  const declaredPartitions = partitionAffectedCommands([], contract)
  validateExecutionPartitions(declaredPartitions,
    JSON.parse(readFileSync(new URL('../.agentic-os-validation.json', import.meta.url), 'utf8')))
  if (partition !== 'all' && !Object.hasOwn(declaredPartitions, partition)) {
    throw new Error('unknown affected validation partition')
  }
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
    const partitions = partitionAffectedCommands(plan.commands, contract)
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
    for (const [name, commands] of Object.entries(partitions)) {
      if (partition !== 'all' && partition !== name) continue
      console.log(`[agentic-graph] ${name} partition: ${commands.length}/${plan.commands.length} selected checks`)
      if (commands.length === 0) continue
      const stages = commands.map(command => ({
        id: `check-${command.join('-').toLowerCase().replace(/[^a-z0-9.-]+/gu, '-').slice(0, 60)}-${createHash('sha256').update(JSON.stringify(command)).digest('hex').slice(0, 12)}`,
        command, timeoutMs: resolveCiCommandTimeoutMs(command, contract),
      }))
      if (reuse?.reused === true) {
        recordCiStageReuse(repoRoot, stages, reuse)
        console.log(`[agentic-graph] reused ${stages.length} source checks from ${reuse.runUrl}`)
      } else await runValidationStages(repoRoot, stages)
    }
  }
  console.log('[agentic-graph] affected CI checks passed')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) await main()
