import { apiRoute } from './operator'
import { json, safeResponse } from './validation'

const purgeExpired = async (db: D1Database): Promise<void> => {
  const now = new Date().toISOString()
  for (let batch = 0; batch < 10; batch++) {
    const rows = await db.prepare(
      'SELECT request_id FROM order_requests WHERE retain_until <= ? ORDER BY retain_until LIMIT 100',
    ).bind(now).all<{ request_id: string }>()
    const ids = (rows.results ?? []).map(row => row.request_id)
    if (ids.length === 0) break
    const placeholders = ids.map(() => '?').join(', ')
    await db.batch([
      db.prepare(
        'DELETE FROM operator_events WHERE object_id IN (' + placeholders + ')',
      ).bind(...ids),
      db.prepare(
        'DELETE FROM request_status_history WHERE request_id IN (' + placeholders + ')',
      ).bind(...ids),
      db.prepare(
        'DELETE FROM order_requests WHERE request_id IN (' + placeholders + ')',
      ).bind(...ids),
    ])
  }
  await db.prepare('DELETE FROM request_rate_limits WHERE expires_at <= ?').bind(now).run()
}

const appPath = (pathname: string, basePath: string): string | null => {
  if (!basePath) return pathname
  if (pathname === basePath) return '/'
  if (pathname.startsWith(basePath + '/')) return pathname.slice(basePath.length) || '/'
  return null
}

const assetResponse = async (request: Request, env: Env, path: string): Promise<Response> => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(404, { error: 'Page not found.' })
  const assetPath = path === '/' ? '/index.html' : path
  const url = new URL(request.url)
  url.pathname = assetPath
  const assetRequest = new Request(url, request)
  const response = await env.ASSETS.fetch(assetRequest)
  return safeResponse(response, response.headers.get('content-type')?.includes('text/html') ?? false)
}

const fetchHandler = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url)
  const basePath = (env.APP_BASE_PATH ?? '').replace(/\/+$/u, '')
  const path = appPath(url.pathname, basePath)
  if (path === null) return fetch(request)
  if (basePath && url.pathname === basePath) {
    url.pathname = basePath + '/'
    return Response.redirect(url.toString(), 308)
  }
  try {
    if (path.startsWith('/api/')) return await apiRoute(request, env, path)
    return await assetResponse(request, env, path)
  } catch {
    return json(503, { error: 'The shop is temporarily unavailable. Try again later.' })
  }
}

export default {
  fetch: fetchHandler,
  scheduled(_event: ScheduledEvent, env: Env, context: ExecutionContext) {
    context.waitUntil(purgeExpired(env.DB))
  },
}
