import { joinWorkspacePath, normalizeWorkspacePath, WORKSPACE_ROOT_PATH } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'

export const VIDEO_AGENT_WORKSPACE_OUTPUT_ROOT_PATH = '/docs_' as WorkspacePath
export const VIDEO_AGENT_WORKSPACE_OUTPUT_DIR_PATH = '/docs_/video-agent' as WorkspacePath

export const normalizeVideoAgentWorkspaceOutputRootPath = (path?: WorkspacePath | string | null): WorkspacePath => {
  const normalizedPath = normalizeWorkspacePath(path || '')
  return normalizedPath === WORKSPACE_ROOT_PATH ? VIDEO_AGENT_WORKSPACE_OUTPUT_DIR_PATH : normalizedPath
}

export const buildVideoAgentWorkspaceOutputPath = (
  name: string,
  outputRootPath: WorkspacePath = VIDEO_AGENT_WORKSPACE_OUTPUT_DIR_PATH,
): WorkspacePath => joinWorkspacePath(normalizeVideoAgentWorkspaceOutputRootPath(outputRootPath), name)

export const buildVideoAgentWorkspaceOutputArtifactPath = (
  path: WorkspacePath | string,
  outputRootPath: WorkspacePath,
): WorkspacePath => buildVideoAgentWorkspaceOutputPath(String(path || '').split('/').filter(Boolean).pop() || 'artifact.json', outputRootPath)
