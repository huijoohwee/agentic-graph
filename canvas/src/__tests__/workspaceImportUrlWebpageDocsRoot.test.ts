import assert from 'node:assert/strict'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const url = 'https://example.invalid/reference/source'
const stablePath = '/websites/example.invalid/reference/source.md'
const text = `---\nkgWebpageUrl: "${url}"\nkgWebpageView: "markdown"\n---\n\n# Saved source\n`

export async function testWorkspaceImportUrlExportsWebpageMarkdownIntoDocsRoot(): Promise<void> {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const mirrors: Array<{ url: string; body: string }> = []
  try {
    globalThis.fetch = (async (input, init) => { mirrors.push({ url: String(input), body: String(init?.body || '') }); return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }) }) as typeof fetch
    const fs = createMemoryWorkspaceFs()
    const result = await importWorkspaceUrl({ fs, urlRaw: url, fetchUrlContent: async sourceUrl => ({ normalizedUrl: sourceUrl, name: 'Changing title.md', text }) })
    assert.equal(result.createdPaths[0], stablePath)
    assert.equal(await fs.readFileText(stablePath), text)
    const mirrored = mirrors.find(call => call.url === '/__agentic_os_fs_reveal' && call.body.includes(stablePath))
    assert.ok(mirrored, 'the stable website source must be mirrored directly')
    assert.equal(JSON.parse(mirrored.body).saveOnly, true)
    assert.equal(await fs.readFileText('/Changing title.md'), null)
  } finally { globalThis.fetch = previousFetch; restore() }
}

export async function testWorkspaceImportUrlReplacesSameSourceWebpageArtifactWithoutSuffixDuplicate(): Promise<void> {
  const { restore } = initJsdomHarness()
  try {
    const fs = createMemoryWorkspaceFs({ initialEntries: [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/archive', parentPath: '/', kind: 'folder', name: 'archive', updatedAtMs: 1 },
      { path: '/archive/source.md', parentPath: '/archive', kind: 'file', name: 'source.md', text, updatedAtMs: 1 },
      { path: '/archive/source-2.md', parentPath: '/archive', kind: 'file', name: 'source-2.md', text, updatedAtMs: 1 },
    ] })
    const result = await importWorkspaceUrl({ fs, urlRaw: url, fetchUrlContent: async () => { throw new Error('saved source must not be fetched on repeat import') } })
    assert.deepEqual(result.createdPaths, ['/archive/source.md'])
    assert.equal(await fs.readFileText('/archive/source.md'), text)
    assert.equal(await fs.readFileText('/archive/source-2.md'), text, 'historical files are preserved, not silently deleted')
    assert.equal(result.removedPaths, undefined)
    assert.equal(await fs.readFileText(stablePath), null, 'reuse must not create a third copy')
  } finally { restore() }
}
