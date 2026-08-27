import {
  buildKnowgrphStorageCanvasRoomAbsoluteUrl,
  buildKnowgrphStorageCanvasRoomWebSocketUrl,
  readKnowgrphStorageCanvasRoomConfig,
} from '@/lib/storage/knowgrphStorageCanvasRoomClient'

export const testKnowgrphStorageCanvasRoomClientBuildsAuthenticatedRoomUrls = () => {
  const config = {
    baseUrl: 'https://airvio.co/knowgrph',
    workspaceId: 'kgws:test-room',
    sessionToken: 'sess_test_token',
    deviceId: 'dev:device-a-1234567890',
  }
  const absoluteUrl = buildKnowgrphStorageCanvasRoomAbsoluteUrl(config, 'workspace:/docs/example.md')
  const websocketUrl = buildKnowgrphStorageCanvasRoomWebSocketUrl(config, 'workspace:/docs/example.md')
  if (absoluteUrl !== 'https://airvio.co/api/storage/canvas-room/kgws%3Atest-room/workspace%3A%2Fdocs%2Fexample.md') {
    throw new Error(`expected absolute room URL to resolve against storage origin, got ${absoluteUrl}`)
  }
  if (websocketUrl !== 'wss://airvio.co/api/storage/canvas-room/kgws%3Atest-room/workspace%3A%2Fdocs%2Fexample.md?kg_session_token=sess_test_token&kg_device_id=dev%3Adevice-a-1234567890') {
    throw new Error(`expected websocket room URL to promote to wss and include session token query, got ${websocketUrl}`)
  }
}

export const testKnowgrphStorageCanvasRoomClientReadsConfigFromStorageEnv = () => {
  const previousBaseUrl = process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
  const previousSessionToken = process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  try {
    process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = 'https://airvio.co/knowgrph'
    process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = 'kgws:test-room'
    process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = 'sess_test_token'
    const config = readKnowgrphStorageCanvasRoomConfig()
    if (!config || config.baseUrl !== 'https://airvio.co/knowgrph' || config.workspaceId !== 'kgws:test-room' || config.sessionToken !== 'sess_test_token' || !config.deviceId.startsWith('dev:')) {
      throw new Error(`expected storage canvas room config to hydrate from Vite env, got ${JSON.stringify(config)}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_KNOWGRPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_KNOWGRPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_KNOWGRPH_STORAGE_WORKSPACE_ID
    if (typeof previousSessionToken === 'string') process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN = previousSessionToken
    else delete process.env.VITE_KNOWGRPH_STORAGE_CHAT_SESSION_TOKEN
  }
}
