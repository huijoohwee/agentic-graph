export const AGENTIC_OS_STORAGE_ROUTE_PATHS = {
  push: '/api/storage/push',
  pull: '/api/storage/pull',
  mediaCapability: '/api/storage/media-capabilities',
  collabSave: '/api/storage/collab/save',
  browserSession: '/api/storage/auth/session',
  browserLogin: '/api/storage/auth/login',
  browserLogout: '/api/storage/auth/logout',
  canvasRoomPrefix: '/api/storage/canvas-room/',
  chatSession: '/api/storage/chat/session',
  chatRelay: '/api/storage/chat/relay',
  relayCapabilities: '/api/storage/relay/capabilities',
  gitRelay: '/api/storage/git/relay',
  fileSyncRelay: '/api/storage/file-sync/relay',
  knowledgeSourceHandoff: '/api/storage/knowledge-source/handoff',
  knowledgeSourceRead: '/api/storage/knowledge-source/read',
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

export const buildAgenticGraphCollaborationSavePath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.collabSave

/**
 * Browser session routes deliberately live beside (rather than inside) the
 * bearer-token chat routes.  They authenticate with a same-origin HttpOnly
 * cookie and never need a token exposed to Canvas code.
 */
export const buildAgenticGraphStorageBrowserSessionPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.browserSession

export const buildAgenticGraphStorageBrowserLoginPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogin

export const buildAgenticGraphStorageBrowserLogoutPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.browserLogout

export const buildAgenticGraphStorageCanvasRoomPath = (workspaceId: string, roomId: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.canvasRoomPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(roomId || '').trim())}`

export const buildAgenticGraphStorageChatSessionPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.chatSession

export const buildAgenticGraphStorageChatRelayPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.chatRelay

export const buildAgenticGraphStorageRelayCapabilitiesPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.relayCapabilities

export const buildAgenticGraphStorageGitRelayPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.gitRelay

export const buildAgenticGraphStorageFileSyncRelayPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.fileSyncRelay

export const buildAgenticGraphKnowledgeSourceHandoffPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceHandoff

export const buildAgenticGraphKnowledgeSourceReadPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.knowledgeSourceRead

export const buildAgenticGraphStorageChatPoliciesPath = (workspaceId: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.chatPoliciesPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildAgenticGraphStorageChatAuditPath = (workspaceId: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.chatAuditPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildAgenticGraphStorageExportPath = (workspaceId: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.exportPrefix}${encodeURIComponent(String(workspaceId || '').trim())}`

export const buildAgenticGraphStorageDocPath = (workspaceId: string, canonicalPath: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildAgenticGraphStorageDefaultDocPath = (canonicalPath: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.defaultDocPrefix}${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildAgenticGraphStorageBlobPath = (workspaceId: string, canonicalPath: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.blobPrefix}${encodeURIComponent(String(workspaceId || '').trim())}/${encodeURIComponent(String(canonicalPath || '').trim())}`

export const buildAgenticGraphStorageMediaPath = (objectKey: string): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.mediaPrefix}${String(objectKey || '').trim().split('/').map(encodeURIComponent).join('/')}`

export const buildAgenticGraphStorageMediaAssetPersistPath = (): string =>
  AGENTIC_OS_STORAGE_ROUTE_PATHS.mediaAssetPersist

export const buildAgenticGraphStorageMediaAssetListPath = (workspaceId: string, limit = 50): string =>
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.mediaAssetPersist}?workspaceId=${encodeURIComponent(String(workspaceId || '').trim())}&limit=${encodeURIComponent(String(limit))}`

export const buildAgenticGraphStorageSourceFilesIndexPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `${AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix}${encodeURIComponent(normalizedWorkspaceId)}`
    : AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndex
}

export const buildAgenticGraphStorageLlmsPath = (workspaceId?: string | null): string => {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  return normalizedWorkspaceId
    ? `${buildAgenticGraphStorageSourceFilesIndexPath(normalizedWorkspaceId)}/llms.txt`
    : AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesLlms
}

export const buildAgenticGraphStorageCursorId = (workspaceId: string, deviceId: string): string =>
  `${String(workspaceId || '').trim()}:${String(deviceId || '').trim()}`

export const buildAgenticGraphStorageOutboxId = (prefix = 'mut'): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}
