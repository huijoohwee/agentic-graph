#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { encodePublishedDocShareToken } from '../canvas/src/features/canvas/canvasDocShareToken.mjs'

const API_VERSION = '2026-05-04'
const DEFAULT_BASE_URL = 'https://airvio.co'
const DEFAULT_WORKSPACE_ID = 'kgws:e2e-github-canonical'
const DEFAULT_DEVICE_ID = 'e2e:github-canonical-storage'
const DEFAULT_REPOSITORY = 'huijoohwee/huijoohwee'
const DEFAULT_BRANCH = 'main'

const args = process.argv.slice(2)

const readArgValue = (name, fallback = '') => {
  const index = args.indexOf(name)
  if (index >= 0 && typeof args[index + 1] === 'string') return args[index + 1]
  const prefix = `${name}=`
  const match = args.find(arg => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

const hasFlag = (name) => args.includes(name)
const normalizeString = (value) => String(value || '').trim()
const contentHash = (text) => createHash('sha256').update(String(text || '')).digest('hex')
const encodePath = (value) => String(value || '').split('/').map(part => encodeURIComponent(part)).join('/')
const buildUrl = (baseUrl, path) => new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()

const options = {
  baseUrl: normalizeString(readArgValue('--base-url', process.env.AGENTICGRAPH_E2E_BASE_URL || DEFAULT_BASE_URL)).replace(/\/+$/, ''),
  branch: normalizeString(readArgValue('--branch', process.env.AGENTICGRAPH_E2E_GITHUB_BRANCH || DEFAULT_BRANCH)),
  deviceId: normalizeString(readArgValue('--device-id', process.env.AGENTICGRAPH_E2E_DEVICE_ID || DEFAULT_DEVICE_ID)),
  json: hasFlag('--json'),
  repository: normalizeString(readArgValue('--repository', process.env.AGENTICGRAPH_E2E_GITHUB_REPOSITORY || DEFAULT_REPOSITORY)),
  session: normalizeString(readArgValue('--session', '')),
  workspaceId: normalizeString(readArgValue('--workspace-id', process.env.AGENTICGRAPH_E2E_WORKSPACE_ID || DEFAULT_WORKSPACE_ID)),
}

const assertOk = (condition, message) => {
  if (!condition) throw new Error(message)
}

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'agenticgraph-github-canonical-storage-e2e',
      ...(init.headers || {}),
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  return { response, body, text }
}

const fetchText = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'agenticgraph-github-canonical-storage-e2e',
      ...(init.headers || {}),
    },
  })
  return { response, text: await response.text() }
}

const buildDocumentMutation = ({ workspaceId, canonicalPath, content, nowMs }) => {
  const hash = contentHash(content)
  const documentId = `github-cache:${contentHash(canonicalPath).slice(0, 24)}`
  return {
    mutationId: `e2e:${nowMs}:${hash.slice(0, 12)}`,
    workspaceId,
    entity: 'document',
    op: 'upsert',
    recordId: documentId,
    baseRevision: null,
    record: {
      id: documentId,
      workspaceId,
      canonicalPath,
      title: canonicalPath.split('/').filter(Boolean).slice(-1)[0] || 'kgc.md',
      docType: 'markdown',
      lang: null,
      graphId: `github-cache-graph:${contentHash(canonicalPath).slice(0, 24)}`,
      sourceKind: 'markdown',
      contentMd: content,
      contentHash: hash,
      parserVersion: 'github-canonical-storage-e2e:v1',
      revision: nowMs,
      updatedAtMs: nowMs,
      deleted: false,
    },
  }
}

const decodeGitHubContentsPayload = (payload) => {
  const encoded = normalizeString(payload?.content).replace(/\s+/g, '')
  assertOk(payload?.encoding === 'base64' && encoded, `GitHub contents payload did not include base64 content: ${JSON.stringify(payload).slice(0, 300)}`)
  return Buffer.from(encoded, 'base64').toString('utf8')
}

const runProd = async () => {
  const stamp = options.session || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const session = stamp.startsWith('e2e-') ? stamp : `e2e-github-canonical-${stamp}`
  const workspacePath = `chat-log/${session}/kgc_${session}.md`
  const canonicalPath = workspacePath
  const nowIso = new Date().toISOString()
  const content = [
    '# AgenticGraph GitHub Canonical Storage E2E',
    '',
    `session: ${session}`,
    `timestamp: ${nowIso}`,
    'canonical_store: GitHub',
    'cloudflare_role: read/share/cache',
    '',
  ].join('\n')

  const githubWriteUrl = buildUrl(options.baseUrl, '/agenticgraph/api/workspace/github/write')
  const githubWrite = await fetchJson(githubWriteUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      files: [{ workspacePath, text: content }],
      message: `agenticgraph: github canonical storage e2e ${session}`.slice(0, 150),
    }),
  })
  assertOk(githubWrite.response.ok && githubWrite.body?.ok === true && githubWrite.body?.status === 'applied', `GitHub canonical write failed (${githubWrite.response.status}): ${JSON.stringify(githubWrite.body)}`)
  const writtenFile = githubWrite.body.files?.[0] || {}
  assertOk(writtenFile.repositoryPath === canonicalPath, `GitHub write returned wrong repository path: ${JSON.stringify(writtenFile)}`)

  const [owner, repo] = options.repository.split('/')
  assertOk(owner && repo, `Repository must be owner/name, got ${options.repository}`)
  const githubContentsUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(canonicalPath)}?ref=${encodeURIComponent(options.branch)}`
  const githubContents = await fetchJson(githubContentsUrl, {
    headers: { accept: 'application/vnd.github+json' },
  })
  assertOk(githubContents.response.ok, `GitHub contents read failed (${githubContents.response.status}): ${JSON.stringify(githubContents.body)}`)
  const githubContent = decodeGitHubContentsPayload(githubContents.body)
  assertOk(githubContent === content, 'GitHub canonical content did not match the written content')

  const nowMs = Date.now()
  const pushUrl = buildUrl(options.baseUrl, '/api/storage/push')
  const cachePush = await fetchJson(pushUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      apiVersion: API_VERSION,
      workspaceId: options.workspaceId,
      deviceId: options.deviceId,
      mutations: [buildDocumentMutation({
        workspaceId: options.workspaceId,
        canonicalPath,
        content,
        nowMs,
      })],
    }),
  })
  assertOk(cachePush.response.ok && cachePush.body?.ok === true, `Cloudflare cache push failed (${cachePush.response.status}): ${JSON.stringify(cachePush.body)}`)
  const ack = cachePush.body.acknowledgements?.[0]
  assertOk(ack?.status === 'applied', `Cloudflare cache push was not applied: ${JSON.stringify(cachePush.body)}`)

  const docUrl = buildUrl(options.baseUrl, `/api/storage/doc/${encodeURIComponent(options.workspaceId)}/${encodeURIComponent(canonicalPath)}`)
  const cacheRead = await fetchText(docUrl, { headers: { accept: 'text/markdown' } })
  assertOk(cacheRead.response.ok && cacheRead.text === content, `Cloudflare cache doc read mismatch (${cacheRead.response.status}): ${cacheRead.text.slice(0, 300)}`)

  const pullUrl = buildUrl(options.baseUrl, '/api/storage/pull')
  const cachePull = await fetchJson(pullUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      apiVersion: API_VERSION,
      workspaceId: options.workspaceId,
      deviceId: `${options.deviceId}:reader`,
      since: null,
    }),
  })
  const pulledDocument = Array.isArray(cachePull.body?.changes?.documents)
    ? cachePull.body.changes.documents.find((document) => document?.canonicalPath === canonicalPath)
    : null
  assertOk(cachePull.response.ok && pulledDocument?.contentMd === content, `Cloudflare pull sync did not return cached canonical content: ${JSON.stringify(cachePull.body).slice(0, 500)}`)

  const shareToken = encodePublishedDocShareToken({
    workspaceId: options.workspaceId,
    canonicalPath,
  })
  assertOk(shareToken, 'Could not encode share token for cached document')
  const shareUrl = buildUrl(options.baseUrl, `/agenticgraph/share/${encodeURIComponent(shareToken)}`)
  const shareRead = await fetchText(shareUrl, { headers: { accept: 'text/markdown' } })
  assertOk(shareRead.response.ok && shareRead.text.trim() === content.trim(), `Cloudflare share read mismatch (${shareRead.response.status}): ${shareRead.text.slice(0, 300)}`)

  return {
    ok: true,
    mode: 'prod',
    canonicalStore: 'github',
    cloudflareRole: 'read/share/cache',
    repository: options.repository,
    branch: options.branch,
    workspaceId: options.workspaceId,
    workspacePath,
    canonicalPath,
    github: {
      commitSha: writtenFile.commitSha,
      contentSha: writtenFile.contentSha,
      htmlUrl: writtenFile.htmlUrl,
      contentsUrl: githubContentsUrl,
    },
    cloudflare: {
      pushAckCursor: cachePush.body.ackCursor,
      docUrl,
      pullCursor: cachePull.body.nextCursor,
      shareUrl,
    },
  }
}

try {
  const result = await runProd()
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`[agenticgraph] prod E2E ok: GitHub canonical ${result.github.htmlUrl}`)
    console.log(`[agenticgraph] Cloudflare cache doc: ${result.cloudflare.docUrl}`)
    console.log(`[agenticgraph] Cloudflare share URL: ${result.cloudflare.shareUrl}`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error')
  if (options.json) console.log(JSON.stringify({ ok: false, error: message }, null, 2))
  else console.error(`[agenticgraph] github canonical storage E2E failed: ${message}`)
  process.exit(1)
}
