import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testWorkspaceImportUrlExportsWebpageMarkdownIntoDocsRoot(): Promise<void> {
  const { restore } = initJsdomHarness()
  const url = 'https://mp.weixin.qq.com/s/jYcEgFfQU8HKybU_Ss9Dbw'
  const fileName = 'jYcEgFfQU8HKybU_Ss9Dbw.md'
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousFetch = globalThis.fetch
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-webpage-docs-root-'))
  const mirrorWriteCalls: Array<{ url: string; body: string }> = []
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorWriteCalls.push({
        url: String(typeof input === 'string' ? input : input.toString()),
        body: String(init?.body || ''),
      })
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      ],
    })
    await fs.ensureSeed()
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: url,
      parentPath: '/',
      fetchUrlContent: async sourceUrl => ({
        normalizedUrl: sourceUrl,
        name: fileName,
        text: [
          '---',
          `kgWebpageUrl: "${sourceUrl}"`,
          'kgWebpageView: "markdown"',
          '---',
          '',
          '# Imported webpage',
          '',
          'Regular webpage URL imports should materialize in the configured docs mirror root.',
          '',
        ].join('\n'),
      }),
    })
    const expectedPath = `/docs_/${fileName}`
    if (result.createdPaths[0] !== expectedPath) {
      throw new Error(`expected webpage URL import to land under /docs_, got ${JSON.stringify(result.createdPaths)}`)
    }
    const workspaceText = await fs.readFileText(expectedPath)
    if (!workspaceText?.includes('Regular webpage URL imports')) {
      throw new Error(`expected webpage import body under /docs_, got:\n${String(workspaceText || '')}`)
    }
    const mirrored = mirrorWriteCalls.find(call =>
      call.url === '/__agentic_os_fs_write' && call.body.includes(`/docs_/${fileName}`),
    )
    if (!mirrored || !mirrored.body.includes(url) || !mirrored.body.includes('Regular webpage URL imports')) {
      throw new Error(`expected webpage import to mirror into configured docs_ root, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
    if ((await fs.readFileText(`/${fileName}`)) !== null) {
      throw new Error('expected webpage URL import to avoid a duplicate root-level workspace artifact')
    }
    if (result.removedPaths?.includes(`/${fileName}`)) {
      throw new Error(`expected webpage URL import to avoid old root-level cleanup paths, got ${JSON.stringify(result.removedPaths || [])}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}

export async function testWorkspaceImportUrlReplacesSameSourceWebpageArtifactWithoutSuffixDuplicate(): Promise<void> {
  const { restore } = initJsdomHarness()
  const url = 'https://mp.weixin.qq.com/s/jYcEgFfQU8HKybU_Ss9Dbw'
  const fileName = 'jYcEgFfQU8HKybU_Ss9Dbw.md'
  const duplicateName = 'jYcEgFfQU8HKybU_Ss9Dbw-2.md'
  const previousDocsAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
  const previousChatLogAbsRoot = process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
  const previousFetch = globalThis.fetch
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'workspace-import-webpage-source-replace-'))
  const mirrorWriteCalls: Array<{ url: string; body: string }> = []
  try {
    process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = `${tempRoot}/docs`
    process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = `${tempRoot}/chat-log`
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      mirrorWriteCalls.push({ url: String(typeof input === 'string' ? input : input.toString()), body: String(init?.body || '') })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    const legacyText = ['---', `kgWebpageUrl: "${url}"`, 'kgWebpageView: "markdown"', '---', '', '# Old import', ''].join('\n')
    const fs = createMemoryWorkspaceFs({
      initialEntries: [
        { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
        { path: '/docs_', parentPath: '/', kind: 'folder', name: 'docs_', updatedAtMs: 1 },
        { path: `/docs_/${fileName}`, parentPath: '/docs_', kind: 'file', name: fileName, text: legacyText, updatedAtMs: 1 },
        { path: `/docs_/${duplicateName}`, parentPath: '/docs_', kind: 'file', name: duplicateName, text: legacyText, updatedAtMs: 1 },
      ],
    })
    await fs.ensureSeed()
    const result = await importWorkspaceUrl({
      fs,
      urlRaw: url,
      parentPath: '/',
      fetchUrlContent: async sourceUrl => ({
        normalizedUrl: sourceUrl,
        name: duplicateName,
        text: ['---', `kgWebpageUrl: "${sourceUrl}"`, 'kgWebpageView: "markdown"', '---', '', '# New import', ''].join('\n'),
      }),
    })
    const expectedPath = `/docs_/${fileName}`
    if (result.createdPaths[0] !== expectedPath) {
      throw new Error(`expected same-source webpage import to replace canonical artifact, got ${JSON.stringify(result.createdPaths)}`)
    }
    const canonicalText = await fs.readFileText(expectedPath)
    if (!canonicalText?.includes('# New import')) throw new Error(`expected canonical artifact updated, got:\n${String(canonicalText || '')}`)
    if ((await fs.readFileText(`/docs_/${duplicateName}`)) !== null) {
      throw new Error('expected same-source numeric suffix duplicate to be removed')
    }
    if (!result.removedPaths?.includes(`/docs_/${duplicateName}`)) {
      throw new Error(`expected duplicate removal to be reported, got ${JSON.stringify(result.removedPaths || [])}`)
    }
    const mirrored = mirrorWriteCalls.find(call => call.url === '/__agentic_os_fs_write' && call.body.includes(`/docs_/${fileName}`))
    if (!mirrored || !mirrored.body.includes('# New import')) {
      throw new Error(`expected updated canonical artifact mirrored, got ${JSON.stringify(mirrorWriteCalls)}`)
    }
  } finally {
    if (typeof previousDocsAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT = previousDocsAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT
    if (typeof previousChatLogAbsRoot === 'string') process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT = previousChatLogAbsRoot
    else delete process.env.VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT
    if (previousFetch) {
      ;(globalThis as unknown as { fetch: typeof fetch }).fetch = previousFetch
    } else {
      delete (globalThis as unknown as { fetch?: typeof fetch }).fetch
    }
    await rm(tempRoot, { recursive: true, force: true })
    restore()
  }
}
