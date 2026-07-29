import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
const envPath = path.resolve(
  process.env.KG_STORAGE_RELAY_ENV_FILE
    || path.join(repoRoot, 'cloudflare/workers/knowgrph-storage/.dev.vars'),
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
  'KNOWGRPH_STORAGE_GITHUB_TOKEN',
  'KNOWGRPH_STORAGE_GITHUB_OWNER',
  'KNOWGRPH_STORAGE_GITHUB_KNOWGRPH_REPO',
  'KNOWGRPH_STORAGE_GITHUB_WORKSPACE_REPO',
  'KNOWGRPH_STORAGE_GITHUB_BRANCH',
]
const googleRefreshKeys = [
  'KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_ID',
  'KNOWGRPH_STORAGE_GOOGLE_DRIVE_CLIENT_SECRET',
  'KNOWGRPH_STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN',
]
const oneDriveRefreshKeys = [
  'KNOWGRPH_STORAGE_ONEDRIVE_TENANT_ID',
  'KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_ID',
  'KNOWGRPH_STORAGE_ONEDRIVE_CLIENT_SECRET',
  'KNOWGRPH_STORAGE_ONEDRIVE_REFRESH_TOKEN',
]
const googleCredentialReady = complete(googleRefreshKeys)
  || present('KNOWGRPH_STORAGE_GOOGLE_DRIVE_ACCESS_TOKEN')
const oneDriveCredentialReady = complete(oneDriveRefreshKeys)
  || present('KNOWGRPH_STORAGE_ONEDRIVE_ACCESS_TOKEN')
const checks = {
  envFilePresent: fs.existsSync(envPath),
  devRelayEnabled: values.KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED === 'true',
  signingSecretReady: String(values.KNOWGRPH_STORAGE_SIGNING_SECRET || '').length >= 16,
  workspaceReady: present('KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID'),
  gitReady: complete(gitKeys),
  googleDriveReady: googleCredentialReady
    && present('KNOWGRPH_STORAGE_GOOGLE_DRIVE_ROOT_ID'),
  oneDriveReady: oneDriveCredentialReady
    && present('KNOWGRPH_STORAGE_ONEDRIVE_DRIVE_ID')
    && present('KNOWGRPH_STORAGE_ONEDRIVE_ROOT_ID'),
  obsoleteGitRepoKeyAbsent: !present('KNOWGRPH_STORAGE_GITHUB_REPO'),
}
const missingKeys = [
  ...missing([
    'KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED',
    'KNOWGRPH_STORAGE_SIGNING_SECRET',
    'KNOWGRPH_STORAGE_REMOTE_RELAY_WORKSPACE_ID',
    ...gitKeys,
  ]),
  ...(!googleCredentialReady ? missing(googleRefreshKeys) : []),
  ...missing(['KNOWGRPH_STORAGE_GOOGLE_DRIVE_ROOT_ID']),
  ...(!oneDriveCredentialReady ? missing(oneDriveRefreshKeys) : []),
  ...missing([
    'KNOWGRPH_STORAGE_ONEDRIVE_DRIVE_ID',
    'KNOWGRPH_STORAGE_ONEDRIVE_ROOT_ID',
  ]),
]
const ok = Object.values(checks).every(Boolean)
console.log(JSON.stringify({
  schema: 'knowgrph-storage-relay-env-check/v1',
  ok,
  envPath,
  checks,
  missingKeys: [...new Set(missingKeys)].sort(),
}, null, 2))
if (!ok) process.exitCode = 1
