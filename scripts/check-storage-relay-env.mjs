import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const envPath = path.resolve(
  process.env.AG_STORAGE_RELAY_ENV_FILE
    || path.join(repoRoot, 'cloudflare/workers/agentic-graph-storage/.dev.vars'),
)

const parseEnv = (text) => Object.fromEntries(text
  .split(/\r?\n/u)
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'))
  .map(line => {
    const separator = line.indexOf('=')
    return separator < 1
      ? [line, '']
      : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
  }))

const values = fs.existsSync(envPath)
  ? parseEnv(fs.readFileSync(envPath, 'utf8'))
  : {}
const present = key => Boolean(String(values[key] || '').trim())
const complete = keys => keys.every(present)
const missing = keys => keys.filter(key => !present(key))

const gitKeys = [
  'AGENTIC_OS_STORAGE_GITHUB_TOKEN',
  'AGENTIC_OS_STORAGE_GITHUB_OWNER',
  'AGENTIC_OS_STORAGE_GITHUB_AGENTIC_OS_REPO',
  'AGENTIC_OS_STORAGE_GITHUB_WORKSPACE_REPO',
  'AGENTIC_OS_STORAGE_GITHUB_BRANCH',
]
const googleRefreshKeys = [
  'AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_ID',
  'AGENTIC_OS_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET',
  'AGENTIC_OS_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN',
]
const oneDriveRefreshKeys = [
  'AGENTIC_OS_STORAGE_ONEDRIVE_TENANT_ID',
  'AGENTIC_OS_STORAGE_ONEDRIVE_CLIENT_ID',
  'AGENTIC_OS_STORAGE_ONEDRIVE_CLIENT_SECRET',
  'AGENTIC_OS_STORAGE_ONEDRIVE_REFRESH_TOKEN',
]
const googleCredentialReady = complete(googleRefreshKeys)
  || present('AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN')
const oneDriveCredentialReady = complete(oneDriveRefreshKeys)
  || present('AGENTIC_OS_STORAGE_ONEDRIVE_ACCESS_TOKEN')
const checks = {
  envFilePresent: fs.existsSync(envPath),
  devRelayEnabled: values.AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED === 'true',
  signingSecretReady: String(values.AGENTIC_OS_STORAGE_SIGNING_SECRET || '').length >= 16,
  workspaceReady: present('AGENTIC_OS_STORAGE_REMOTE_RELAY_WORKSPACE_ID'),
  gitReady: complete(gitKeys),
  googleDriveReady: googleCredentialReady
    && present('AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ROOT_ID'),
  oneDriveReady: oneDriveCredentialReady
    && present('AGENTIC_OS_STORAGE_ONEDRIVE_DRIVE_ID')
    && present('AGENTIC_OS_STORAGE_ONEDRIVE_ROOT_ID'),
  obsoleteGitRepoKeyAbsent: !present('AGENTIC_OS_STORAGE_GITHUB_REPO'),
}
const missingKeys = [
  ...missing([
    'AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED',
    'AGENTIC_OS_STORAGE_SIGNING_SECRET',
    'AGENTIC_OS_STORAGE_REMOTE_RELAY_WORKSPACE_ID',
    ...gitKeys,
  ]),
  ...(!googleCredentialReady ? missing(googleRefreshKeys) : []),
  ...missing(['AGENTIC_OS_STORAGE_GOOGLE_DRIVE_ROOT_ID']),
  ...(!oneDriveCredentialReady ? missing(oneDriveRefreshKeys) : []),
  ...missing([
    'AGENTIC_OS_STORAGE_ONEDRIVE_DRIVE_ID',
    'AGENTIC_OS_STORAGE_ONEDRIVE_ROOT_ID',
  ]),
]
const ok = Object.values(checks).every(Boolean)
console.log(JSON.stringify({
  schema: 'agentic-graph-storage-relay-env-check/v1',
  ok,
  envPath,
  checks,
  missingKeys: [...new Set(missingKeys)].sort(),
}, null, 2))
if (!ok) process.exitCode = 1
