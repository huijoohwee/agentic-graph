import { readYamlFrontmatterMermaidDiagramCodes } from '@/lib/mermaid/mermaidDiagramCode'
import { resolveMermaidGanttCode } from '@/lib/mermaid/mermaidGitGraph'
import { readVideoSequenceTimelineModelFromMarkdown } from '@/components/timeline/videoSequenceTimeline'
import { buildVideoSequenceExportPlan, resolveTimelinePlanPositionFromSourceTime } from '@/components/timeline/timelinePlanSync'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readVideoSequenceSourceAnnotations, resolveVideoSequenceSourceAnnotations, resolveVideoSequenceAnnotationTimelinePosition } from '@/components/timeline/videoSequenceSourceAnnotations'
import { requestRichMediaTimelineTargetFrame } from '@/lib/render/richMediaTimelineSync'
import { normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { websiteSourceBundlePath } from '@/lib/websites/websitePathUtils'
import type { SavedFrameRequest } from '@/lib/rich-media/savedVideoFrameSelection'

function readTimeline(text: string) {
  const sources = readVideoSequenceTimelineModelFromMarkdown(text)?.sources || []
  if (!sources.length) return null
  const code = resolveMermaidGanttCode(readYamlFrontmatterMermaidDiagramCodes(text, 'gantt'))
  const associations = readVideoSequenceSourceAnnotations(text)
  const groups = resolveVideoSequenceSourceAnnotations({ associations, sources, taskSpans: buildMermaidGanttTimelineModel(code).taskSpans })
  return { sources, groups, plan: buildVideoSequenceExportPlan({ code, sources }) }
}

// Retain one parsed timeline while a reader moves between cues in the same document.
let cached: { text: string; timeline: ReturnType<typeof readTimeline> } | undefined
function timelineFor(text: string) {
  if (cached?.text !== text) cached = { text, timeline: readTimeline(text) }
  return cached.timeline
}

export function savedFrameTimelineTarget(text: string, request: SavedFrameRequest, preferredPositionMinutes: number) {
  const timeline = timelineFor(text)
  const source = timeline?.sources.find(candidate => candidate.sourceUrl === request.sourceUrl)
  if (!timeline || !source) return null
  const { plan, groups } = timeline
  const matches = groups.filter(group => group.association.sourceId === source.id).flatMap(group => {
    const position = resolveVideoSequenceAnnotationTimelinePosition(group, request.seconds)
    return position === null ? [] : [{ position, overlayId: group.association.frameAnalysisNodeId }]
  })
  if (matches.length) return matches.reduce((best, next) =>
    Math.abs(next.position - preferredPositionMinutes) < Math.abs(best.position - preferredPositionMinutes) ? next : best)
  const duration = source.durationSeconds
  if (!duration || !plan || !plan.segments.some(segment => segment.source === source &&
    request.seconds >= segment.sourceStartRatio * duration - 0.0005 && request.seconds <= segment.sourceEndRatio * duration + 0.0005)) return null
  const position = resolveTimelinePlanPositionFromSourceTime({ plan, source, currentTimeSeconds: request.seconds,
    preferredPositionMinutes, sourceDurationSeconds: duration })
  if (position === null) return null
  return { position, overlayId: undefined }
}

export function resolveSavedFrameDocument(entries: WorkspaceEntry[], request: SavedFrameRequest) {
  const path = normalizeWorkspacePath(request.documentPath)
  const folder = request.documentPath ? path.slice(0, path.lastIndexOf('/')) || '/' : websiteSourceBundlePath(request.sourceUrl)
  const entry = entries.find(file => file.parentPath === folder && file.kind === 'file' && /(?:\.video-agent\.md|video-sequence\.timeline\.md)$/i.test(file.name))
  return entry && { path: entry.path, key: workspaceDocumentKey(entry.path) }
}

// Explorer already applies a selected file to the graph. Wait for that owner to commit
// the document before seeking, so the previous file cannot reset its transport.
export async function activateSavedFrameDocument(path: string, key: string, current: () => boolean) {
  const [{ useGraphStore }, { useMarkdownExplorerStore }] = await Promise.all([
    import('@/hooks/useGraphStore'), import('@/features/markdown-explorer/store'),
  ])
  if (!current()) return
  useMarkdownExplorerStore.getState().setActivePath(path)
  await new Promise<void>((resolve, reject) => {
    const finish = (message?: string) => {
      stopGraph()
      stopExplorer()
      clearTimeout(deadline)
      if (message) reject(new Error(message))
      else resolve()
    }
    const check = () => {
      if (!current() || useMarkdownExplorerStore.getState().activePath !== path) finish('The selected source changed before seeking.')
      else if (useGraphStore.getState().markdownDocumentName === key) finish()
    }
    const stopGraph = useGraphStore.subscribe(check)
    const stopExplorer = useMarkdownExplorerStore.subscribe(check)
    const deadline = setTimeout(() => finish('The source timeline did not finish opening.'), 15000)
    check()
  })
}

export async function seekSavedVideoFrame(request: SavedFrameRequest, frameSampleUrl: string, current: () => boolean) {
  const { useGraphStore } = await import('@/hooks/useGraphStore')
  if (!current()) return
  const initial = useGraphStore.getState()
  let documentKey = initial.markdownDocumentName || ''
  let target = savedFrameTimelineTarget(initial.markdownDocumentText || '', request, initial.timelineTransportPosition)
  if (!target) {
    if (timelineFor(initial.markdownDocumentText || '')?.sources.some(source => source.sourceUrl === request.sourceUrl))
      throw new Error('This timestamp is outside the active source timeline.')
    const [{ getWorkspaceFs }, { useMarkdownExplorerStore }] = await Promise.all([
      import('@/features/workspace-fs/workspaceFs'), import('@/features/markdown-explorer/store'),
    ])
    const activePath = useMarkdownExplorerStore.getState().activePath
    const fs = await getWorkspaceFs()
    const entry = resolveSavedFrameDocument(await fs.listEntries(), request)
    const text = entry && await fs.readFileText(entry.path)
    if (!entry || !text || !current() || useMarkdownExplorerStore.getState().activePath !== activePath) throw new Error('The source timeline is unavailable.')
    target = savedFrameTimelineTarget(text, request, 0)
    if (!target) throw new Error('This timestamp is outside the source timeline.')
    documentKey = entry.key
    if (activePath) {
      await activateSavedFrameDocument(entry.path, documentKey, current)
    } else {
      const activated = await initial.setActiveMarkdownDocument({ name: documentKey, text, sourceUrl: null, applyToGraph: true,
        applyViewPreset: false, expectedCurrentDocumentName: initial.markdownDocumentName, expectedCurrentDocumentText: initial.markdownDocumentText })
      if (!activated) throw new Error('The active document changed before seeking.')
    }
  }
  const state = useGraphStore.getState()
  if (!current()) return
  if (state.markdownDocumentName !== documentKey) throw new Error('The active document changed before seeking.')
  state.setTimelineTransportState({ documentKey, playing: false, position: target.position })
  if (target.overlayId) requestRichMediaTimelineTargetFrame({ documentKey, overlayId: target.overlayId, sourceUrl: request.sourceUrl,
    position: target.position, sourceTimestampMs: Math.round(request.seconds * 1000), frameSampleUrl })
}
