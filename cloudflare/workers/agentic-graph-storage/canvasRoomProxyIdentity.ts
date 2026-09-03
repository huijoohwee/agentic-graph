import {
  deriveAuthenticatedDevicePrincipalId,
  normalizeAgenticGraphClientDeviceId,
} from './devicePrincipal'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type AgenticGraphCanvasRoomProxyIdentity = {
  workspaceId: string
  roomId: string
  websocketUpgrade: boolean
  clientDeviceId: string
  deviceIdValid: boolean
}

export function readAgenticGraphCanvasRoomProxyIdentity(
  request: Request,
  routePrefix: string,
): AgenticGraphCanvasRoomProxyIdentity | null {
  const requestUrl = new URL(request.url)
  if (!requestUrl.pathname.startsWith(routePrefix)) return null
  const segments = requestUrl.pathname.slice(routePrefix.length).split('/').filter(Boolean)
  if (segments.length !== 2) return null
  let workspaceId = ''
  let roomId = ''
  try {
    workspaceId = normalizeString(decodeURIComponent(segments[0] || ''))
    roomId = normalizeString(decodeURIComponent(segments[1] || ''))
  } catch {
    return null
  }
  if (!workspaceId || !roomId) return null
  const websocketUpgrade = normalizeString(request.headers.get('upgrade')).toLowerCase() === 'websocket'
  const clientDeviceId = normalizeAgenticGraphClientDeviceId(requestUrl.searchParams.get('agentic_os_device_id'))
  return {
    workspaceId,
    roomId,
    websocketUpgrade,
    clientDeviceId,
    deviceIdValid: !websocketUpgrade || Boolean(clientDeviceId),
  }
}

export const deriveAgenticGraphCanvasRoomDevicePrincipalId = (
  identity: AgenticGraphCanvasRoomProxyIdentity,
  authenticatedUserId: string,
): Promise<string | null> => identity.clientDeviceId
  ? deriveAuthenticatedDevicePrincipalId({
      deviceId: identity.clientDeviceId,
      workspaceId: identity.workspaceId,
      userId: authenticatedUserId,
    })
  : Promise.resolve(null)
