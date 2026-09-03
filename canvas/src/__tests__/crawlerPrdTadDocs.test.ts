import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readCrawlerPrdTad(): string {
  return readFileSync(resolve(process.cwd(), '..', 'docs/documents/agentic-graph-crawler-prd-tad.md'), 'utf8')
}

export function testCrawlerPrdTadNamesImplementedCommerceHandoff(): void {
  const doc = readCrawlerPrdTad()
  const requiredSnippets = [
    '**Document Version**: 1.0.1',
    '**Status**: Implemented crawler-access contract',
    'canvas/src/lib/storage/agentic-graph-storage-sync-contract.ts',
    'cloudflare/workers/agentic-graph-storage/contract.ts',
    'cloudflare/workers/agentic-graph-storage/crawler.ts',
    'canvas/src/features/panels/views/crawlerAccessMcpApiDocs.ts',
    'Stripe/MainPanel Commerce handoff',
    'MainPanel Commerce handoff',
    'The Worker declares compatibility and reference metadata but does not set payment prices, create charged headers, classify crawlers, or return payment-required responses.',
  ]
  requiredSnippets.forEach(snippet => {
    if (!doc.includes(snippet)) {
      throw new Error(`Expected crawler PRD/TAD to include ${JSON.stringify(snippet)}`)
    }
  })

  const staleSnippets = [
    'Draft aligned to implemented crawler-access slice',
    'MainPanel Payments',
    'Stripe/MainPanel Payments handoff',
    'Worker sets crawler-price',
  ]
  staleSnippets.forEach(snippet => {
    if (doc.includes(snippet)) {
      throw new Error(`Expected crawler PRD/TAD to remove stale snippet ${JSON.stringify(snippet)}`)
    }
  })
}
