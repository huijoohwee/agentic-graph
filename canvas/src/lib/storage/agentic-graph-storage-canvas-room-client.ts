import { readEnvString } from '@/lib/config.env'
import { buildAgenticGraphStorageAbsoluteUrl } from '@/lib/storage/agentic-graph-storage-chat-client'
import { getAgenticGraphStorageDeviceId } from '@/lib/storage/agentic-graph-storage-device-identity'
import { buildAgenticGraphStorageCanvasRoomPath } from '@/lib/storage/agentic-graph-storage-sync-contract'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type AgenticGraphStorageCanvasRoomConfig = {
  baseUrl: string
  workspaceId: string
  sessionToken: string
  deviceId: string
}

export const readAgenticGraphStorageCanvasRoomConfig = (): AgenticGraphStorageCanvasRoomConfig | null => {
  const baseUrl = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', ''))
  const workspaceId = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID', ''))
  const sessionToken = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN', ''))
  if (!baseUrl || !workspaceId || !sessionToken) return null
  return { baseUrl, workspaceId, sessionToken, deviceId: getAgenticGraphStorageDeviceId() }
}

export const buildAgenticGraphStorageCanvasRoomAbsoluteUrl = (
  config: AgenticGraphStorageCanvasRoomConfig,
  roomId: string,
): string | null => {
  return buildAgenticGraphStorageAbsoluteUrl(
    config.baseUrl,
    buildAgenticGraphStorageCanvasRoomPath(config.workspaceId, roomId),
  )
}

export const buildAgenticGraphStorageCanvasRoomWebSocketUrl = (
  config: AgenticGraphStorageCanvasRoomConfig,
  roomId: string,
): string | null => {
  const absoluteUrl = buildAgenticGraphStorageCanvasRoomAbsoluteUrl(config, roomId)
  if (!absoluteUrl) return null
  try {
    const url = new URL(absoluteUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('kg_session_token', config.sessionToken)
    url.searchParams.set('kg_device_id', config.deviceId)
    return url.toString()
  } catch {
    return null
  }
}
