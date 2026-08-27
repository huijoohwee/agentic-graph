const DEVICE_ID_PATTERN = /^dev:[A-Za-z0-9:-]{16,128}$/

const encodeHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export const normalizeKnowgrphClientDeviceId = (value: unknown): string => {
  const deviceId = String(value || '').trim()
  return DEVICE_ID_PATTERN.test(deviceId) ? deviceId : ''
}

export async function deriveAuthenticatedDevicePrincipalId(args: {
  deviceId: string
  workspaceId: string
  userId: string
}): Promise<string> {
  const normalizedDeviceId = normalizeKnowgrphClientDeviceId(args.deviceId)
  const workspaceId = String(args.workspaceId || '').trim()
  const userId = String(args.userId || '').trim()
  if (!normalizedDeviceId || !workspaceId || !userId) {
    throw new Error('valid authenticated client device scope is required')
  }
  const payload = new TextEncoder().encode([
    'knowgrph-authenticated-device-principal/v1',
    workspaceId,
    userId,
    normalizedDeviceId,
  ].join('\n'))
  const digest = await crypto.subtle.digest('SHA-256', payload)
  return encodeHex(new Uint8Array(digest))
}
