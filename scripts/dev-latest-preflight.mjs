import { createServer } from 'node:net'
import { syncDevCanonicalSources } from './sync-dev-canonical-sources.mjs'

export const CANONICAL_DEV_SERVER = Object.freeze({
  host: '127.0.0.1',
  port: 5173,
})

export const assertDevServerPortAvailable = ({
  host = CANONICAL_DEV_SERVER.host,
  port = CANONICAL_DEV_SERVER.port,
  createServerImpl = createServer,
} = {}) => new Promise((resolve, reject) => {
  const server = createServerImpl()
  const finish = error => {
    server.removeAllListeners()
    if (error) reject(error)
    else resolve()
  }

  server.once('error', error => {
    const detail = error && typeof error === 'object' && 'code' in error
      ? String(error.code || '').trim()
      : ''
    finish(new Error(
      `canonical Dev port ${host}:${port} is unavailable${detail ? ` (${detail})` : ''}; `
      + 'stop the existing runtime before running npm run dev:latest. No source checkout was updated.',
    ))
  })
  server.once('listening', () => {
    server.close(error => finish(error || null))
  })
  server.listen({ host, port, exclusive: true })
})

export const prepareDevLatest = async ({
  portPreflight = assertDevServerPortAvailable,
  syncSources = syncDevCanonicalSources,
} = {}) => {
  await portPreflight()
  return syncSources()
}
