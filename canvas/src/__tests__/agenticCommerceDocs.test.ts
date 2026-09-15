import { readRepoDocumentFamily } from '@/tests/lib/repoDocumentFamily'

export function testAgenticCommerceDocsPinStripeWebhookIdempotencyContract() {
  const docs = [
    'docs/documents/agentic-graph-agentic-commerce-prd-tad-adr-mvp-gtm.md',
    'docs/documents/agentic-graph-api-document.md',
    'docs/documents/agentic-graph-backend-document.md',
  ].map(path => readRepoDocumentFamily(path)).join('\n')
  const requiredSnippets = [
    'same-payload',
    'conflicting payloads',
    'stale `processing`',
    'worker.payments.stripe.webhook.duplicatePayloadConflict',
    'worker.payments.stripe.webhook.reclaimsStaleProcessingClaim',
  ]
  requiredSnippets.forEach(snippet => {
    if (!docs.includes(snippet)) {
      throw new Error(`expected Stripe webhook idempotency docs to include ${JSON.stringify(snippet)}`)
    }
  })
}

