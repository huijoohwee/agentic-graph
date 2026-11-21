import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAutoWebsiteImportOptions } from '@/lib/toolbar/importUrlWebsiteMode'
import { createWebsiteImportWorkspaceWriter } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportNodeWriter'
import { runWorkspaceWebsiteImport } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import type { GraphData } from '@/lib/graph/types'
import { resolveCanvasFrontmatterPreset, applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { useGraphStore } from '@/hooks/useGraphStore'

test('each crawl artifact reopens in Dashboard even after a Storyboard document', async () => {
  const before = useGraphStore.getState()
  const fs = createMemoryWorkspaceFs()
  try {
    const writer = await createWebsiteImportWorkspaceWriter({
      fs, url: 'https://example.invalid/guide', importId: 'renderer-defaults', importJobRef: { current: 1 }, jobId: 1,
      settings: { outputDirRel: '', concurrency: 1, defaultView: 'markdown', generateArtifactDocs: false, browserEnhance: false },
      status: { setStatusProgress() {} },
    })
    const result = await writer.finalize({ version: 1, importId: 'renderer-defaults', rootUrl: 'https://example.invalid/guide',
      status: 'done', startedAtMs: 1, errors: [], nodes: [{ nodeId: 'page', url: 'https://example.invalid/guide', path: '/guide', status: 'ok', artifacts: {} }] })
    assert.equal(result.created.createdPaths.length, 3)
    for (const path of result.created.createdPaths) {
      useGraphStore.setState({ canvas2dRenderer: 'storyboard', documentStructureBaselineLock: false })
      const rawText = String(await fs.readFileText(path))
      assert.equal(parseCanvasWorkspaceFrontmatterPreset(rawText)?.canvas2dRenderer, 'dashboard', path)
      applyCanvasFrontmatterPreset({ rawText })
      assert.equal(useGraphStore.getState().canvas2dRenderer, 'dashboard', path)
    }
  } finally { useGraphStore.setState(before) }
})

test('headless crawl starts in the shared Dashboard document preset before requesting the server', async () => {
  const before = useGraphStore.getState()
  const fetchBefore = globalThis.fetch
  const options = buildAutoWebsiteImportOptions()
  assert.equal(options.headless, true)
  assert.equal(options.applyToCanvas, true)
  try {
    useGraphStore.setState({ canvas2dRenderer: 'storyboard', documentSemanticMode: 'keyword',
      frontmatterModeEnabled: true, multiDimTableModeEnabled: true, documentStructureBaselineLock: false })
    globalThis.fetch = async () => {
      const state = useGraphStore.getState()
      assert.equal(state.canvas2dRenderer, 'dashboard')
      assert.equal(state.canvasRenderMode, '2d')
      assert.equal(state.documentSemanticMode, 'document')
      assert.equal(state.frontmatterModeEnabled, false)
      assert.equal(state.multiDimTableModeEnabled, false)
      throw new Error('test-server-stop')
    }
    await assert.rejects(runWorkspaceWebsiteImport({ url: 'https://example.invalid/guide', opts: options,
      importJobRef: { current: 1 }, jobId: 1, getFs: async () => createMemoryWorkspaceFs(),
      status: { setStatusProgress() {} },
    }), /test-server-stop/)
  } finally { globalThis.fetch = fetchBefore; useGraphStore.setState(before) }
})

test('URL provenance supplies Dashboard for raw sources while authored surface choices survive', () => {
  const path = '/capture/records.json'
  const url = new URL('records.json', 'https://example.invalid/').href
  const graphData: GraphData = { type: 'graph', nodes: [], edges: [], metadata: { source: 'markdown:' + path } }
  setWorkspaceEntrySource(path, { kind: 'url', url })
  try {
    const rawText = '{"records":[]}'
    assert.equal(resolveCanvasFrontmatterPreset({ graphData, rawText })?.canvas2dRenderer, 'dashboard')
    assert.deepEqual(resolveCanvasFrontmatterPreset({ graphData, rawText, preset: { canvasRenderMode: '3d' } }), { canvasRenderMode: '3d' })
    setWorkspaceEntrySource(path, { kind: 'local', originalName: 'records.json' })
    assert.equal(resolveCanvasFrontmatterPreset({ graphData, rawText }), null)
    assert.equal(resolveCanvasFrontmatterPreset({ rawText: `---\nkgWebpageUrl: "${url}"\n---\nSaved page` })?.canvas2dRenderer, 'dashboard')
  } finally { setWorkspaceEntrySource(path, null) }
})
