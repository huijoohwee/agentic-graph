import type { GraphData } from '@/lib/graph/types'
import { buildVideoAgentPipeline } from '@/features/video-agent/videoAgentPipeline'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { notifyWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'
import { WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import {
  buildStrybldrVideoHandoffFromGraphData,
  buildStrybldrVideoHandoffMarkdown,
} from './strybldrStoryboard'

export type StrybldrLocalVideoArtifactResult =
  | { ok: true; path: string; cardCount: number; videoAgentAnalysis: boolean }
  | { ok: false; reason: string }

const cleanText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()

const htmlAttr = (value: string): string => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const buildVideoAgentAnalysisPacketMarkdown = (sourceUrlRaw: unknown): string => {
  const sourceUrl = cleanText(sourceUrlRaw)
  if (!sourceUrl) return ''
  const result = buildVideoAgentPipeline({
    sourceUrl,
    intent: 'Analyze the operator-supplied source video as a source-backed video-agent packet before any paid or credentialed provider action.',
    workspaceOutputRoot: 'video-agent-analysis',
  })
  if (!result.ok) {
    const error = result as { errorCode: string; field: string; reason: string }
    return [
      '## Video-Agent Analysis Packet',
      '',
      '```json',
      JSON.stringify({
        ok: false,
        sourceUrl,
        errorCode: error.errorCode,
        field: error.field,
        reason: error.reason,
      }, null, 2),
      '```',
      '',
    ].join('\n')
  }
  const { pipeline } = result
  const data = pipeline.renderSpec.data as Record<string, unknown>
  const srcDoc = [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<style>${pipeline.renderSpec.css}</style>`,
    '</head><body>',
    pipeline.renderSpec.html,
    '</body></html>',
  ].join('')
  const packet = {
    ok: true,
    schemaVersion: pipeline.schemaVersion,
    source: pipeline.source,
    referenceBoundary: pipeline.referenceBoundary,
    intent: pipeline.intent,
    capabilities: pipeline.capabilities,
    stages: pipeline.stages,
    reasoningArtifacts: pipeline.reasoningArtifacts,
    frameBoundingBoxes: pipeline.frameBoundingBoxes,
    datasetOperationSummary: data.datasetOperationSummary,
    zoneCounting: data.zoneCounting,
    timelineTracks: pipeline.timelineTracks,
    richMediaPanels: data.richMediaPanels,
    workspaceFiles: data.workspaceFiles,
    stream: pipeline.stream,
    renderSpec: {
      durationMs: pipeline.renderSpec.durationMs,
      fps: pipeline.renderSpec.fps,
      width: pipeline.renderSpec.width,
      height: pipeline.renderSpec.height,
      engineHint: pipeline.renderSpec.engineHint,
      outputSrcDoc: 'present',
    },
    liveProviderOutputs: {
      transcriptText: null,
      providerIds: [],
      streamUrls: [],
      paidCallCount: 0,
    },
  }
  return [
    '## Video-Agent Analysis Preview',
    '',
    `<iframe srcdoc="${htmlAttr(srcDoc)}" title="Video-agent source analysis preview" width="100%" height="405" sandbox="allow-scripts allow-same-origin"></iframe>`,
    '',
    '## Video-Agent Analysis Packet',
    '',
    '```json',
    JSON.stringify(packet, null, 2),
    '```',
    '',
  ].join('\n')
}

const readWorkspacePathName = (workspacePath: string): string => {
  const parts = String(workspacePath || '').split('/').filter(Boolean)
  return String(parts[parts.length - 1] || '').trim() || 'strybldr-video.md'
}

const readWorkspacePathParent = (workspacePath: string): string => {
  const parts = String(workspacePath || '').split('/').filter(Boolean)
  const parent = parts.slice(0, -1).join('/')
  return parent ? `/${parent}` : WORKSPACE_ROOT_PATH
}

const publishGeneratedStrybldrHandoffIfEnabled = async (args: {
  path: string
  text: string
}): Promise<void> => {
  try {
    const { readAgenticGraphStorageRuntimeSyncEnabled } = await import('@/features/source-files/sourceFilesAgenticGraphStorageSettings')
    if (!readAgenticGraphStorageRuntimeSyncEnabled()) return
    const { publishGeneratedWorkspaceEntriesToAgenticGraphStorage } = await import('@/features/source-files/sourceFileShareUrl')
    await publishGeneratedWorkspaceEntriesToAgenticGraphStorage({
      entries: [{
        kind: 'file',
        path: args.path,
        parentPath: readWorkspacePathParent(args.path),
        name: readWorkspacePathName(args.path),
        text: args.text,
        updatedAtMs: Date.now(),
      }],
    })
  } catch {
    void 0
  }
}

export async function createStrybldrLocalVideoArtifactFromGraphData(
  graphData: GraphData | null | undefined,
): Promise<StrybldrLocalVideoArtifactResult> {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const handoff = buildStrybldrVideoHandoffFromGraphData(graphData)
  if (handoff.cards.length === 0 || !handoff.prompt) {
    return { ok: false, reason: 'No approved Strybldr cards to send.' }
  }
  if (!handoff.localAnimaticHtml) {
    return { ok: false, reason: 'No local Strybldr animatic could be generated.' }
  }
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const text = buildStrybldrVideoHandoffMarkdown({
    handoff,
    status: 'generated',
    provider: 'agenticgraph-local-animatic',
    model: 'strybldr-local-animatic-v1',
    renderUrl: handoff.renderVideoUrl,
    sourceUrl: handoff.sourceVideoUrl,
    elapsedMs: now - started,
    paidCallCount: 0,
    cacheHit: false,
  })
  const videoAgentAnalysisMarkdown = buildVideoAgentAnalysisPacketMarkdown(handoff.sourceVideoUrl)
  const artifactText = [text, videoAgentAnalysisMarkdown].filter(Boolean).join('\n')
  const path = await fs.createFile({
    parentPath: WORKSPACE_ROOT_PATH,
    name: `strybldr-video-${Date.now().toString(36)}.md`,
    text: artifactText,
  })
  notifyWorkspaceFsChanged({ op: 'createFile', path })
  await publishGeneratedStrybldrHandoffIfEnabled({ path, text: artifactText })
  return { ok: true, path, cardCount: handoff.cards.length, videoAgentAnalysis: Boolean(videoAgentAnalysisMarkdown) }
}
