import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const CHAT_PROXY_SERVER_ENV_KEYS = new Set([
  'KNOWGRPH_CHAT_PROXY_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'KNOWGRPH_CHAT_PROXY_MIROMIND_API_KEY',
  'MIROMIND_API_KEY',
  'KNOWGRPH_CHAT_PROXY_AGNES_API_KEY',
  'AGNES_API_KEY',
  'KNOWGRPH_CHAT_PROXY_SEALION_API_KEY',
  'KNOWGRPH_CHAT_PROXY_QWEN_API_KEY',
  'DASHSCOPE_API_KEY',
  'QWEN_API_KEY',
  'KNOWGRPH_CHAT_PROXY_GOOGLE_CLOUD_ACCESS_TOKEN',
  'GOOGLE_CLOUD_ACCESS_TOKEN',
  'VERTEX_AI_ACCESS_TOKEN',
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'KNOWGRPH_CHAT_PROXY_GEMINI_API_KEY',
  'KNOWGRPH_CHAT_PROXY_BYTEPLUS_API_KEY',
])

const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/

export const resolveViteRuntimeIdentity = (repoRoot: string): { branch: string, device: string, sourceRevision: string } => {
  const readGitText = (args: string[]): string => String(execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }) || '').trim()
  const configuredRevision = String(process.env.KNOWGRPH_SOURCE_REVISION || '').trim()
  const sourceRevision = configuredRevision || readGitText(['rev-parse', 'HEAD'])
  if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) throw new Error('Knowgrph runtime requires an exact 40-character source revision SHA')
  const branch = readGitText(['branch', '--show-current']) || 'detached'
  const branchDevice = /^agent\/([^/]+)\//.exec(branch)?.[1] || ''
  const device = String(process.env.KNOWGRPH_RUNTIME_DEVICE || '').trim() || branchDevice || (branch === 'main' ? 'production' : 'unknown-device')
  return { branch, device, sourceRevision }
}

const stripEnvQuotes = (value: string): string => {
  const raw = String(value || '').trim()
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1)
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1)
  return raw
}

const readServerManagedEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) return {}
  const out: Record<string, string> = {}
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const assignment = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed
    const eqIndex = assignment.indexOf('=')
    if (eqIndex <= 0) continue
    const key = assignment.slice(0, eqIndex).trim()
    if (!CHAT_PROXY_SERVER_ENV_KEYS.has(key)) continue
    const value = stripEnvQuotes(assignment.slice(eqIndex + 1))
    if (value) out[key] = value
  }
  return out
}

export const loadChatProxyServerManagedEnv = (args: {
  repoRoot: string
  canvasRoot: string
}): void => {
  const merged: Record<string, string> = {}
  for (const filePath of [
    path.resolve(args.repoRoot, '.env'),
    path.resolve(args.repoRoot, '.env.local'),
    path.resolve(args.canvasRoot, '.env'),
    path.resolve(args.canvasRoot, '.env.local'),
  ]) {
    Object.assign(merged, readServerManagedEnvFile(filePath))
  }
  for (const [key, value] of Object.entries(merged)) {
    if (String(process.env[key] || '').trim()) continue
    process.env[key] = value
  }
}
