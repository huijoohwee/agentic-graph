import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { formatWorkspaceImportTranscriptStatusLine } from '@/features/markdown-workspace/workspaceImport/transcriptImportText'
import { resolveDownloadedMediaAccessUrl } from '@/lib/url'
import type { RemoteMarkdownConversionResult } from '@/lib/net/remoteMarkdownConversions'
import { getYouTubeId } from 'grph-shared/rich-media/providers'
import type { VideoDownloadResultOk } from './types'

export type RegisterVideoDownloadResult =
  | { ok: true; workspacePath: WorkspacePath }
  | { ok: false; error: string }

const stripLeadingTranscriptPresentation = (markdown: string): string => {
  let text = String(markdown || '').replace(/\r/g, '')
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4)
    if (end >= 0) text = text.slice(end + 5)
  }
  const lines = text.split('\n')
  while (lines[0] && !lines[0].trim()) lines.shift()
  if (/^#\s+/.test(lines[0] || '')) {
    lines.shift()
    while (lines[0] && !lines[0].trim()) lines.shift()
  }
  if (
    /^\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)\s*$/.test(lines[0] || '')
    || /^!\[[^\]]*\]\([^)]+\)\s*$/.test(lines[0] || '')
  ) {
    lines.shift()
    while (lines[0] && !lines[0].trim()) lines.shift()
  }
  return lines.join('\n').trim()
}

async function buildDownloadTranscriptSection(args: {
  result: VideoDownloadResultOk
  fetchYouTubeTranscript?: (url: string) => Promise<RemoteMarkdownConversionResult | null>
}): Promise<string[]> {
  const sourceUrl = String(args.result.sourceUrl || '').trim()
  if (!getYouTubeId(sourceUrl)) return []
  const fetchYouTubeTranscript = args.fetchYouTubeTranscript || (async (url: string) => {
    const { fetchYouTubeTranscriptMarkdown } = await import('@/lib/net/remoteMarkdownConversions')
    return fetchYouTubeTranscriptMarkdown(url)
  })
  const converted = await fetchYouTubeTranscript(sourceUrl)
  if (converted?.ok === true) {
    const transcriptBody = stripLeadingTranscriptPresentation(converted.markdown)
    if (transcriptBody) return ['', '## Transcript', '', transcriptBody]
  }
  const transcriptStatus = converted?.ok === false
    ? formatWorkspaceImportTranscriptStatusLine(converted.error)
    : formatWorkspaceImportTranscriptStatusLine('Transcript unavailable')
  return ['', '## Transcript', '', transcriptStatus]
}

async function buildDownloadDocumentText(args: {
  result: VideoDownloadResultOk
  fetchYouTubeTranscript?: (url: string) => Promise<RemoteMarkdownConversionResult | null>
}): Promise<string> {
  const result = args.result
  const fileUrl = resolveDownloadedMediaAccessUrl(result)
  const transcriptSection = await buildDownloadTranscriptSection(args)
  return [
    '---',
    `kgVideoDownloadFileName: ${JSON.stringify(result.fileName)}`,
    `kgVideoDownloadFilePath: ${JSON.stringify(result.filePath)}`,
    ...(fileUrl ? [`kgVideoDownloadFileUrl: ${JSON.stringify(fileUrl)}`] : []),
    `kgVideoDownloadMimeType: ${JSON.stringify(result.mimeType)}`,
    `kgVideoDownloadSizeBytes: ${result.sizeBytes}`,
    `kgVideoDownloadSourceUrl: ${JSON.stringify(result.sourceUrl)}`,
    '---',
    '',
    `# ${result.fileName}`,
    '',
    ...(fileUrl ? [`![video](${fileUrl})`, '', `[Open local video](${fileUrl})`, ''] : []),
    `File name: ${result.fileName}`,
    `File path: ${result.filePath}`,
    ...(fileUrl ? [`File URL: ${fileUrl}`] : []),
    `MIME type: ${result.mimeType}`,
    `Size bytes: ${result.sizeBytes}`,
    `Source URL: ${result.sourceUrl}`,
    ...transcriptSection,
  ].join('\n')
}

export async function registerVideoDownloadInWorkspace(args: {
  result: VideoDownloadResultOk
  fs?: WorkspaceFs
  fetchYouTubeTranscript?: (url: string) => Promise<RemoteMarkdownConversionResult | null>
}): Promise<RegisterVideoDownloadResult> {
  try {
    const [
      { getWorkspaceFs },
      { WORKSPACE_ROOT_PATH },
      { setWorkspaceEntrySource },
      { notifyWorkspaceFsChanged },
      { upsertWorkspaceTextDocument },
    ] = await Promise.all([
      import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
      import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
      import('@/features/workspace-fs/sourceIndex') as Promise<typeof import('@/features/workspace-fs/sourceIndex')>,
      import('@/features/workspace-fs/workspaceFsEvents') as Promise<typeof import('@/features/workspace-fs/workspaceFsEvents')>,
      import('@/features/workspace-fs/upsertWorkspaceTextDocument') as Promise<typeof import('@/features/workspace-fs/upsertWorkspaceTextDocument')>,
    ])
    const fs = args.fs || await getWorkspaceFs()
    const workspacePath = await upsertWorkspaceTextDocument({
      fs,
      parentPath: WORKSPACE_ROOT_PATH,
      name: `${args.result.fileName}.md`,
      text: await buildDownloadDocumentText(args),
    })
    setWorkspaceEntrySource(workspacePath, { kind: 'url', url: args.result.sourceUrl })
    notifyWorkspaceFsChanged({ op: 'writeFileText', path: workspacePath })
    return { ok: true, workspacePath }
  } catch (error) {
    return { ok: false, error: String((error as { message?: unknown })?.message ?? error) }
  }
}
