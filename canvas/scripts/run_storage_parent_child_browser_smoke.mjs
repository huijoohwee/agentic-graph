import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const script = fileURLToPath(import.meta.url)
process.chdir(resolve(dirname(script), '..'))

if (process.argv.includes('--owned-server')) {
  Object.assign(process.env, {
    VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: '',
    VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN: '', VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED: '0',
    VITE_AGENTIC_OS_GITHUB_WRITE_BASE_URL: '', VITE_WORKSPACE_SEED_SYNC_ENABLED: '0',
    VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: '0',
  })
  await runLocalViteBrowserSmoke({
    logLabel: 'storage-parent-child-browser-smoke',
    devServerPort: String(process.env.AG_STORAGE_RECOVERY_PORT || '4196'),
    baseUrlEnvName: 'AG_STORAGE_RECOVERY_BASE_URL',
    verifierCommand: process.execPath,
    verifierArgs: ['./scripts/verify_storage_parent_child_browser_smoke.mjs'],
    devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid',
  })
} else {
  const child = spawn(process.execPath, [script, '--owned-server'], {
    stdio: 'inherit', detached: process.platform !== 'win32', env: process.env,
  })
  let expired = false, stopped = false, escalation
  const stop = signal => {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); return true } catch (error) {
      if (error.code !== 'ESRCH') throw error
      return false
    }
  }
  const terminate = () => {
    if (stopped) return
    stopped = true
    if (!stop('SIGTERM')) return
    // Keep escalation alive even when the group leader exits before its descendants.
    escalation = setTimeout(() => stop('SIGKILL'), 2000)
  }
  const onSignal = signal => { process.exitCode = signal === 'SIGINT' ? 130 : 143; terminate() }
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal)
  const deadline = setTimeout(() => {
    expired = true
    console.error('Storage recovery browser proof exceeded its 90-second overall deadline')
    terminate()
  }, 90_000)
  try {
    const code = await new Promise((accept, reject) => {
      child.once('error', reject)
      child.once('exit', code => accept(code))
    })
    process.exitCode = expired ? 124 : stopped ? process.exitCode || 1 : code ?? 1
  } finally {
    clearTimeout(deadline)
    terminate()
    if (escalation) await new Promise(accept => setTimeout(accept, 2100))
    process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal)
  }
}
