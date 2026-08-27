import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const hooksDir = path.resolve(repoRoot, '.githooks')
const prePushHook = path.resolve(hooksDir, 'pre-push')

const runGit = args => new Promise((resolve, reject) => {
  const child = spawn('git', args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'pipe',
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk.toString()
  })
  child.stderr.on('data', chunk => {
    stderr += chunk.toString()
  })
  child.on('error', reject)
  child.on('close', code => resolve({
    code: code ?? 1,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  }))
})

const main = async () => {
  try {
    await fs.access(prePushHook)
  } catch {
    console.log('[agenticgraph] git hooks install skipped: `.githooks/pre-push` not found')
    return
  }

  try {
    const insideWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'])
    if (insideWorkTree.code !== 0 || insideWorkTree.stdout !== 'true') {
      console.log('[agenticgraph] git hooks install skipped: repository not available')
      return
    }
  } catch {
    console.log('[agenticgraph] git hooks install skipped: git is unavailable')
    return
  }

  await fs.chmod(prePushHook, 0o755)

  const setHooksPath = await runGit(['config', '--local', 'core.hooksPath', '.githooks'])
  if (setHooksPath.code !== 0) {
    throw new Error(setHooksPath.stderr || 'failed to set core.hooksPath')
  }

  console.log('[agenticgraph] installed local git hooks via core.hooksPath=.githooks')
}

await main()
