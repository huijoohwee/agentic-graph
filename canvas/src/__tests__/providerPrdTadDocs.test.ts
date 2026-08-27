import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readRepoFile = (repoRelativePath: string): string =>
  readFileSync(resolve(process.cwd(), '..', repoRelativePath), 'utf8')

export function testProviderPrdTadDocsUseImplementedOrReferenceOwners(): void {
  const miromindDocs = readRepoFile('docs/documents/agenticgraph-api-reference/agenticgraph-miromind-api-prd-tad.md')
  const stripeDocs = readRepoFile('docs/documents/agenticgraph-mcp/agenticgraph-stripe-mcp-service.md')
  const wechatDocs = readRepoFile('docs/documents/agenticgraph-wechat-mini-program.md')
  const miromindOwners = [
    'canvas/src/features/panels/views/miromindApiDocs.ts',
    'canvas/src/features/panels/views/miromindMcpApiDocs.ts',
    'canvas/src/features/panels/views/useSettingsView.ts',
    'canvas/src/features/panels/views/settingsView.constants.ts',
    'canvas/src/lib/chatEndpoint.ts',
    'canvas/src/features/chat/floatingPanelChat/floatingPanelChatProviderOptions.ts',
    'canvas/src/features/chat/floatingPanelChat/floatingPanelChatStreamParsing.ts',
  ].map(readRepoFile).join('\n')
  const stripeOwners = [
    'grph-shared/src/payments/stripeMcpSsot.ts',
    'canvas/src/features/panels/views/stripeMcpApiDocs.ts',
    'canvas/src/features/panels/views/stripePaymentApiDocs.ts',
    'canvas/src/features/panels/views/settingsMcpDocEntries.ts',
    'canvas/src/features/panels/views/CommerceHubView.tsx',
  ].map(readRepoFile).join('\n')

  const requiredMiroMindDocTokens = [
    'doc_type: "Product and Technical Specification"',
    'local_rung: "spec-complete"',
    'delivered_rung: "undocumented"',
    'AgenticGraph has a repository-accurate MiroMind source baseline; no delivery result is attached.',
    'MainPanel `Integrations` documents and exposes `MiroMind API` through the same shared settings owner used by other providers.',
    'MainPanel Integrations provider discoverability | source-present MiroMind row | one shared-owner MiroMind area',
  ]
  for (const token of requiredMiroMindDocTokens) {
    if (!miromindDocs.includes(token)) throw new Error(`Expected MiroMind PRD/TAD docs token ${JSON.stringify(token)}`)
  }

  const requiredMiroMindOwnerTokens = [
    'MIROMIND_API_DOC_ENTRIES',
    'MIROMIND_MCP_DOC_ENTRIES',
    'CHAT_PROVIDER_MIROMIND',
    'CHAT_MIROMIND_ENDPOINT_URL',
    'reasoning_steps',
    'Open FloatingPanel Chat UI (MiroMind)',
  ]
  for (const token of requiredMiroMindOwnerTokens) {
    if (!miromindOwners.includes(token)) throw new Error(`Expected MiroMind source owner token ${JSON.stringify(token)}`)
  }

  const requiredStripeDocTokens = [
    'doc_type: "Product and Technical Specification"',
    'local_rung: "spec-complete"',
    'delivered_rung: "undocumented"',
    'MainPanel MCP exposes payment readiness and agent configuration; MainPanel Commerce remains the customer-facing checkout, entitlement, and reconciliation surface.',
    'Commerce surface owns checkout, entitlement, and reconciliation UX',
  ]
  for (const token of requiredStripeDocTokens) {
    if (!stripeDocs.includes(token)) throw new Error(`Expected Stripe MCP PRD/TAD docs token ${JSON.stringify(token)}`)
  }

  const requiredStripeOwnerTokens = [
    'STRIPE_MCP_REMOTE_URL',
    'STRIPE_MCP_DEFAULT_REQUIRE_CONFIRMATION',
    'STRIPE_MCP_PAYMENT_TOOL_NAMES',
    'STRIPE_MCP_DOC_ENTRIES',
    'STRIPE_MCP_REMOTE_CONFIG_KEY',
    'STRIPE_MCP_LOCAL_CONFIG_KEY',
    'STRIPE_PAYMENT_ROUTE_PATHS',
    'accept_payment_ready',
    'Crawler Pay Per Crawl remains Cloudflare-owned; app and customer checkout readiness stays with Stripe MCP plus MainPanel Commerce.',
  ]
  for (const token of requiredStripeOwnerTokens) {
    if (!stripeOwners.includes(token)) throw new Error(`Expected Stripe MCP source owner token ${JSON.stringify(token)}`)
  }

  const requiredWeChatDocTokens = [
    'status: "reference-only-not-implemented"',
    'The repo currently has no WeChat Mini Program container, no WeChat Pay prepay Worker, no WeChat billing MCP service, and no WeChat entitlement ledger.',
    'Current WeChat-related source ownership is limited to webpage import and media handling for WeChat article URLs and WeChat-hosted image assets.',
    'Until then, WeChat Mini Program commerce remains inactive and must not be presented as shipped behavior in UI, docs, tests, or deployment notes.',
  ]
  for (const token of requiredWeChatDocTokens) {
    if (!wechatDocs.includes(token)) throw new Error(`Expected WeChat reference docs token ${JSON.stringify(token)}`)
  }

  const forbiddenDocTokens = [
    'status: "draft"',
    'status: draft',
    'AgenticGraph lacks a repo-accurate MiroMind integration plan',
    'Current gaps:',
    'billing_wechatpay_prepay_create',
    'billing_wechatpay_order_status',
  ]
  const combinedDocs = [miromindDocs, stripeDocs, wechatDocs].join('\n')
  for (const token of forbiddenDocTokens) {
    if (combinedDocs.includes(token)) throw new Error(`Expected provider PRD/TAD docs to remove ${JSON.stringify(token)}`)
  }
}
