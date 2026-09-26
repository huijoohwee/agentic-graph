/** Graph owns affected selection; Agentic OS owns protected provider evidence. */
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { readContract, repoRoot, selectAffectedCommands } from './collaboration-contract.mjs'
export const readGitText = (args, { spawnGit = spawnSync } = {}) => {
  const result = spawnGit('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.error) throw new Error(`git ${args[0]} could not start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`git ${args[0]} exited with ${result.status ?? 1}`)
  return String(result.stdout || '')
}

const runGit = args => readGitText(args)

const addGitPaths = (set, value) => {
  const inventory = String(value || '')
  if (inventory === '') return
  if (!inventory.endsWith('\0')) throw new Error('git path inventory is not NUL-terminated')
  for (const rel of inventory.slice(0, -1).split('\0')) {
    if (rel === '' || /[\\\r\n]/u.test(rel)) throw new Error('git path inventory contains a noncanonical path')
    set.add(rel)
  }
}

export const readChangedPaths = ({
  environment = process.env,
  gitText = runGit,
  baseRevision,
} = {}) => {
  const paths = new Set()
  const githubBaseRef = String(environment.GITHUB_BASE_REF || '').trim()
  const canonicalBaseRef = String(environment.AGENTIC_OS_PR_BASE_REF || '').trim()
  if (githubBaseRef && canonicalBaseRef && githubBaseRef !== canonicalBaseRef) {
    throw new Error('GitHub base ref conflicts with the canonical agentic-graph pull request base ref')
  }
  const protectedRefreshBaseRef = environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_EVENT_NAME === 'workflow_dispatch'
    ? canonicalBaseRef
    : ''
  const baseRef = githubBaseRef || protectedRefreshBaseRef
  const before = String(environment.GITHUB_EVENT_BEFORE || '').trim()

  if (baseRevision !== undefined) {
    if (!/^[0-9a-f]{40}$/u.test(baseRevision) || /^0+$/u.test(baseRevision)) throw new Error('invalid validation base revision')
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', `${baseRevision}...HEAD`]))
  } else if (baseRef) addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', `origin/${baseRef}...HEAD`]))
  else if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', `${before}...HEAD`]))
  } else if (environment.GITHUB_ACTIONS === 'true') {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', 'HEAD^...HEAD']))
  } else {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', 'origin/main...HEAD']))
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', 'HEAD']))
    addGitPaths(paths, gitText(['ls-files', '-z', '--others', '--exclude-standard']))
  }

  return [...paths].sort()
}

export function ownerInputs({ contract, environment, gitText, resolveCi, versions }) {
  if (environment.GITHUB_ACTIONS !== 'true'
    || !['push', 'pull_request', 'workflow_dispatch'].includes(environment.GITHUB_EVENT_NAME)) {
    throw new Error('CI evidence requires a protected source event')
  }
  const baseRevision = environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ? resolveCi().base : undefined
  const paths = readChangedPaths({ environment, gitText, baseRevision })
  const plan = selectAffectedCommands(paths, contract)
  // Bind the complete selection, not merely the shared wrapper command.
  return { schema: 'agentic-graph/ci-owner-inputs/v1', paths,
    commands: plan.commands, scopes: plan.scopes, versions }
}

export function toolVersion(command, args, { execute = execFileSync, readPackageVersion = execFileSync } = {}) {
  // A hosted runner can time out before Chrome prints its version. A second
  // timeout may use the installed package's exact version; missing metadata
  // still fails closed and never becomes reusable CI evidence.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const version = execute(command, args, {
        cwd: repoRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 4096,
        killSignal: 'SIGKILL',
      }).trim()
      if (!version) throw new Error(`${command} returned no version evidence`)
      return version
    } catch (error) {
      if (error?.code !== 'ETIMEDOUT') throw error
      if (attempt === 1) {
        if (command === 'google-chrome' && args.length === 1 && args[0] === '--version') {
          try {
            const version = readPackageVersion('dpkg-query', ['-W', '-f=${Version}', 'google-chrome-stable'], {
              cwd: repoRoot, encoding: 'utf8', timeout: 5000, maxBuffer: 4096, killSignal: 'SIGKILL',
            }).trim()
            if (/^[0-9]+(?:\.[0-9]+){2,4}(?:-[0-9a-z.+~:-]+)?$/u.test(version)) {
              return `Google Chrome ${version} (installed package)`
            }
          } catch { /* The timed-out executable remains the recorded failure. */ }
        }
        throw error
      }
    }
  }
}

export async function ownerInputDigest(environment = process.env) {
  const { resolveValidationCi } = await import('../node_modules/agentic-os/bin/agentic-os-validation.mjs')
  const value = ownerInputs({
    contract: await readContract(), environment,
    gitText: readGitText,
    resolveCi: () => resolveValidationCi(repoRoot, environment),
    versions: { python: toolVersion('python', ['--version']),
      chrome: toolVersion('google-chrome', ['--version']) },
  })
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
export function xrRuntimeGateRequired(inputs, eventName) {
  return !(['pull_request', 'push'].includes(eventName)
    && inputs.paths.length > 0
    && inputs.paths.every(path => path.startsWith('docs/documents/') && path.endsWith('.md')
      && path.split('/').every(segment => segment !== '..' && segment !== '.' && segment !== ''))
    && inputs.scopes.length === 1 && inputs.scopes[0] === 'documentation'
    && inputs.commands.length === 0)
}
export function xrRuntimeGateExecutionRequired(inputs, eventName) {
  if (!xrRuntimeGateRequired(inputs, eventName)) return false
  // PR integration executes its complete affected plan freshly. Main may reuse
  // source-plan evidence without local browser artifacts, so retain its gate.
  const covered = [['npm', 'run', 'xr-v2:unit'], ['npm', 'run', 'xr-v2:source-ready'],
    ['npm', '-C', 'canvas', 'run', 'test:smoke:xr-v2:browser']]
    .every(required => inputs.commands.some(command => JSON.stringify(command) === JSON.stringify(required)))
  return eventName !== 'pull_request' || !covered
}

export async function main(environment = process.env, args = []) {
  if (args.length > 0) {
    if (args.length !== 1 || args[0] !== '--xr-gate') throw new Error('unknown CI input command')
    const { resolveValidationCi } = await import('../node_modules/agentic-os/bin/agentic-os-validation.mjs')
    const inputs = ownerInputs({ contract: await readContract(), environment, gitText: readGitText,
      resolveCi: () => resolveValidationCi(repoRoot, environment), versions: {} })
    console.log(`required=${xrRuntimeGateRequired(inputs, environment.GITHUB_EVENT_NAME)}`)
    console.log(`execute=${xrRuntimeGateExecutionRequired(inputs, environment.GITHUB_EVENT_NAME)}`)
    return
  }
  console.log(`AGENTIC_OS_CI_OWNER_INPUTS=${await ownerInputDigest(environment)}`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.env, process.argv.slice(2))
