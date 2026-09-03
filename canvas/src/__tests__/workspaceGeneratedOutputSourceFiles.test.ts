import type { SourceFile } from '@/hooks/store/types'
import { mergeWorkspaceEntriesIntoSourceFiles } from '@/features/workspace-fs/syncToSourceFiles'

export function testWorkspaceSourceFilesSyncPreservesSequentialGeneratedArtifactsWithoutBackfillingEmptyMarkdown() {
  const generatedPaths = [
    '/workspace/video-agent-input.md',
    '/workspace/video-agent-input-text-output.md',
    '/workspace/video-agent-input-image.png',
    '/workspace/video-agent-input-image-output.md',
  ]
  const existing: SourceFile[] = [
    {
      id: 'input',
      name: 'video-agent-input.md',
      text: '# Input',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: `workspace:${generatedPaths[0]}` },
    },
    {
      id: 'text-output',
      name: 'video-agent-input-text-output.md',
      text: '# Generated text',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: `workspace:${generatedPaths[1]}` },
    },
    {
      id: 'image-output',
      name: 'video-agent-input-image.png',
      text: '',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: `workspace:${generatedPaths[2]}` },
    },
    {
      id: 'image-manifest',
      name: 'video-agent-input-image-output.md',
      text: '# Generated image manifest',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: `workspace:${generatedPaths[3]}` },
    },
    {
      id: 'failed-empty-chat',
      name: 'agenticOs_failed.md',
      text: '',
      enabled: true,
      status: 'idle',
      source: { kind: 'local', path: 'workspace:/chat-log/failed/agenticOs_failed.md' },
    },
  ]
  const videoPath = '/workspace/video-agent-input-video.mp4'
  const videoManifestPath = '/workspace/video-agent-input-video-output.md'
  const next = mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries: [
      { kind: 'file', path: videoPath, parentPath: '/workspace', name: 'video-agent-input-video.mp4', updatedAtMs: 2 },
      { kind: 'file', path: videoManifestPath, parentPath: '/workspace', name: 'video-agent-input-video-output.md', text: '# Generated video manifest', updatedAtMs: 2 },
    ],
    sourcesByPath: {},
    forceIncludePaths: [videoPath, videoManifestPath],
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs', '/chat-log'],
  })

  const visiblePaths = new Set(next.map(file => String(file.source?.path || '')))
  for (const path of [...generatedPaths, videoPath, videoManifestPath]) {
    if (!visiblePaths.has(`workspace:${path}`)) {
      throw new Error(`expected sequential generated artifact ${path} to remain visible in Source Files`)
    }
  }
  if (visiblePaths.has('workspace:/chat-log/failed/agenticOs_failed.md')) {
    throw new Error('expected empty historical markdown evidence to remain excluded instead of being backfilled')
  }
}
