export const KNOWGRPH_STORAGE_ROUTE_PATHS = {
  push: '/api/storage/push',
  pull: '/api/storage/pull',
  collabSave: '/api/storage/collab/save',
  canvasRoomPrefix: '/api/storage/canvas-room/',
  chatSession: '/api/storage/chat/session',
  chatRelay: '/api/storage/chat/relay',
  gitRelay: '/api/storage/git/relay',
  fileSyncRelay: '/api/storage/file-sync/relay',
  chatPoliciesPrefix: '/api/storage/chat/policies/',
  chatAuditPrefix: '/api/storage/chat/audit/',
  exportPrefix: '/api/storage/export/',
  docPrefix: '/api/storage/doc/',
  defaultDocPrefix: '/api/storage/doc-default/',
  blobPrefix: '/api/storage/blob/',
  mediaAssetPersist: '/api/storage/media/assets',
  mediaAssetPrefix: '/api/storage/media/assets/',
  mediaPrefix: '/api/storage/media/',
  sourceFilesIndex: '/api/storage/source-files',
  sourceFilesIndexPrefix: '/api/storage/source-files/',
  sourceFilesLlms: '/api/storage/llms.txt',
} as const

export const buildKnowgrphCollaborationSavePath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.collabSave

export const buildKnowgrphStorageCanvasRoomPath = (workspaceId: string, roomId: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.canvasRoomPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(roomId || '').trim())}`

export const buildKnowgrphStorageChatSessionPath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.chatSession

export const buildKnowgrphStorageChatRelayPath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.chatRelay

export const buildKnowgrphStorageGitRelayPath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.gitRelay

export const buildKnowgrphStorageFileSyncRelayPath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.fileSyncRelay

export const buildKnowgrphStorageChatPoliciesPath = (workspaceId: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.chatPoliciesPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildKnowgrphStorageChatAuditPath = (workspaceId: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.chatAuditPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildKnowgrphStorageExportPath = (workspaceId: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.exportPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildKnowgrphStorageDocPath = (workspaceId: string, canonicalPath: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildKnowgrphStorageDefaultDocPath = (canonicalPath: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.defaultDocPrefix}${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildKnowgrphStorageBlobPath = (workspaceId: string, canonicalPath: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.blobPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildKnowgrphStorageMediaPath = (objectKey: string): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.mediaPrefix}${String(objectKey || '').trim().split('/').map(encodeURIComponent).join('/')}`

export const buildKnowgrphStorageMediaAssetPersistPath = (): string =>
  KNOWGRPH_STORAGE_ROUTE_PATHS.mediaAssetPersist

export const buildKnowgrphStorageMediaAssetListPath = (workspaceId: string, limit = 50): string =>
  `${KNOWGRPH_STORAGE_ROUTE_PATHS.mediaAssetPersist}?workspaceId=${encodeURIComponent(String(workspaceId || '').trim())}&limit=${encodeURIComponent(String(limit))}`

export const buildKnowgrphStorageSourceFilesIndexPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `${KNOWGRPH_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix}${encodeURIComponent(normalizedWorkspaceId)}`
    : KNOWGRPH_STORAGE_ROUTE_PATHS.sourceFilesIndex
}

export const buildKnowgrphStorageLlmsPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `${buildKnowgrphStorageSourceFilesIndexPath(normalizedWorkspaceId)}/llms.txt`
    : KNOWGRPH_STORAGE_ROUTE_PATHS.sourceFilesLlms
}

export const buildKnowgrphStorageCursorId = (workspaceId: string, deviceId: string): string =>
  `${String(workspaceId || '').trim()}:${String(deviceId || '').trim()}`

export const buildKnowgrphStorageOutboxId = (prefix = 'mut'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}
