import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import {
  readContract,
  repoRoot,
  resolveCiCommandTimeoutMs,
  selectAffectedCommands,
} from './collaboration-contract.mjs'

const runGit = args => {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

const addLines = (set, value) => {
  for (const line of String(value || '').split('\n')) {
    const rel = line.trim()
    if (rel) set.add(rel)
  }
}

export const readChangedPaths = () => {
  const paths = new Set()
  const baseRef = String(process.env.GITHUB_BASE_REF || '').trim()
  const before = String(process.env.GITHUB_EVENT_BEFORE || '').trim()

  if (baseRef) addLines(paths, runGit(['diff', '--name-only', '--diff-filter=ACMR', `origin/${baseRef}...HEAD`]))
  else if (/^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before)) {
    addLines(paths, runGit(['diff', '--name-only', '--diff-filter=ACMR', `${before}...HEAD`]))
  } else if (process.env.GITHUB_ACTIONS === 'true') {
    addLines(paths, runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD^...HEAD']))
  } else {
    addLines(paths, runGit(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']))
    addLines(paths, runGit(['ls-files', '--others', '--exclude-standard']))
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

const main = async () => {
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

await main()
