import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import storageWorker from '../../../cloudflare/workers/agenticgraph-storage/index.ts'
import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { writeKgcCompanionOutputBlob, writeKgcCompanionOutputText } from '@/features/chat/chatHistoryWorkspace.output'
import { writeRichMediaWidgetRunOutputArtifact, writeTextWidgetRunOutputArtifact } from '@/features/chat/richMediaRun'
import { useGraphStore } from '@/hooks/useGraphStore'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { buildAgenticGraphStorageDocPath } from '@/lib/storage/agenticgraphStorageSyncContract'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agenticgraphStorageDb'
import { readStoredUploadedMediaPanelItems } from '@/lib/storage/uploadedMediaPanelItems'

const readStorageWorker = (): { fetch: (request: Request, env: never) => Promise<Response> } => {
  const candidate = storageWorker as unknown as {
    fetch?: (request: Request, env: never) => Promise<Response>
    default?: { fetch?: (request: Request, env: never) => Promise<Response> }
  }
  const fetchImpl = candidate.fetch || candidate.default?.fetch
  if (!fetchImpl) throw new Error('expected storage worker test module to expose fetch')
  return { fetch: fetchImpl }
}

export async function testWriteKgcCompanionOutputTextCreatesSiblingWorkspaceArtifact() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ path: string; text: string }> = []
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body || '')
      let parsed: { path?: unknown; text?: unknown } | null = null
      try {
        parsed = JSON.parse(body) as { path?: unknown; text?: unknown }
      } catch {
        parsed = null
      }
      fetchCalls.push({
        path: typeof parsed?.path === 'string' ? parsed.path : '',
        text: typeof parsed?.text === 'string' ? parsed.text : '',
      })
      return { ok: true } as Response
    }) as typeof fetch

    const writtenPath = await writeKgcCompanionOutputText({
      workspacePath: '/chat-log/kgc_20260420105432.md',
      extension: 'html',
      variant: 'viewer',
      text: '<!doctype html><html><body>viewer</body></html>',
    })

    if (writtenPath !== '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z-viewer.html') {
      throw new Error('Expected KGC output helper to derive the canonical sibling output path')
    }

    const fs = await getWorkspaceFs()
    const persisted = await fs.readFileText('/chat-log/20260420T105432Z/kgc-output_20260420T105432Z-viewer.html')
    if (persisted !== '<!doctype html><html><body>viewer</body></html>') {
      throw new Error('Expected KGC output helper to persist the companion workspace artifact text')
    }

    if (!fetchCalls.some(call => call.path === '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z-viewer.html')) {
      throw new Error('Expected KGC output helper to mirror the companion artifact to the host file writer endpoint')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteKgcCompanionOutputBlobMirrorsBinaryArtifactToHostWriter() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const fetchCalls: Array<{ path: string; base64: string; encoding: string }> = []
  try {
    resetWorkspaceFsForTests()
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body || '')
      let parsed: { path?: unknown; base64?: unknown; encoding?: unknown } | null = null
      try {
        parsed = JSON.parse(body) as { path?: unknown; base64?: unknown; encoding?: unknown }
      } catch {
        parsed = null
      }
      fetchCalls.push({
        path: typeof parsed?.path === 'string' ? parsed.path : '',
        base64: typeof parsed?.base64 === 'string' ? parsed.base64 : '',
        encoding: typeof parsed?.encoding === 'string' ? parsed.encoding : '',
      })
      return { ok: true } as Response
    }) as typeof fetch

    const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
    const writtenPath = await writeKgcCompanionOutputBlob({
      workspacePath: '/chat-log/kgc_20260420105432.md',
      extension: 'png',
      blob,
    })

    if (writtenPath !== '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z.png') {
      throw new Error('Expected binary KGC output helper to derive the canonical sibling PNG path')
    }

    const mirrored = fetchCalls.find(call => call.path === '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z.png')
    if (!mirrored) {
      throw new Error('Expected binary KGC output helper to mirror the companion artifact to the host file writer endpoint')
    }
    if (mirrored.encoding !== 'base64' || !mirrored.base64) {
      throw new Error('Expected binary KGC output helper to send base64-encoded bytes to the host file writer endpoint')
    }
  } finally {
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteKgcCompanionOutputBlobUploadsR2AndPublishesManifestWhenRuntimeSyncEnabled() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:test-generated-binary-manifest'
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
    process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = 'https://example.com'
    process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = workspaceId
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input || '')
      if (url === '/__kg_fs_write') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const request = input instanceof Request
        ? input
        : new Request(url.startsWith('/api/storage/') ? `https://example.com${url}` : String(input), init)
      return readStorageWorker().fetch(request, env as never)
    }) as typeof fetch

    const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' })
    const writtenPath = await writeKgcCompanionOutputBlob({
      workspacePath: '/chat-log/kgc_20260420105432.md',
      extension: 'png',
      blob,
    })
    if (writtenPath !== '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z.png') {
      throw new Error(`expected binary helper to preserve canonical output path, got ${String(writtenPath || '')}`)
    }
    if (env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size !== 1) {
      throw new Error(`expected generated binary output to upload one R2 object, got ${env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size}`)
    }
    const manifestPath = '/chat-log/20260420T105432Z/kgc-output_20260420T105432Z.png.manifest.md'
    const fs = await getWorkspaceFs()
    const manifest = await fs.readFileText(manifestPath)
    if (!manifest || !manifest.includes('kind: agenticgraph_binary_artifact') || !manifest.includes('r2_object_key:')) {
      throw new Error(`expected generated binary output to write an R2 manifest, got ${String(manifest || '')}`)
    }
    const docResponse = await readStorageWorker().fetch(
      new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'chat-log/20260420T105432Z/kgc-output_20260420T105432Z.png.manifest.md')}`),
      env as never,
    )
    if (!docResponse.ok) {
      throw new Error(`expected generated binary manifest to publish to D1, got ${docResponse.status}`)
    }
    const published = await docResponse.text()
    if (!published.includes('storage_url:') || !published.includes('kgc-output_20260420T105432Z.png')) {
      throw new Error(`expected published manifest to expose storage URL and source binary, got ${published}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteTextWidgetRunOutputArtifactLandsInSourceFiles() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  try {
    resetWorkspaceFsForTests()
    store.setSourceFiles([])
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()

    const writtenPath = await writeTextWidgetRunOutputArtifact({
      workspacePath: '/workspace/current.md',
      node: {
        id: 'text-widget-1',
        type: 'TextGeneration',
        label: 'Text Widget',
        properties: {},
      },
      output: '# Generated Text\n\nWidget output lands in the Editor Workspace.',
      variant: 'text-output',
      fs,
    })

    if (writtenPath !== '/workspace/current-text-widget-text-output.md') {
      throw new Error(`Expected text widget output helper to derive a stable sibling workspace artifact path, got ${String(writtenPath || '')}`)
    }

    const persisted = await fs.readFileText('/workspace/current-text-widget-text-output.md')
    if (persisted !== '# Generated Text\n\nWidget output lands in the Editor Workspace.') {
      throw new Error('Expected text widget output helper to persist generated markdown in Workspace FS')
    }

    const sourcePath = 'workspace:/workspace/current-text-widget-text-output.md'
    const sourceFile = useGraphStore.getState().sourceFiles.find(file => String(file?.source?.path || '') === sourcePath) || null
    if (!sourceFile || sourceFile.enabled !== true || sourceFile.status !== 'idle' || String(sourceFile.text || '') !== persisted) {
      throw new Error(`Expected generated text output artifact to land passively in Source Files, got ${JSON.stringify(useGraphStore.getState().sourceFiles.map(file => ({ name: file.name, source: file.source?.path, enabled: file.enabled, status: file.status, text: file.text })))}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    resetWorkspaceFsForTests()
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteTextWidgetRunOutputArtifactPublishesForReplayWhenRuntimeSyncEnabled() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:test-text-widget-replay'
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
    process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = 'https://example.com'
    process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = workspaceId
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input || '')
      if (url === '/__kg_fs_write') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const request = input instanceof Request
        ? input
        : new Request(url.startsWith('/api/storage/') ? `https://example.com${url}` : String(input), init)
      return readStorageWorker().fetch(request, env as never)
    }) as typeof fetch

    const output = '# Generated Text\n\nReplayable video-agent shot plan.'
    const outputPath = await writeTextWidgetRunOutputArtifact({
      workspacePath: '/workspace/demo.md',
      node: { id: 'text-widget-1', type: 'TextGeneration', label: 'Text Widget', properties: {} },
      output,
      variant: 'text-output',
      fs,
    })
    if (outputPath !== '/workspace/demo-text-widget-text-output.md') {
      throw new Error(`expected stable text artifact path, got ${String(outputPath || '')}`)
    }
    const response = await readStorageWorker().fetch(
      new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'workspace/demo-text-widget-text-output.md')}`),
      env as never,
    )
    if (!response.ok || await response.text() !== output) {
      throw new Error(`expected generated text artifact to replay from D1, got ${response.status}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteRichMediaWidgetRunOutputArtifactLandsManifestInSourceFiles() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const store = useGraphStore.getState()
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const fetchCalls: Array<{ path: string; base64: string; text: string }> = []
  try {
    resetWorkspaceFsForTests()
    store.setSourceFiles([])
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body || '')
      let parsed: { path?: unknown; base64?: unknown; text?: unknown } | null = null
      try {
        parsed = JSON.parse(body) as { path?: unknown; base64?: unknown; text?: unknown }
      } catch {
        parsed = null
      }
      fetchCalls.push({
        path: typeof parsed?.path === 'string' ? parsed.path : '',
        base64: typeof parsed?.base64 === 'string' ? parsed.base64 : '',
        text: typeof parsed?.text === 'string' ? parsed.text : '',
      })
      return { ok: true } as Response
    }) as typeof fetch

    const result = await writeRichMediaWidgetRunOutputArtifact({
      workspacePath: '/workspace/current.md',
      node: {
        id: 'image-widget-1',
        type: 'ImageGeneration',
        label: 'Image Widget',
        properties: {},
      },
      kind: 'image',
      extension: 'png',
      asset: {
        blob: new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
        renderUrl: 'data:image/png;base64,iVBORw0KGgo=',
        sourceUrl: 'https://example.invalid/generated.png',
        model: 'test-image-model',
      },
      fs,
    })

    if (result.outputPath !== '/workspace/current-image-widget.png') {
      throw new Error(`Expected rich-media helper to persist the generated binary sibling path, got ${String(result.outputPath || '')}`)
    }
    if (result.outputManifestPath !== '/workspace/current-image-widget-image-output.md') {
      throw new Error(`Expected rich-media helper to persist the editable markdown manifest sibling path, got ${String(result.outputManifestPath || '')}`)
    }
    if (!fetchCalls.some(call => call.path === '/workspace/current-image-widget.png' && call.base64)) {
      throw new Error('Expected rich-media helper to mirror generated binary media to the host file writer')
    }

    const manifestText = await fs.readFileText('/workspace/current-image-widget-image-output.md')
    if (!manifestText || !manifestText.includes('| artifactPath | ./current-image-widget.png |') || !manifestText.includes('![Image Widget](./current-image-widget.png)')) {
      throw new Error(`Expected rich-media helper to write an editable markdown manifest for the generated media, got ${String(manifestText || '')}`)
    }

    const sourcePath = 'workspace:/workspace/current-image-widget-image-output.md'
    const sourceFile = useGraphStore.getState().sourceFiles.find(file => String(file?.source?.path || '') === sourcePath) || null
    if (!sourceFile || sourceFile.enabled !== true || sourceFile.status !== 'idle' || String(sourceFile.text || '') !== manifestText) {
      throw new Error(`Expected generated rich-media manifest to land passively in Source Files, got ${JSON.stringify(useGraphStore.getState().sourceFiles.map(file => ({ name: file.name, source: file.source?.path, enabled: file.enabled, status: file.status, text: file.text })))}`)
    }
    const binarySourcePath = 'workspace:/workspace/current-image-widget.png'
    const binarySourceFile = useGraphStore.getState().sourceFiles.find(file => String(file?.source?.path || '') === binarySourcePath) || null
    if (!binarySourceFile || binarySourceFile.enabled !== true || binarySourceFile.status !== 'idle') {
      throw new Error(`Expected generated rich-media binary to land passively in Source Files, got ${JSON.stringify(useGraphStore.getState().sourceFiles.map(file => ({ name: file.name, source: file.source?.path, enabled: file.enabled, status: file.status })))}`)
    }
  } finally {
    store.setSourceFiles(previousSourceFiles)
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export async function testWriteRichMediaWidgetRunOutputArtifactUploadsR2AndPublishesManifestWhenRuntimeSyncEnabled() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:test-rich-media-binary-manifest'
  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
    process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = 'https://example.com'
    process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = workspaceId
    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input || '')
      if (url === '/__kg_fs_write') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const request = input instanceof Request
        ? input
        : new Request(url.startsWith('/api/storage/') ? `https://example.com${url}` : String(input), init)
      return readStorageWorker().fetch(request, env as never)
    }) as typeof fetch

    const result = await writeRichMediaWidgetRunOutputArtifact({
      workspacePath: '/workspace/current.md',
      node: {
        id: 'image-widget-1',
        type: 'ImageGeneration',
        label: 'Image Widget',
        properties: {},
      },
      kind: 'image',
      extension: 'png',
      asset: {
        blob: new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }),
        renderUrl: 'data:image/png;base64,iVBORw0KGgo=',
        sourceUrl: 'https://example.invalid/generated.png',
        model: 'test-image-model',
      },
      fs,
    })

    if (result.outputPath !== '/workspace/current-image-widget.png') {
      throw new Error(`expected rich-media binary output path, got ${String(result.outputPath || '')}`)
    }
    if (result.outputManifestPath !== '/workspace/current-image-widget-image-output.md') {
      throw new Error(`expected rich-media manifest output path, got ${String(result.outputManifestPath || '')}`)
    }
    if (!result.outputStorageUrl || !result.outputStorageUrl.includes('/api/storage/media/')) {
      throw new Error(`expected rich-media helper to return durable storage URL, got ${String(result.outputStorageUrl || '')}`)
    }
    const registeredMedia = readStoredUploadedMediaPanelItems()
    if (registeredMedia.length !== 1 || registeredMedia[0]?.kind !== 'image' || registeredMedia[0]?.name !== 'current-image-widget.png') {
      throw new Error(`expected generated rich-media output to register in the shared Media @ inventory, got ${JSON.stringify(registeredMedia)}`)
    }
    if (env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size !== 1) {
      throw new Error(`expected rich-media output to upload one R2 object, got ${env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size}`)
    }
    const manifestText = await fs.readFileText('/workspace/current-image-widget-image-output.md')
    if (!manifestText || !manifestText.includes('| storageUrl | /api/storage/media/') || !manifestText.includes('| storagePublicPath | /api/storage/media/') || !manifestText.includes('| r2ObjectKey |')) {
      throw new Error(`expected rich-media manifest to include R2 storage metadata, got ${String(manifestText || '')}`)
    }
    const docResponse = await readStorageWorker().fetch(
      new Request(`https://example.com${buildAgenticGraphStorageDocPath(workspaceId, 'workspace/current-image-widget-image-output.md')}`),
      env as never,
    )
    if (!docResponse.ok) {
      throw new Error(`expected rich-media manifest to publish to D1, got ${docResponse.status}`)
    }
    const published = await docResponse.text()
    if (!published.includes('storageUrl') || !published.includes('current-image-widget.png')) {
      throw new Error(`expected published rich-media manifest to expose storage URL and binary path, got ${published}`)
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
    restoreDom()
    restoreWindow()
  }
}
