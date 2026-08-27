import { createFakeAgenticGraphStorageWorkerEnv } from '@/__tests__/helpers/fakeAgenticGraphStorageD1'
import { readStorageWorker } from '@/__tests__/helpers/fakeAgenticGraphStorageWorkerFetch'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import {
  CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
  CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
  CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
  CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
  CHAT_PROVIDER_BYTEPLUS,
} from '@/lib/chatEndpoint'
import { generateRunMarkdownWithProvider } from '@/features/chat/byteplusRunGeneration'
import { parseGenerationInvocation } from '@/features/chat/generationInvocation'
import {
  buildRichMediaWidgetOutputPatch,
  buildTextWidgetOutputPatch,
  runRichMediaWidgetGeneration,
  writeTextWidgetRunOutputArtifact,
} from '@/features/chat/richMediaRun'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { __resetAgenticGraphStorageDbForTests } from '@/lib/storage/agenticgraphStorageDb'
import { readStoredUploadedMediaPanelItems } from '@/lib/storage/uploadedMediaPanelItems'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

const INPUT_PATH = '/workspace/video-agent-input.md'
const INVOCATION = '/video-agent @provider.byteplus @text @image @video #spec.low @[video-agent-input.md](workspace:/workspace/video-agent-input.md)'

const routeProviderAndStorageFetch = (
  env: ReturnType<typeof createFakeAgenticGraphStorageWorkerEnv>,
): typeof fetch => {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input || '')
    if (url === '/__kg_fs_write') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/models')) {
      return new Response(JSON.stringify({
        data: [
          { id: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT },
          { id: CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT },
          { id: CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === '/__chat_proxy/api/v3/chat/completions') {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '# Generated Script\n\nA source-backed shot plan with narration and subtitles.' } }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === '/__chat_proxy/api/v3/images/generations') {
      return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === '/__chat_proxy/api/v3/contents/generations/tasks' && String(init?.method || 'GET').toUpperCase() === 'POST') {
      return new Response(JSON.stringify({ id: 'video-agent-e2e-task' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === '/__chat_proxy/api/v3/contents/generations/tasks/video-agent-e2e-task') {
      return new Response(JSON.stringify({
        status: 'succeeded',
        content: { video_url: 'https://provider.invalid/generated-video-agent.mp4' },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url === '/__chat_asset_proxy?url=https%3A%2F%2Fprovider.invalid%2Fgenerated-video-agent.mp4') {
      return new Response(Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109]), {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      })
    }
    if (url.startsWith('/api/storage/') || url.startsWith('https://example.com/api/storage/')) {
      const request = input instanceof Request
        ? input
        : new Request(url.startsWith('/') ? `https://example.com${url}` : url, init)
      return readStorageWorker().fetch(request, env as never)
    }
    throw new Error(`unexpected zero-spend generation request: ${url}`)
  }) as typeof fetch
}

const assertNonEmptySourceFile = (workspacePath: string): void => {
  const sourcePath = `workspace:${workspacePath}`
  const sourceFile = useGraphStore.getState().sourceFiles.find(file => String(file?.source?.path || '') === sourcePath)
  if (!sourceFile || sourceFile.enabled !== true || sourceFile.status !== 'idle') {
    throw new Error(`expected ${sourcePath} to remain accessible in Explorer -> Source Files, got ${JSON.stringify({ sourceFile, paths: useGraphStore.getState().sourceFiles.map(file => file.source?.path) })}`)
  }
  if (workspacePath.endsWith('.md') && !String(sourceFile.text || '').trim()) {
    throw new Error(`expected ${sourcePath} to contain non-empty text`)
  }
}

export async function testVideoAgentGeneratedOutputsPersistProjectAndRemainInvocableEndToEnd() {
  const { restore } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  const previousRuntimeSync = process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
  const store = useGraphStore.getState()
  const previousGraphData = store.graphData
  const previousSourceFiles = Array.isArray(store.sourceFiles) ? store.sourceFiles.slice() : []
  const env = createFakeAgenticGraphStorageWorkerEnv()
  const workspaceId = 'kgws:test-video-agent-generated-output-e2e'

  try {
    resetWorkspaceFsForTests()
    await __resetAgenticGraphStorageDbForTests()
    store.setSourceFiles([])
    process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = '1'
    process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = 'https://example.com'
    process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = workspaceId
    globalThis.fetch = routeProviderAndStorageFetch(env)

    const invocation = parseGenerationInvocation(INVOCATION)
    if (
      invocation?.provider !== CHAT_PROVIDER_BYTEPLUS
      || invocation.specification !== 'low'
      || invocation.kinds.join(',') !== 'text,image,video'
      || !invocation.prompt.includes('workspace:/workspace/video-agent-input.md')
    ) {
      throw new Error(`expected /, @, and # generation grammar to remain invocable, got ${JSON.stringify(invocation)}`)
    }

    const fs = await getWorkspaceFs()
    await fs.createFolder({ parentPath: '/', name: 'workspace' }).catch(() => '/workspace')
    const inputText = [
      '# Agentic Video Input',
      '',
      INVOCATION,
      '',
      'Generate a source-consistent image keyframe, structured script, and playable video master.',
    ].join('\n')
    await fs.writeFileText(INPUT_PATH, inputText)
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: [INPUT_PATH],
      opts: { applyToGraph: false },
    })

    const generationConfig = {
      provider: CHAT_PROVIDER_BYTEPLUS,
      endpointUrl: CHAT_BYTEPLUS_AP_SOUTHEAST_ENDPOINT_URL,
      apiKey: 'deterministic-test-key',
      chatModel: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
    }
    const generatedText = await generateRunMarkdownWithProvider({
      config: generationConfig,
      prompt: `${invocation.prompt}\n\n${inputText}`,
    })
    if (!generatedText?.trim()) throw new Error('expected provider-returned text generation output')
    const textNode: GraphNode = {
      id: 'video-agent-text-widget',
      type: 'TextGeneration',
      label: 'Text Script',
      properties: {},
    }
    const textOutputPath = await writeTextWidgetRunOutputArtifact({
      workspacePath: INPUT_PATH,
      node: textNode,
      output: generatedText,
      variant: 'text-output',
      fs,
    })
    if (!textOutputPath) throw new Error('expected generated text to persist as a workspace output file')

    const imageNode: GraphNode = {
      id: 'video-agent-image-widget',
      type: 'ImageGeneration',
      label: 'Image Keyframe',
      properties: {
        prompt: 'Generate the source-consistent keyframe.',
        model: CHAT_BYTEPLUS_IMAGE_MODEL_DEFAULT,
        response_format: 'b64_json',
        output_format: 'png',
      },
    }
    const imageResult = await runRichMediaWidgetGeneration({
      node: imageNode,
      markdownDocumentText: inputText,
      workspacePath: INPUT_PATH,
      generationConfig,
    })
    if (!imageResult?.asset.blob.size || !imageResult.outputPath || !imageResult.outputManifestPath || !imageResult.outputStorageUrl) {
      throw new Error(`expected a non-empty persisted image result, got ${JSON.stringify(imageResult)}`)
    }

    const videoNode: GraphNode = {
      id: 'video-agent-video-widget',
      type: 'VideoGeneration',
      label: 'Video Master',
      properties: {
        prompt: 'Generate the playable video master.',
        model: CHAT_BYTEPLUS_VIDEO_MODEL_DEFAULT,
        generate_audio: false,
      },
    }
    const videoResult = await runRichMediaWidgetGeneration({
      node: videoNode,
      markdownDocumentText: inputText,
      workspacePath: INPUT_PATH,
      generationConfig,
    })
    if (!videoResult?.asset.blob.size || !videoResult.outputPath || !videoResult.outputManifestPath || !videoResult.outputStorageUrl) {
      throw new Error(`expected a non-empty persisted video result, got ${JSON.stringify(videoResult)}`)
    }

    const textPatch = buildTextWidgetOutputPatch({
      output: generatedText,
      title: textNode.label,
      model: CHAT_BYTEPLUS_TEXT_MODEL_DEFAULT,
      outputPath: textOutputPath,
    })
    const imagePatch = buildRichMediaWidgetOutputPatch(imageResult)
    const videoPatch = buildRichMediaWidgetOutputPatch(videoResult)
    const textProperties = textPatch as NonNullable<GraphNode['properties']>
    const imageProperties = imagePatch as NonNullable<GraphNode['properties']>
    const videoProperties = videoPatch as NonNullable<GraphNode['properties']>
    const projectedNodes: GraphNode[] = [
      { ...textNode, properties: textProperties },
      { ...imageNode, properties: imageProperties },
      { id: 'video-agent-image-panel', type: 'RichMediaPanel', label: 'Image Panel', properties: imageProperties },
      { ...videoNode, properties: videoProperties },
      { id: 'video-agent-video-panel', type: 'RichMediaPanel', label: 'Video Panel', properties: videoProperties },
    ]
    store.setGraphData({ type: 'Graph', nodes: projectedNodes, edges: [] } as GraphData)

    const graphNodes = useGraphStore.getState().graphData?.nodes || []
    const projectedText = graphNodes.find(node => node.id === textNode.id)
    if (!String(projectedText?.properties?.output || '').trim() || !String(projectedText?.properties?.outputSrcDoc || '').trim()) {
      throw new Error('expected generated text to project into the canvas Card/Widget output surface')
    }
    for (const nodeId of ['video-agent-image-widget', 'video-agent-image-panel', 'video-agent-video-widget', 'video-agent-video-panel']) {
      const node = graphNodes.find(candidate => candidate.id === nodeId)
      const expectedKind = nodeId.includes('image') ? 'image' : 'video'
      const media = node ? getNodeMediaSpec(node) : null
      if (media?.kind !== expectedKind || !media.url.includes('/api/storage/media/')) {
        throw new Error(`expected ${nodeId} to expose its durable ${expectedKind} identity, got ${JSON.stringify(media)}`)
      }
    }

    for (const outputPath of [
      INPUT_PATH,
      textOutputPath,
      imageResult.outputPath,
      imageResult.outputManifestPath,
      videoResult.outputPath,
      videoResult.outputManifestPath,
    ]) {
      assertNonEmptySourceFile(outputPath)
    }
    const mediaItems = readStoredUploadedMediaPanelItems()
    if (mediaItems.length !== 2 || mediaItems.map(item => item.kind).sort().join(',') !== 'image,video') {
      throw new Error(`expected generated image and video to register in the shared @ Media inventory, got ${JSON.stringify(mediaItems)}`)
    }
    if (env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size !== 2) {
      throw new Error(`expected two durable R2 media objects, got ${env.AGENTICGRAPH_STORAGE_BLOB_BUCKET.objects.size}`)
    }
    const publishedPaths = Array.from(env.DB.documents.values()).map(row => String(row.canonical_path || ''))
    for (const path of [textOutputPath, imageResult.outputManifestPath, videoResult.outputManifestPath]) {
      if (!publishedPaths.includes(path.replace(/^\//, ''))) {
        throw new Error(`expected ${path} to remain replayable from D1, got ${JSON.stringify(publishedPaths)}`)
      }
    }
  } finally {
    await __resetAgenticGraphStorageDbForTests()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    useGraphStore.setState({ graphData: previousGraphData })
    store.setSourceFiles(previousSourceFiles)
    if (typeof previousRuntimeSync === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED = previousRuntimeSync
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_RUNTIME_SYNC_ENABLED
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
    restore()
  }
}
