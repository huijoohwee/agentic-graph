export const AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX = 'airvio'

/** Shared by the browser and Worker; workspace labels never become path segments. */
export const buildAgenticGraphStorageMediaWorkspace = async (
  workspaceId: string,
): Promise<{ key: string; prefix: string }> => {
  const normalized = String(workspaceId || '').trim()
  if (!normalized) throw new Error('media workspace is required')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return { key, prefix: `${AGENTIC_OS_STORAGE_R2_MEDIA_OBJECT_PREFIX}/workspaces/${key}` }
}

export class AgenticGraphStorageMediaWorkspaceError extends Error {
  constructor() { super('media writes require the authenticated workspace namespace') }
}

export const assertAgenticGraphStorageMediaWriteKey = async (
  workspaceId: string,
  objectKey: string,
): Promise<void> => {
  const { key, prefix } = await buildAgenticGraphStorageMediaWorkspace(workspaceId)
  if (!objectKey.startsWith(`${prefix}/runs/${key}-`)) throw new AgenticGraphStorageMediaWorkspaceError()
}
