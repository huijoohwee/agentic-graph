import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  readContract,
  repoRoot,
  resolveCiCommandTimeoutMs,
  selectAffectedCommands,
} from './collaboration-contract.mjs'

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
} = {}) => {
  const paths = new Set()
  const githubBaseRef = String(environment.GITHUB_BASE_REF || '').trim()
  const canonicalBaseRef = String(environment.AGENTICGRAPH_PR_BASE_REF || '').trim()
  if (githubBaseRef && canonicalBaseRef && githubBaseRef !== canonicalBaseRef) {
    throw new Error('GitHub base ref conflicts with the canonical AgenticGraph pull request base ref')
  }
  const protectedRefreshBaseRef = environment.GITHUB_ACTIONS === 'true'
    && environment.GITHUB_EVENT_NAME === 'workflow_dispatch'
    ? canonicalBaseRef
    : ''
  const baseRef = githubBaseRef || protectedRefreshBaseRef
  const before = String(environment.GITHUB_EVENT_BEFORE || '').trim()

  if (baseRef) addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', `origin/${baseRef}...HEAD`]))
  else if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', `${before}...HEAD`]))
  } else if (environment.GITHUB_ACTIONS === 'true') {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', 'HEAD^...HEAD']))
  } else {
    addGitPaths(paths, gitText(['diff', '--no-renames', '--name-only', '-z', 'HEAD']))
    addGitPaths(paths, gitText(['ls-files', '-z', '--others', '--exclude-standard']))
  }

  return [...paths].sort()
}

const runCommand = (command, timeoutMs) => new Promise((resolve, reject) => {
  const [executable, ...args] = command
  const child = spawn(executable, args, { cwd: repoRoot, env: process.env, stdio: 'inherit' })
  let timedOut = false
  let forceKillTimer
  const timeout = setTimeout(() => {
    timedOut = true
    console.error(`[agenticgraph] affected check exceeded ${timeoutMs}ms: ${command.join(' ')}`)
    child.kill('SIGTERM')
    forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  }, timeoutMs)
  child.on('error', reject)
  child.on('close', code => {
    clearTimeout(timeout)
    clearTimeout(forceKillTimer)
    if (code === 0 && !timedOut) resolve()
    else reject(new Error(`${command.join(' ')} ${timedOut ? 'timed out' : `exited with ${code ?? 1}`}`))
  })
})

export const main = async () => {
  const contract = await readContract()
  const changedPaths = readChangedPaths()
  const plan = selectAffectedCommands(changedPaths, contract)

  console.log(`[agenticgraph] affected paths: ${changedPaths.length}`)
  console.log(`[agenticgraph] affected scopes: ${plan.scopes.join(', ') || 'none'}`)
  if (plan.unmatchedPaths.length > 0) {
    console.log(`[agenticgraph] fallback paths: ${plan.unmatchedPaths.join(', ')}`)
  }

  for (const command of plan.commands) {
    console.log(`[agenticgraph] running affected check: ${command.join(' ')}`)
    await runCommand(command, resolveCiCommandTimeoutMs(command, contract))
  }
  console.log('[agenticgraph] affected CI checks passed')
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) await main()
