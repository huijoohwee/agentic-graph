import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const canvasRoot = resolve(scriptDirectory, '..')
const repositoryRoot = resolve(scriptDirectory, '../..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function readGitText(args) {
  return String(execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }) || '').trim()
}

function prepareExactCandidate(expectedHead, expectedBranch) {
  execFileSync(npmCommand, ['run', 'predev'], {
    cwd: canvasRoot,
    env: process.env,
    stdio: 'inherit',
  })
  const preparedHead = readGitText(['rev-parse', 'HEAD'])
  const preparedBranch = readGitText(['branch', '--show-current']) || 'detached'
  const preparedStatus = readGitText(['status', '--porcelain', '--untracked-files=all'])
  if (
    preparedHead !== expectedHead
    || preparedBranch !== expectedBranch
    || preparedStatus
  ) {
    throw new Error(
      'Chat natural-language browser proof preparation changed the exact candidate '
      + `(head=${preparedHead}, branch=${preparedBranch}, dirty=${Boolean(preparedStatus)})`,
    )
  }
}

async function run() {
  const candidateStatus = readGitText(['status', '--porcelain', '--untracked-files=all'])
  if (candidateStatus) {
    throw new Error('Chat natural-language browser proof requires a clean exact-HEAD worktree')
  }
  const candidateHead = readGitText(['rev-parse', 'HEAD'])
  const candidateBranch = readGitText(['branch', '--show-current']) || 'detached'
  const isolatedWorkspaceRoot = await mkdtemp(join(tmpdir(), 'knowgrph-chat-natural-language-smoke-'))
  const isolatedDocsRoot = join(isolatedWorkspaceRoot, 'docs')
  const isolatedChatLogRoot = join(isolatedWorkspaceRoot, 'chat-log')
  await Promise.all([
    mkdir(isolatedDocsRoot, { recursive: true }),
    mkdir(isolatedChatLogRoot, { recursive: true }),
  ])

  process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = isolatedDocsRoot
  process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = isolatedChatLogRoot
  process.env.VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED = '0'
  process.env.VITE_WORKSPACE_SEED_SYNC_ENABLED = '0'
  process.env.VITE_KNOWGRPH_GITHUB_WRITE_ENABLED = '0'
  process.env.VITE_KNOWGRPH_GITHUB_WRITE_BASE_URL = ''
  process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = ''
  process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = ''
  process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = ''
  process.env.KNOWGRPH_CHAT_PROXY_ALLOWED_HOSTS = 'localhost,127.0.0.1,0.0.0.0'
  process.env.KNOWGRPH_SOURCE_REVISION = candidateHead
  process.env.KG_CHAT_NATURAL_LANGUAGE_EXPECTED_HEAD = candidateHead
  process.env.KG_CHAT_NATURAL_LANGUAGE_EXPECTED_BRANCH = candidateBranch
  delete process.env.VITE_KNOWGRPH_RUN_READY_DEMO
  delete process.env.VITE_KNOWGRPH_RUN_READY_REPO_LOCAL

  try {
    prepareExactCandidate(candidateHead, candidateBranch)
    await runLocalViteBrowserSmoke({
      logLabel: 'chat-natural-language-invocation-browser-smoke',
      devServerPort: String(process.env.KG_CHAT_NATURAL_LANGUAGE_SMOKE_PORT || '4187'),
      devServerPath: '/',
      baseUrlEnvName: 'KG_CHAT_NATURAL_LANGUAGE_SMOKE_BASE_URL',
      verifierCommand: process.execPath,
      verifierArgs: ['scripts/verify_chat_natural_language_invocation_browser_smoke.mjs'],
      verifierFailureLabel: 'Chat natural-language invocation browser smoke',
      prepareBeforeStart: false,
      devServerStartMode: 'vite-runner',
      existingServerPolicy: 'forbid',
    })
  } finally {
    await rm(isolatedWorkspaceRoot, { recursive: true, force: true })
  }
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
