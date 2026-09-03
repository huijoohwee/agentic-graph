import {
  CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
  CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
  CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
  AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS,
  AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
  AGENTIC_OS_STORAGE_ROUTE_PATHS,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
} from '@/lib/storage/agentic-graph-storage-sync-contract'
import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const CRAWLER_ACCESS_MCP_DOC_AREA = 'Crawler Access MCP Configuration'

type CrawlerAccessMcpDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const CRAWLER_ACCESS_MCP_TOOLTIP_ROLE = 'Crawler Access MCP'
export const CRAWLER_ACCESS_MCP_READINESS_MANIFEST_KEY = 'crawlerMcp.readiness_manifest'

const SOURCE_FILES_WORKSPACE_INDEX_PATTERN =
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndexPrefix}{workspaceId}`
const SOURCE_FILES_WORKSPACE_LLMS_PATTERN =
  `${SOURCE_FILES_WORKSPACE_INDEX_PATTERN}/llms.txt`
const SOURCE_FILES_DOC_VIEW_PATTERN =
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix}{workspaceId}/{canonicalPath}`
const DEFAULT_SOURCE_FILES_DOC_VIEW_PATTERN =
  `${AGENTIC_OS_STORAGE_ROUTE_PATHS.defaultDocPrefix}{canonicalPath}`
const DEFAULT_SOURCE_FILES_INDEX_PATH =
  buildAgenticGraphStorageSourceFilesIndexPath(AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID)
const DEFAULT_SOURCE_FILES_LLMS_PATH =
  buildAgenticGraphStorageLlmsPath(AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID)
const DEFAULT_SOURCE_FILES_DOC_PATH =
  buildAgenticGraphStorageDefaultDocPath('huijoohwee/docs/example.md')

export function buildCrawlerAccessReadinessManifestJson(): string {
  return JSON.stringify({
    crawlerAccess: {
      defaultWorkspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
      routes: {
        sourceFilesIndex: AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndex,
        sourceFilesWorkspaceIndex: SOURCE_FILES_WORKSPACE_INDEX_PATTERN,
        sourceFilesLlms: AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesLlms,
        sourceFilesWorkspaceLlms: SOURCE_FILES_WORKSPACE_LLMS_PATTERN,
        defaultWorkspaceSourceFilesIndex: DEFAULT_SOURCE_FILES_INDEX_PATH,
        defaultWorkspaceLlms: DEFAULT_SOURCE_FILES_LLMS_PATH,
        defaultWorkspaceDocView: DEFAULT_SOURCE_FILES_DOC_VIEW_PATTERN,
        docView: SOURCE_FILES_DOC_VIEW_PATTERN,
        exportPrefix: AGENTIC_OS_STORAGE_ROUTE_PATHS.exportPrefix,
      },
      headers: {
        worker: AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS,
        cloudflarePayPerCrawlRequest: CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS,
        cloudflarePayPerCrawl: CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS,
      },
      policy: {
        source: 'd1-documents-doc-view',
        payPerCrawlOwner: 'cloudflare-zone-policy',
        paymentRequestAuth: 'Web Bot Auth',
        readOnly: true,
        appLocalPaymentEmulation: false,
      },
      payment: {
        crawlerAccess: 'Cloudflare AI Crawl Control Pay Per Crawl',
        appPayments: 'Stripe MCP and MainPanel Commerce',
      },
    },
  }, null, 2)
}

const CRAWLER_ACCESS_MCP_DOC_ROWS: ReadonlyArray<CrawlerAccessMcpDocRow> = [
  {
    key: 'default_workspace_id',
    typeLabel: 'string',
    value: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID,
    responsibility: 'Default D1-backed workspace used by crawler-friendly Source Files routes.',
    searchHints: ['default workspace', AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID, 'source files'],
  },
  {
    key: 'route.source_files.index',
    typeLabel: 'path',
    value: AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndex,
    responsibility: 'Default read-only Source Files index route for non-JavaScript crawlers.',
    searchHints: ['source files index', 'read-only', AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesIndex],
  },
  {
    key: 'route.source_files.workspace_index',
    typeLabel: 'path pattern',
    value: SOURCE_FILES_WORKSPACE_INDEX_PATTERN,
    responsibility: 'Workspace-scoped Source Files index route pattern sourced from the storage route contract.',
    searchHints: ['workspace source files index', SOURCE_FILES_WORKSPACE_INDEX_PATTERN],
  },
  {
    key: 'route.llms.default',
    typeLabel: 'path',
    value: AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesLlms,
    responsibility: 'Default LLM text entrypoint that advertises Source Files routes and access policy.',
    searchHints: ['llms.txt', AGENTIC_OS_STORAGE_ROUTE_PATHS.sourceFilesLlms],
  },
  {
    key: 'route.llms.workspace',
    typeLabel: 'path pattern',
    value: SOURCE_FILES_WORKSPACE_LLMS_PATTERN,
    responsibility: 'Workspace-scoped LLM text route pattern for crawler discovery.',
    searchHints: ['workspace llms.txt', SOURCE_FILES_WORKSPACE_LLMS_PATTERN],
  },
  {
    key: 'route.doc_view.default',
    typeLabel: 'path pattern',
    value: DEFAULT_SOURCE_FILES_DOC_VIEW_PATTERN,
    responsibility: 'Default Editor Workspace markdown doc-view route pattern for agents that omit workspaceId.',
    searchHints: ['default doc view', DEFAULT_SOURCE_FILES_DOC_VIEW_PATTERN, DEFAULT_SOURCE_FILES_DOC_PATH],
  },
  {
    key: 'route.doc_view',
    typeLabel: 'path pattern',
    value: SOURCE_FILES_DOC_VIEW_PATTERN,
    responsibility: 'Markdown doc-view route pattern linked by crawler indexes instead of embedding full document bodies.',
    searchHints: ['doc view', SOURCE_FILES_DOC_VIEW_PATTERN, 'canonicalPath'],
  },
  {
    key: 'headers.worker',
    typeLabel: 'header list',
    value: Object.values(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS).join(' | '),
    responsibility: 'Worker-owned crawler metadata headers for storage source and Pay Per Crawl policy ownership.',
    searchHints: Object.values(AGENTIC_OS_STORAGE_CRAWLER_ACCESS_HEADERS),
  },
  {
    key: 'headers.cloudflare_pay_per_crawl_request',
    typeLabel: 'header list',
    value: Object.values(CLOUDFLARE_PAY_PER_CRAWL_REQUEST_HEADERS).join(' | '),
    responsibility: 'Cloudflare-owned AI crawler request headers for declaring exact or maximum paid-access intent through Web Bot Auth.',
    notes: 'Payment request headers must be signed through Cloudflare Web Bot Auth; agentic-graph only surfaces the contract and does not generate crawler payment intent.',
    searchHints: ['crawler-exact-price', 'crawler-max-price', 'Web Bot Auth', 'payment intent'],
  },
  {
    key: 'headers.cloudflare_pay_per_crawl',
    typeLabel: 'header list',
    value: Object.values(CLOUDFLARE_PAY_PER_CRAWL_RESPONSE_HEADERS).join(' | '),
    responsibility: 'Cloudflare-owned Pay Per Crawl response headers for price and charged access signals.',
    notes: 'agentic-graph exposes compatibility metadata only; Cloudflare owns HTTP 402 pricing, HTTP 200 charged headers, and crawler rejection errors.',
    searchHints: ['crawler-price', 'crawler-charged', 'crawler-error', 'HTTP 402', 'HTTP 200'],
  },
  {
    key: 'policy.pay_per_crawl_docs',
    typeLabel: 'url',
    value: CLOUDFLARE_PAY_PER_CRAWL_DOC_URL,
    responsibility: 'Cloudflare Pay Per Crawl reference used by crawler headers and operator review.',
    searchHints: ['Cloudflare AI Crawl Control', 'Pay Per Crawl', CLOUDFLARE_PAY_PER_CRAWL_DOC_URL],
  },
  {
    key: 'policy.pay_per_crawl_boundary',
    typeLabel: 'policy',
    value: 'cloudflare_zone_policy',
    responsibility: 'Payment boundary for crawler access routes.',
    notes: `Reference: ${CLOUDFLARE_PAY_PER_CRAWL_DOC_URL}`,
    searchHints: ['Cloudflare AI Crawl Control', 'Pay Per Crawl', CLOUDFLARE_PAY_PER_CRAWL_DOC_URL],
  },
  {
    key: 'guard.read_only_source_files',
    typeLabel: 'guard',
    value: 'read-only Source Files over D1 document rows and doc-view URLs',
    responsibility: 'Read-only guard aligned to agentic-graph-crawler-prd-tad.md.',
    searchHints: ['read-only Source Files', 'D1 documents', 'doc-view', 'no writes'],
  },
  {
    key: 'payment.handoff',
    typeLabel: 'handoff',
    value: 'cloudflare_pay_per_crawl',
    responsibility: 'Keeps crawler monetization and app checkout from conflicting while MainPanel MCP stays payment-ready.',
    searchHints: ['accept payment', 'Stripe MCP', 'MainPanel Commerce', 'Cloudflare Pay Per Crawl'],
  },
  {
    key: 'readiness_manifest',
    typeLabel: 'object',
    value: buildCrawlerAccessReadinessManifestJson(),
    responsibility: 'Agent-readable crawler access contract that combines routes, headers, policy, and payment boundaries.',
    searchHints: ['readiness manifest', 'crawler access', 'mcp', 'source files', 'payment boundary'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

export function getCrawlerAccessMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-crawler', rowKey)
}

export const CRAWLER_ACCESS_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  CRAWLER_ACCESS_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: CRAWLER_ACCESS_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['Crawler Access MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `crawlerMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      tooltipRole: CRAWLER_ACCESS_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['crawler access mcp configuration', 'agentic-graph-crawler-prd-tad', row.key, ...(row.searchHints || [])],
      details,
    }
  })
