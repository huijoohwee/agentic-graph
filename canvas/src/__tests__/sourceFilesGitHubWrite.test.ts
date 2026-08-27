import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { publishGeneratedWorkspacePathsToGitHub } from '@/features/source-files/sourceFilesGitHubWrite'
import { promoteGeneratedChatWorkspacePaths, retryGeneratedChatWorkspaceArtifactPromotion } from '@/features/chat/floatingPanelChat/chatWorkspaceArtifactPromotion'
import { buildAgenticGraphStorageDocPath } from '@/lib/storage/agenticgraphStorageSyncContract'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agenticgraphStorageDb'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import storageWorker from '../../../cloudflare/workers/agenticgraph-storage/index.ts'
import { onRequest } from '../../../cloudflare/pages/agenticgraph-agent-ready.mjs'

const readStorageWorker = (): { fetch: (request: Request, env: never) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: never) => Promise<Response>
    default?: { fetch?: (request: Request, env: never) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

export async function testGeneratedChatLogWorkspacePathsPublishToGitHubEndpoint() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  try {
    resetWorkspaceFsForTests()
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: '20260606T010203Z' })
    const workspacePath = await fs.createFile({
      parentPath: '/chat-log/20260606T010203Z',
      name: 'kgc_20260606T010203Z.md',
      text: '# Generated KGC\n\nGitHub first.',
    })

    let requestUrl = ''
    let requestInit: RequestInit | undefined
    const result = await publishGeneratedWorkspacePathsToGitHub({
      paths: [workspacePath],
      baseUrl: 'https://airvio.example',
      fetchImpl: async (input, init) => {
        requestUrl = String(input)
        requestInit = init
        return new Response(JSON.stringify({
          ok: true,
          status: 'applied',
          files: [{
            workspacePath,
            repositoryPath: workspacePath.replace(/^\/+/, ''),
            action: 'created',
            commitSha: 'commit-1',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    if (result.status !== 'applied' || result.files[0]?.workspacePath !== workspacePath) {
      throw new Error(`expected generated chat artifact to publish to GitHub, got ${JSON.stringify(result)}`)
    }
    if (requestUrl !== 'https://airvio.example/agenticgraph/api/workspace/github/write') {
      throw new Error(`expected publish endpoint under /agenticgraph, got ${requestUrl}`)
    }
    const body = JSON.parse(String(requestInit?.body || '{}'))
    if (
      body.files?.[0]?.workspacePath !== workspacePath ||
      body.files?.[0]?.text !== '# Generated KGC\n\nGitHub first.' ||
      body.message !== 'AgenticGraph chat artifacts 20260606T010203Z'
    ) {
      throw new Error(`expected GitHub publish body to carry workspace text, got ${JSON.stringify(body)}`)
    }
  } finally {
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testGeneratedChatLogGitHubPublishSkipsWhenDisabled() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  let fetched = false
  try {
    const result = await publishGeneratedWorkspacePathsToGitHub({
      paths: ['/chat-log/20260606T010203Z/kgc_20260606T010203Z.md'],
      fetchImpl: async () => {
        fetched = true
        return new Response('{}', { status: 200 })
      },
    })
    if (fetched || result.status !== 'skipped' || result.reason !== 'disabled') {
      throw new Error(`expected disabled GitHub publish to skip fetch, got fetched=${fetched} result=${JSON.stringify(result)}`)
    }
  } finally {
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testPagesGitHubWorkspaceWriteRouteWritesChatLogFile() {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; method: string; body: string; userAgent: string }> = []
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method || 'GET').toUpperCase()
      const body = String(init?.body || '')
      const headers = new Headers(init?.headers as HeadersInit | undefined)
      calls.push({ url, method, body, userAgent: headers.get('user-agent') || '' })
      if (method === 'GET') {
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (method !== 'PUT') throw new Error(`unexpected GitHub method ${method}`)
      const payload = JSON.parse(body)
      const decoded = Buffer.from(String(payload.content || ''), 'base64').toString('utf8')
      if (payload.branch !== 'main' || decoded !== '# Generated KGC\n') {
        throw new Error(`expected GitHub contents PUT to include branch and base64 text, got ${body}`)
      }
      return new Response(JSON.stringify({
        content: {
          sha: 'content-sha-1',
          html_url: 'https://github.com/owner/repo/blob/main/chat-log/20260606T010203Z/kgc_20260606T010203Z.md',
        },
        commit: { sha: 'commit-sha-1' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const response = await onRequest({
      request: new Request('https://airvio.example/agenticgraph/api/workspace/github/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: [{
            workspacePath: '/chat-log/20260606T010203Z/kgc_20260606T010203Z.md',
            text: '# Generated KGC\n',
          }],
          message: 'AgenticGraph chat artifacts 20260606T010203Z',
        }),
      }),
      env: {
        AGENTICGRAPH_GITHUB_WRITE_REPOSITORY: 'owner/repo',
        AGENTICGRAPH_GITHUB_WRITE_BRANCH: 'main',
        AGENTICGRAPH_GITHUB_WRITE_TOKEN: 'token-redacted',
      },
      next: async () => new Response('next'),
    } as never)
    const body = await response.json() as {
      ok?: boolean
      status?: string
      repository?: string
      files?: Array<{ repositoryPath?: string; action?: string; commitSha?: string }>
    }
    if (!response.ok || body.ok !== true || body.status !== 'applied') {
      throw new Error(`expected Pages GitHub write route to apply, got status=${response.status} body=${JSON.stringify(body)}`)
    }
    if (body.repository !== 'owner/repo' || body.files?.[0]?.repositoryPath !== 'chat-log/20260606T010203Z/kgc_20260606T010203Z.md') {
      throw new Error(`expected route response to report repository path without token leakage, got ${JSON.stringify(body)}`)
    }
    if (String(JSON.stringify(body)).includes('token-redacted')) {
      throw new Error('expected route response to avoid leaking the GitHub token')
    }
    if (calls.map(call => call.method).join(',') !== 'GET,PUT') {
      throw new Error(`expected GitHub contents route to read sha then put, got ${JSON.stringify(calls)}`)
    }
    if (calls.some(call => call.userAgent !== 'agenticgraph-cloudflare-pages')) {
      throw new Error(`expected GitHub API calls to include stable User-Agent, got ${JSON.stringify(calls)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testGeneratedChatPromotionWritesGitHubBeforeCloudflareCache() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:dev-github-canonical-e2e'
  const workspacePath = '/chat-log/dev-canonical-e2e/kgc_dev-canonical-e2e.md'
  const content = '# Dev canonical E2E\n\nGitHub owns writes; Cloudflare caches reads.'
  const events: string[] = []
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'dev-canonical-e2e' })
    await fs.createFile({
      parentPath: '/chat-log/dev-canonical-e2e',
      name: 'kgc_dev-canonical-e2e.md',
      text: content,
    })

    const result = await promoteGeneratedChatWorkspacePaths([workspacePath], {
      githubEnabled: true,
      githubBaseUrl: 'https://pages.example',
      githubFetchImpl: async (_input, init) => {
        events.push('github:write')
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.files?.[0]?.workspacePath !== workspacePath || body.files?.[0]?.text !== content) {
          throw new Error(`expected GitHub write to receive canonical workspace content, got ${JSON.stringify(body)}`)
        }
        return new Response(JSON.stringify({
          ok: true,
          status: 'applied',
          repository: 'owner/repo',
          branch: 'main',
          files: [{
            workspacePath,
            repositoryPath: workspacePath.replace(/^\/+/, ''),
            action: 'created',
            commitSha: 'commit-dev-e2e',
          }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      storageWorkspaceId: workspaceId,
      storageSyncNow: true,
      storageBaseUrl: 'https://storage.example',
      storageDeviceId: 'dev-github-canonical-e2e',
      storageFetchImpl: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input || '')
        events.push(`storage:${new URL(url, 'https://storage.example').pathname}`)
        const request = input instanceof Request
          ? input
          : new Request(url.startsWith('/api/storage/') ? `https://storage.example${url}` : url, init)
        return readStorageWorker().fetch(request, env as never)
      },
    })

    if (result.githubStatus !== 'applied' || result.storageStatus !== 'applied') {
      throw new Error(`expected GitHub write and Cloudflare cache to apply, got ${JSON.stringify(result)}`)
    }
    const firstStorageEventIndex = events.findIndex(event => event.startsWith('storage:'))
    if (events[0] !== 'github:write' || firstStorageEventIndex <= 0) {
      throw new Error(`expected GitHub write before Cloudflare cache, got ${events.join(',')}`)
    }
    const response = await readStorageWorker().fetch(
      new Request(`https://storage.example${buildAgenticGraphStorageDocPath(workspaceId, workspacePath.replace(/^\/+/, ''))}`),
      env as never,
    )
    const cached = await response.text()
    if (!response.ok || cached !== content) {
      throw new Error(`expected Cloudflare cache read to match canonical GitHub content, got status=${response.status} body=${cached}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testGeneratedChatPromotionSkipsCloudflareCacheWhenGitHubFails() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const workspacePath = '/chat-log/dev-canonical-fail/kgc_dev-canonical-fail.md'
  let storageCalled = false
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'dev-canonical-fail' })
    await fs.createFile({
      parentPath: '/chat-log/dev-canonical-fail',
      name: 'kgc_dev-canonical-fail.md',
      text: '# Failed GitHub write must not cache',
    })
    const result = await promoteGeneratedChatWorkspacePaths([workspacePath], {
      githubEnabled: true,
      githubFetchImpl: async () => new Response(JSON.stringify({
        ok: false,
        status: 'failed',
        error: 'github_write_failed',
      }), {
        status: 424,
        headers: { 'content-type': 'application/json' },
      }),
      storageSyncNow: true,
      storageFetchImpl: async () => {
        storageCalled = true
        return new Response('{}', { status: 200 })
      },
    })
    if (result.githubStatus !== 'failed' || result.storageStatus !== 'skipped' || storageCalled) {
      throw new Error(`expected Cloudflare cache to stay untouched after GitHub failure, got result=${JSON.stringify(result)} storageCalled=${storageCalled}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testRetryGeneratedChatPromotionReusesSavedWorkspaceArtifact() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:retry-promotion'
  const workspacePath = '/chat-log/retry-promotion/kgc_retry_promotion.md'
  const content = '# Retry promotion\n\nReuse the saved local artifact without regenerating it.'
  const events: string[] = []
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'retry-promotion' })
    await fs.createFile({
      parentPath: '/chat-log/retry-promotion',
      name: 'kgc_retry_promotion.md',
      text: content,
    })

    const result = await retryGeneratedChatWorkspaceArtifactPromotion({
      paths: [workspacePath],
      githubEnabled: true,
      githubBaseUrl: 'https://pages.example',
      githubFetchImpl: async (_input, init) => {
        events.push('github:write')
        const body = JSON.parse(String(init?.body || '{}'))
        if (body.files?.[0]?.workspacePath !== workspacePath || body.files?.[0]?.text !== content) {
          throw new Error(`expected retry promotion to reuse the saved workspace artifact text, got ${JSON.stringify(body)}`)
        }
        return new Response(JSON.stringify({
          ok: true,
          status: 'applied',
          repository: 'owner/repo',
          files: [{ workspacePath, repositoryPath: workspacePath.replace(/^\/+/, ''), action: 'updated', commitSha: 'retry-commit-sha' }],
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      },
      storageWorkspaceId: workspaceId,
      storageSyncNow: true,
      storageBaseUrl: 'https://storage.example',
      storageDeviceId: 'retry-promotion-device',
      storageFetchImpl: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input || '')
        events.push(`storage:${new URL(url, 'https://storage.example').pathname}`)
        const request = input instanceof Request
          ? input
          : new Request(url.startsWith('/api/storage/') ? `https://storage.example${url}` : url, init)
        return readStorageWorker().fetch(request, env as never)
      },
    })

    if (result.promotion !== 'MIRRORED_GITHUB+STORAGE' || result.failureNote !== null || result.retryHint !== null || result.retryCommand !== null) {
      throw new Error(`expected retry promotion to report a successful mirrored result, got ${JSON.stringify(result)}`)
    }
    if (events[0] !== 'github:write' || !events.some(event => event.startsWith('storage:'))) {
      throw new Error(`expected retry promotion to preserve GitHub-before-storage ordering, got ${JSON.stringify(events)}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testRetryGeneratedChatPromotionReturnsExactRetryCommandOnFailure() {
  const previousEnabled = process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  const { restore: restoreDom } = initJsdomHarness()
  const { restore: restoreWindow } = initWindowHarness({ storage: new MemoryStorage() })
  const workspacePath = '/chat-log/retry-command/kgc_retry_command.md'
  try {
    resetWorkspaceFsForTests()
    process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = '1'
    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'chat-log' })
    await fs.createFolder({ parentPath: '/chat-log', name: 'retry-command' })
    await fs.createFile({
      parentPath: '/chat-log/retry-command',
      name: 'kgc_retry_command.md',
      text: '# Retry command\n\nLocal artifact is already saved.',
    })

    const result = await retryGeneratedChatWorkspaceArtifactPromotion({
      paths: [workspacePath],
      githubEnabled: true,
      githubFetchImpl: async () => new Response(JSON.stringify({
        ok: false,
        status: 'failed',
        error: 'github_write_failed',
      }), {
        status: 424,
        headers: { 'content-type': 'application/json' },
      }),
    })

    if (
      result.promotion !== 'PROMOTION_FAILED' ||
      result.failureNote !== '- Promotion note: mirroring failed (github: github_write_failed; storage: skipped).' ||
      result.retryHint !== '- Retry hint: verify the GitHub write route/config, or rerun with GitHub mirroring disabled for a local-only save.' ||
      result.retryCommand !== '- Retry command: `#promotion.retry /chat-log/retry-command/kgc_retry_command.md`'
    ) {
      throw new Error(`expected retry promotion failure to return the exact runnable retry command, got ${JSON.stringify(result)}`)
    }
  } finally {
    resetWorkspaceFsForTests()
    restoreWindow()
    restoreDom()
    if (typeof previousEnabled === 'string') process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED = previousEnabled
    else delete process.env.VITE_AGENTICGRAPH_GITHUB_WRITE_ENABLED
  }
}

export async function testPagesGitHubWorkspaceWriteRouteReportsForbiddenDependency() {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch

    const response = await onRequest({
      request: new Request('https://airvio.example/agenticgraph/api/workspace/github/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: [{
            workspacePath: '/chat-log/20260606T010203Z/kgc_20260606T010203Z.md',
            text: '# Generated KGC\n',
          }],
        }),
      }),
      env: {
        AGENTICGRAPH_GITHUB_WRITE_REPOSITORY: 'owner/repo',
        AGENTICGRAPH_GITHUB_WRITE_BRANCH: 'main',
        AGENTICGRAPH_GITHUB_WRITE_TOKEN: 'token-redacted',
      },
      next: async () => new Response('next'),
    } as never)
    const body = await response.json() as {
      ok?: boolean
      error?: string
      upstreamStatus?: number
      upstreamMessage?: string
    }
    if (response.status !== 424 || body.ok !== false || body.error !== 'github_read_failed') {
      throw new Error(`expected forbidden GitHub read to return failed dependency, got status=${response.status} body=${JSON.stringify(body)}`)
    }
    if (body.upstreamStatus !== 403 || body.upstreamMessage !== 'Forbidden') {
      throw new Error(`expected sanitized upstream GitHub status/message, got ${JSON.stringify(body)}`)
    }
    if (String(JSON.stringify(body)).includes('token-redacted')) {
      throw new Error('expected forbidden response to avoid leaking the GitHub token')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testPagesGitHubWorkspaceWriteRouteDryRunDoesNotCallGitHub() {
  const originalFetch = globalThis.fetch
  let fetched = false
  try {
    globalThis.fetch = (async () => {
      fetched = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const response = await onRequest({
      request: new Request('https://airvio.example/agenticgraph/api/workspace/github/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          files: [{
            workspacePath: '/chat-log/20260606T010203Z/kgc_20260606T010203Z.md',
            text: '# Generated KGC\n',
          }],
        }),
      }),
      env: {
        AGENTICGRAPH_GITHUB_WRITE_REPOSITORY: 'owner/repo',
        AGENTICGRAPH_GITHUB_WRITE_BRANCH: 'main',
        AGENTICGRAPH_GITHUB_WRITE_TOKEN: 'token-redacted',
      },
      next: async () => new Response('next'),
    } as never)
    const body = await response.json() as {
      ok?: boolean
      status?: string
      files?: Array<{ repositoryPath?: string; textBytes?: number }>
    }
    if (!response.ok || body.ok !== true || body.status !== 'dry_run') {
      throw new Error(`expected dry-run route to succeed without writing, got status=${response.status} body=${JSON.stringify(body)}`)
    }
    if (fetched) {
      throw new Error('expected dry-run route to avoid calling GitHub fetch')
    }
    if (body.files?.[0]?.repositoryPath !== 'chat-log/20260606T010203Z/kgc_20260606T010203Z.md' || body.files?.[0]?.textBytes !== 16) {
      throw new Error(`expected dry-run route to report normalized file metadata, got ${JSON.stringify(body)}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testPagesGitHubWorkspaceWriteRouteAcceptsRootAliasPath() {
  const originalFetch = globalThis.fetch
  let fetched = false
  try {
    globalThis.fetch = (async () => {
      fetched = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const response = await onRequest({
      request: new Request('https://airvio.example/api/workspace/github/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          files: [{
            workspacePath: '/chat-log/20260606T010203Z/kgc_20260606T010203Z.md',
            text: '# Generated KGC\n',
          }],
        }),
      }),
      env: {
        AGENTICGRAPH_GITHUB_WRITE_REPOSITORY: 'owner/repo',
        AGENTICGRAPH_GITHUB_WRITE_BRANCH: 'main',
        AGENTICGRAPH_GITHUB_WRITE_TOKEN: 'token-redacted',
      },
      next: async () => new Response('next'),
    } as never)
    const body = await response.json() as { ok?: boolean; status?: string }
    if (!response.ok || body.ok !== true || body.status !== 'dry_run' || fetched) {
      throw new Error(`expected root alias GitHub write route to dry-run without GitHub fetch, got status=${response.status} body=${JSON.stringify(body)} fetched=${fetched}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function testPagesGitHubWorkspaceWriteRouteRejectsNonChatLogPath() {
  const originalFetch = globalThis.fetch
  let fetched = false
  try {
    globalThis.fetch = (async () => {
      fetched = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const response = await onRequest({
      request: new Request('https://airvio.example/agenticgraph/api/workspace/github/write', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          files: [{ workspacePath: '/docs/kgc_20260606T010203Z.md', text: '# Wrong root' }],
        }),
      }),
      env: {
        AGENTICGRAPH_GITHUB_WRITE_REPOSITORY: 'owner/repo',
        AGENTICGRAPH_GITHUB_WRITE_TOKEN: 'token-redacted',
      },
      next: async () => new Response('next'),
    } as never)
    const body = await response.json() as { error?: string }
    if (response.status !== 400 || body.error !== 'unsupported_workspace_root' || fetched) {
      throw new Error(`expected non-chat-log path to fail before GitHub fetch, got status=${response.status} body=${JSON.stringify(body)} fetched=${fetched}`)
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
