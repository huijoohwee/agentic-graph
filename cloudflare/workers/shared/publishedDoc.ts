import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS,
} from '../../../canvas/src/lib/storage/agenticgraphStorageSyncContract.ts'
import type { D1DatabaseLike } from './d1.ts'
import { readBoundedPublishedMarkdown } from '../agenticgraph-storage/storageDocumentReadBounds.ts'

export const AGENTICGRAPH_STORAGE_DOC_VIEW_HEADERS = {
  'content-type': 'text/markdown; charset=utf-8',
  'cache-control': 'private, no-store',
  'link': `<${CLOUDFLARE_PAY_PER_CRAWL_DOC_URL}>; rel="help"; title="Cloudflare AI Crawl Control Pay Per Crawl"`,
  'x-robots-tag': 'noindex, nofollow',
  [AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.source]: 'd1-documents-doc-view',
  [AGENTICGRAPH_STORAGE_CRAWLER_ACCESS_HEADERS.payPerCrawlPolicy]: 'cloudflare-zone-policy',
}

export const readPublishedMarkdown = async (
  db: D1DatabaseLike,
  args: { workspaceId: string; canonicalPath: string },
): Promise<string | null> => {
  return readBoundedPublishedMarkdown(db, args)
}
