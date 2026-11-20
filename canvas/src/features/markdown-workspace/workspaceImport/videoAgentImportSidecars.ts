import { VIDEO_AGENT_SCHEMA_VERSION, type VideoAgentPipeline } from '@/features/video-agent'
import { joinWorkspacePath, normalizeWorkspacePath, workspaceBasename } from '@/features/workspace-fs/path'
import { fitsVideoImportFile, videoImportTextParts } from './videoAgentImportPreview'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import type { buildVideoAgentTranscriptImportArtifacts } from './videoAgentTranscriptImportArtifacts'

type SidecarInput = {
  sampled: boolean
  storedGraph?: string
  pipeline: VideoAgentPipeline
  renderData: Record<string, unknown>
  transcriptArtifacts: ReturnType<typeof buildVideoAgentTranscriptImportArtifacts>
  sourceUrl: string
  sourcePlaybackUrl: string
  sourceName: string
  sourceText: string
  sourceTranscriptJsonText: string
  youtubeId: string | null
}

const jsonFileText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

export function buildVideoAgentImportSidecars({
  pipeline, renderData, transcriptArtifacts, sourceUrl, sourcePlaybackUrl,
  sampled, storedGraph, sourceName, sourceText, sourceTranscriptJsonText, youtubeId,
}: SidecarInput) {
  const { renderSpec } = pipeline
  const workspaceFiles = renderData.workspaceFiles as Array<{ kind?: unknown; path?: unknown; role?: unknown }>
  const files: Array<{ path: WorkspacePath; text: string }> = []
  const sourceManifest = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:source-manifest`,
    sourceUrl,
    sourceName,
    youtubeId: youtubeId || undefined,
    ...(sampled ? { sourceTextPath: 'transcript.md', sourceTranscriptJsonPath: sourceTranscriptJsonText ? 'transcript.json' : undefined }
      : { sourceText, sourceTranscriptJsonText }),
    sourceVideo: renderData.sourceVideo,
    transcriptStatus: transcriptArtifacts.sourceTranscript.status,
    transcriptSegmentCount: transcriptArtifacts.sourceTranscript.segmentCount,
  }
  const frameByFrameTranscript = sampled
    ? transcriptArtifacts.frameByFrameTranscript.map(({ text, ...timing }) => timing)
    : transcriptArtifacts.frameByFrameTranscript
  const parseOutput = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:parse-output`,
    sourceUrl,
    sourceTranscript: transcriptArtifacts.sourceTranscript,
    frameByFrameTranscript,
    frameBoundingBoxes: pipeline.frameBoundingBoxes,
    frameByFrameSamples: (renderData.frameByFrameSamples || []) as unknown,
  }
  const searchIndex = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:search-index`,
    ...(sampled ? { transcriptPath: 'parse.json' } : {}),
    sourceUrl,
    frameByFrameSamples: (renderData.frameByFrameSamples || []) as unknown,
    frameByFrameTranscript,
  }
  const timelineManifest = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:timeline`,
    sourceUrl,
    timelineTracks: pipeline.timelineTracks,
    timelineLanes: (renderData.timelineLanes || []) as unknown,
    bottomPanelTimelineSync: renderData.bottomPanelTimelineSync,
  }
  const generatedAssets = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:generation-plan`,
    sourceUrl,
    intent: pipeline.intent,
    stages: pipeline.stages,
    reasoningArtifacts: pipeline.reasoningArtifacts.filter(artifact => artifact.capability === 'generate'),
    richMediaPanels: renderData.richMediaPanels,
  }
  const streamManifest = {
    schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:stream-output`,
    sourceUrl,
    stream: pipeline.stream,
    sourcePlaybackUrl,
    richMediaPanels: renderData.richMediaPanels,
    renderSpec: {
      durationMs: renderSpec.durationMs,
      fps: renderSpec.fps,
      width: renderSpec.width,
      height: renderSpec.height,
      engineHint: renderSpec.engineHint,
    },
  }
  const renderHtmlText = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${sourceUrl}</title>`,
    '<style>',
    renderSpec.css,
    '</style>',
    '</head>',
    '<body>',
    renderSpec.html,
    '</body>',
    '</html>',
    '',
  ].join('\n')
  const artifactTextByName: Record<string, string> = {
    'dataset-operations.json': jsonFileText({
      schemaVersion: `${VIDEO_AGENT_SCHEMA_VERSION}:dataset-operation-summary`,
      sourceUrl,
      datasetOperationSummary: pipeline.datasetRuntime.datasetOperationSummary,
      datasetSplitSummary: pipeline.datasetRuntime.datasetSplitSummary,
      savedDatasetArtifact: pipeline.datasetRuntime.savedDatasetArtifact,
    }),
    'visual-dataset.json': jsonFileText(pipeline.datasetRuntime.visualDataset),
    'zone-counts.json': jsonFileText(pipeline.datasetRuntime.zoneCounting),
    'moments.json': jsonFileText(searchIndex),
    'parse.json': jsonFileText(parseOutput),
    'frame-boxes.json': jsonFileText(pipeline.frameBoundingBoxes),
    'timeline.json': jsonFileText(timelineManifest),
    'generated-assets.json': jsonFileText(generatedAssets),
    'render.html': renderHtmlText,
    'stream-manifest.json': jsonFileText(streamManifest),
  }

  function addFile(path: WorkspacePath, text: string) {
    if (fitsVideoImportFile(text)) {
      files.push({ path, text })
      return
    }
    const parts: string[] = []
    const markdown = path.endsWith('.md')
    for (const part of videoImportTextParts(text)) {
      const suffix = `.part-${parts.length + 1}.${markdown ? 'md' : 'txt'}`
      parts.push(workspaceBasename(path) + suffix)
      files.push({ path: path + suffix, text: part })
    }
    // Concatenating the ordered UTF-8 parts restores the exact original file.
    const index = markdown ? parts.map((name, i) => `${i + 1}. [${name}](./${name})`).join('\n')
      : jsonFileText({ schemaVersion: 'workspace-text-parts/v1', encoding: 'utf-8', parts })
    files.push({ path, text: index })
  }

  for (const file of workspaceFiles) {
    const path = normalizeWorkspacePath(String(file.path || ''))
    const text = artifactTextByName[workspaceBasename(path)]
    if (path && text) addFile(path, text)
  }
  const root = String(renderData.workspaceOutputRoot)
  if (storedGraph) addFile(joinWorkspacePath(root, 'graph.md'), storedGraph)
  if (sampled) {
    addFile(joinWorkspacePath(root, 'transcript.md'), sourceText)
    if (sourceTranscriptJsonText) addFile(joinWorkspacePath(root, 'transcript.json'), sourceTranscriptJsonText)
  }
  addFile(joinWorkspacePath(root, 'source.json'), jsonFileText({
    ...sourceManifest,
    ...(sampled ? { requiredFiles: files.map(file => workspaceBasename(file.path)) } : {}),
  }))
  return files
}
