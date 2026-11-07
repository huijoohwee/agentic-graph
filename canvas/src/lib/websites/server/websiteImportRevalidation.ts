import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { readWebsiteImportRequest } from './websiteImportDiscovery'
import { fetchCrawlerTextWithLimit } from './crawlerNetworkPolicy'

/** Explicit source refresh uses the same origin, redirect, DNS and byte policy as imports. */
export async function handleWebsiteImportRevalidation(req: IncomingMessage, res: ServerResponse) {
  const controller = new AbortController()
  const abort = () => { if (!res.writableEnded) controller.abort() }
  res.once('close', abort)
  try {
    const body = await readWebsiteImportRequest(req)
    const url = typeof body.url === 'string' ? new URL(body.url) : null
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('An HTTP(S) source URL is required')
    const opt = body.options as Record<string, unknown> | undefined
    const etag = typeof opt?.etag === 'string' && opt.etag.length < 4096 ? opt.etag : undefined
    const lastModified = typeof opt?.lastModified === 'string' && opt.lastModified.length < 256 ? opt.lastModified : undefined
    const previousDigest = typeof opt?.digest === 'string' && /^[a-f0-9]{64}$/.test(opt.digest) ? opt.digest : undefined
    const result = await fetchCrawlerTextWithLimit(url.href, { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024,
      accept: 'text/html,text/plain,text/markdown,application/json;q=0.9,*/*;q=0.1', signal: controller.signal,
      cache: { etag, lastModified } })
    if (result.ok !== true) throw new Error(result.error)
    const unchanged = result.response?.status === 304
    const digest = unchanged ? previousDigest : createHash('sha256').update(result.text).digest('hex')
    const response = result.response
    const publicResponse = response && !response.hasCookies && !response.redirected
      && !/no-store|private/i.test(response.cacheControl || '') && !response.vary?.split(',').some(key => !['accept', 'accept-encoding'].includes(key.trim().toLowerCase()))
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ ok: true, unchanged: unchanged || digest === previousDigest, digest,
      text: unchanged || digest === previousDigest ? undefined : result.text,
      etag: publicResponse ? response.etag || (unchanged ? etag : undefined) : undefined,
      lastModified: publicResponse ? response.lastModified || (unchanged ? lastModified : undefined) : undefined,
      contentType: response?.contentType, checkedAt: Date.now() }))
  } catch (error) {
    if (!res.destroyed) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, error: String((error as Error).message || error) })) }
  } finally { res.off('close', abort) }
}
