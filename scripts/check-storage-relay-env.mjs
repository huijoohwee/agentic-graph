import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const envPath = path.resolve(
  process.env.AG_STORAGE_RELAY_ENV_FILE
    || path.join(repoRoot, 'cloudflare/workers/agenticgraph-storage/.dev.vars'),
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
  'AGENTICGRAPH_STORAGE_GITHUB_TOKEN',
  'AGENTICGRAPH_STORAGE_GITHUB_OWNER',
  'AGENTICGRAPH_STORAGE_GITHUB_AGENTICGRAPH_REPO',
  'AGENTICGRAPH_STORAGE_GITHUB_WORKSPACE_REPO',
  'AGENTICGRAPH_STORAGE_GITHUB_BRANCH',
]
const googleRefreshKeys = [
  'AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_CLIENT_ID',
  'AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET',
  'AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN',
]
const oneDriveRefreshKeys = [
  'AGENTICGRAPH_STORAGE_ONEDRIVE_TENANT_ID',
  'AGENTICGRAPH_STORAGE_ONEDRIVE_CLIENT_ID',
  'AGENTICGRAPH_STORAGE_ONEDRIVE_CLIENT_SECRET',
  'AGENTICGRAPH_STORAGE_ONEDRIVE_REFRESH_TOKEN',
]
const googleCredentialReady = complete(googleRefreshKeys)
  || present('AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN')
const oneDriveCredentialReady = complete(oneDriveRefreshKeys)
  || present('AGENTICGRAPH_STORAGE_ONEDRIVE_ACCESS_TOKEN')
const checks = {
  envFilePresent: fs.existsSync(envPath),
  devRelayEnabled: values.AGENTICGRAPH_STORAGE_DEV_REMOTE_RELAY_ENABLED === 'true',
  signingSecretReady: String(values.AGENTICGRAPH_STORAGE_SIGNING_SECRET || '').length >= 16,
  workspaceReady: present('AGENTICGRAPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID'),
  gitReady: complete(gitKeys),
  googleDriveReady: googleCredentialReady
    && present('AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_ROOT_ID'),
  oneDriveReady: oneDriveCredentialReady
    && present('AGENTICGRAPH_STORAGE_ONEDRIVE_DRIVE_ID')
    && present('AGENTICGRAPH_STORAGE_ONEDRIVE_ROOT_ID'),
  obsoleteGitRepoKeyAbsent: !present('AGENTICGRAPH_STORAGE_GITHUB_REPO'),
}
const missingKeys = [
  ...missing([
    'AGENTICGRAPH_STORAGE_DEV_REMOTE_RELAY_ENABLED',
    'AGENTICGRAPH_STORAGE_SIGNING_SECRET',
    'AGENTICGRAPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID',
    ...gitKeys,
  ]),
  ...(!googleCredentialReady ? missing(googleRefreshKeys) : []),
  ...missing(['AGENTICGRAPH_STORAGE_GOOGLE_DRIVE_ROOT_ID']),
  ...(!oneDriveCredentialReady ? missing(oneDriveRefreshKeys) : []),
  ...missing([
    'AGENTICGRAPH_STORAGE_ONEDRIVE_DRIVE_ID',
    'AGENTICGRAPH_STORAGE_ONEDRIVE_ROOT_ID',
  ]),
]
const ok = Object.values(checks).every(Boolean)
console.log(JSON.stringify({
  schema: 'agenticgraph-storage-relay-env-check/v1',
  ok,
  envPath,
  checks,
  missingKeys: [...new Set(missingKeys)].sort(),
}, null, 2))
if (!ok) process.exitCode = 1
