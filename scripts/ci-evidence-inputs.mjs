/** Graph owns affected selection; Agentic OS owns protected provider evidence. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readContract, repoRoot, selectAffectedCommands } from './collaboration-contract.mjs'
import { readChangedPaths, readGitText } from './run-affected-ci.mjs'

export function ownerInputs({ contract, environment, gitText, resolveCi, versions }) {
  if (environment.GITHUB_ACTIONS !== 'true'
    || !['push', 'workflow_dispatch'].includes(environment.GITHUB_EVENT_NAME)) {
    throw new Error('CI evidence requires a protected source event')
  }
  const baseRevision = environment.GITHUB_EVENT_NAME === 'push' ? resolveCi().base : undefined
  const paths = readChangedPaths({ environment, gitText, baseRevision })
  const plan = selectAffectedCommands(paths, contract)
  // Bind the complete selection, not merely the shared wrapper command.
  return { schema: 'agentic-graph/ci-owner-inputs/v1', paths,
    commands: plan.commands, scopes: plan.scopes, versions }
}

const toolVersion = (command, args) => execFileSync(command, args, {
  cwd: repoRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 4096,
}).trim()

export async function main(environment = process.env) {
  const { resolveValidationCi } = await import('../node_modules/agentic-os/bin/agentic-os-validation.mjs')
  const value = ownerInputs({
    contract: await readContract(), environment,
    gitText: readGitText,
    resolveCi: () => resolveValidationCi(repoRoot, environment),
    versions: { python: toolVersion('python', ['--version']),
      chrome: toolVersion('google-chrome', ['--version']) },
  })
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex')
  console.log(`AGENTIC_OS_CI_OWNER_INPUTS=${digest}`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
