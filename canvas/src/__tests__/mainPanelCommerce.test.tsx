import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import MainPanel from '@/features/panels/MainPanel'
import { MAIN_PANEL_TABS } from '@/features/panels/mainPanelTabs'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot, waitForFrames, waitForTasks } from '@/tests/lib/reactRootHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  AGENTIC_COMMERCE_MAIN_PANEL_READINESS,
  AGENTIC_COMMERCE_API_VERSION,
  AGENTIC_COMMERCE_ROUTE_PATHS,
} from 'grph-shared/payments/agenticCommerceSsot'
import {
  STRIPE_PAYMENT_ROUTE_PATHS,
} from 'grph-shared/payments/stripePaymentSsot'
import {
  readLocalCommerceReadinessSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { getStripePaymentApiRowAnchorId } from '@/features/panels/views/stripePaymentApiDocs'

export function testMainPanelCommerceReplacesPaymentsTopLevelTab() {
  const keys = MAIN_PANEL_TABS.map(tab => tab.key)
  const commerce = MAIN_PANEL_TABS.find(tab => tab.key === 'commerce')
  const commerceHubText = readFileSync(resolve(process.cwd(), 'src/features/panels/views/CommerceHubView.tsx'), 'utf8')
  if (!commerce || commerce.label !== 'Commerce') {
    throw new Error(`expected one Commerce top-level tab, got ${JSON.stringify(MAIN_PANEL_TABS)}`)
  }
  if (keys.includes('payments' as never)) {
    throw new Error(`expected Payments not to remain a top-level tab, got ${JSON.stringify(keys)}`)
  }
  if (!commerceHubText.includes("COMMERCE_ROUTE_READINESS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3'") || commerceHubText.includes('grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3')) {
    throw new Error('expected Commerce readiness cards to use a mobile-first responsive grid owner')
  }
  if (!commerceHubText.includes("COMMERCE_ROUTE_READINESS_ROW_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-[minmax(5rem,0.35fr)_minmax(0,1fr)] sm:gap-2'") || commerceHubText.includes('className="grid min-w-0 grid-cols-[minmax(5rem,0.35fr)_minmax(0,1fr)] gap-2"')) {
    throw new Error('expected Commerce readiness rows to use a mobile-first responsive row grid owner')
  }
}

export function testMainPanelCommercePrdTadUsesCanonicalCommerceOwner() {
  const repoRoot = resolve(process.cwd(), '..')
  const docs = [
    readFileSync(resolve(repoRoot, 'docs/documents/agentic-graph-mainpanel-commerce-prd-tad.md'), 'utf8'),
    readFileSync(resolve(repoRoot, 'docs/documents/agentic-graph-agentic-commerce-prd-tad.md'), 'utf8'),
  ].join('\n')
  const stripePaymentApiDocsSource = readFileSync(
    resolve(repoRoot, 'canvas/src/features/panels/views/stripePaymentApiDocs.ts'),
    'utf8',
  )
  const requiredSnippets = [
    'Commerce is the canonical top-level operator surface for commerce and payment readiness.',
    'Commerce is the canonical superset for Stripe, ACP, Web3, governance, and proof inspection.',
    'Implemented as canonical Commerce operator UI',
    'Payments remains only a subsection inside Commerce for Stripe and payment-provider configuration.',
    'status: "Accepted and implemented"',
    'version: "0.2.0"',
    'cloudflare/workers/agentic-graph-payment/agenticCommerce.ts',
    'grph-shared/src/payments/agenticCommerceSsot.ts',
    'canvas/src/__tests__/agenticCommerceWorker.test.ts',
    'Cloudflare Workers + D1',
    'stripeApi.worker.d1_migrations',
    'payment:d1:migrate:remote',
    'required webhook-processing columns',
    'worker.payments.agenticCommerce.sharedSemanticKey',
    'buildAgenticCommerceMainPanelReadiness',
  ]
  requiredSnippets.forEach(snippet => {
    if (!docs.includes(snippet)) {
      throw new Error(`expected Commerce PRD/TAD docs to include ${JSON.stringify(snippet)}`)
    }
  })
  const stripeSourceRequiredSnippets = [
    'STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE',
    'STRIPE_PAYMENT_REQUIRED_D1_COLUMNS',
    'STRIPE_PROJECTS_URL',
    'stripeApi.worker.d1_migrations',
  ]
  stripeSourceRequiredSnippets.forEach(snippet => {
    if (!stripePaymentApiDocsSource.includes(snippet)) {
      throw new Error(`expected Commerce Stripe API docs source to include ${JSON.stringify(snippet)}`)
    }
  })

  const staleSnippets = [
    'former MainPanel Payments',
    'former top-level Payments',
    'Implemented as Payments superset/replacement',
    'Legacy `Payments` and new `Commerce` tabs',
    'status: "Draft"',
    'version: "0.1.0"',
    'test/commerce/',
    'Cloudflare KV',
    'KV Store',
    'KV_NAMESPACE',
    'HD wallet derivation',
    'hardcoded key material',
  ]
  staleSnippets.forEach(snippet => {
    if (docs.includes(snippet)) {
      throw new Error(`expected Commerce PRD/TAD docs to remove stale snippet ${JSON.stringify(snippet)}`)
    }
  })
}

export async function testMainPanelCommerceRendersAgenticCommerceAndStripeSurface() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    installDeterministicRaf(dom.window)
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()

    await import('@/features/panels/views/CommerceHubView')
    const doc = dom.window.document
    const container = doc.createElement('section')
    doc.body.appendChild(container)
    root = createRoot(container as unknown as HTMLElement)
    await mountReactRoot(root, React.createElement(MainPanel, { requestedTab: 'commerce', requestedSearchQuery: '' } as never), {
      window: dom.window,
      frames: 4,
    })

    const stripeRuntimeRow = container.querySelector(
      `[data-kg-anchor="${getStripePaymentApiRowAnchorId('stripeApi.runtime.env_scope')}"]`,
    ) as HTMLElement | null
    if (!stripeRuntimeRow) {
      throw new Error('expected Commerce Stripe runtime scope row to render')
    }
    await act(async () => {
      stripeRuntimeRow.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await waitForFrames(dom.window, 2)
    })

    const text = container.textContent || ''
    const expectedTokens = [
      'Commerce',
      'Overview',
      'Discovery',
      'Sessions',
      'Web3',
      'Governance',
      'Proofs',
      AGENTIC_COMMERCE_API_VERSION,
      AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery,
      AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig,
      AGENTIC_COMMERCE_ROUTE_PATHS.ucpProfile,
      AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi,
      AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired,
      AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions,
      AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle,
      AGENTIC_COMMERCE_ROUTE_PATHS.solanaPaySettle,
      'Solana Pay settle',
      AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest,
      AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact,
      AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact,
      'Payments',
      'Providers',
      'Stripe Payment API',
      'stripeApi.base_url',
      'stripeApi.auth.secret_key',
      'stripeApi.runtime.env_scope',
      'stripeApi.checkout.server_price_authority',
      'stripeApi.checkout.mode',
      'stripeApi.worker.configure_command',
      'stripeApi.worker.d1_migrations',
      'stripeApi.worker.readiness_gate',
      'stripeApi.projects.url',
      'Cloudflare Pages project variables',
      'stripeApi.webhooks.signing_secret',
      'Stripe webhook signing secrets are not stored in the browser.',
      'Use `STRIPE_WEBHOOK_SECRET` on the server.',
      'stripeApi.checkout.session_url',
      STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession,
      STRIPE_PAYMENT_ROUTE_PATHS.webhook,
      'per-attempt',
    ]
    expectedTokens.forEach(token => {
      if (!text.includes(token)) {
        throw new Error(`expected commerce tab to include ${JSON.stringify(token)}, got ${JSON.stringify(text)}`)
      }
    })

    const readinessEl = container.querySelector('[data-kg-commerce-readiness-key]') as HTMLElement | null
    if (readinessEl?.dataset.kgCommerceReadinessKey !== AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey) {
      throw new Error(`expected Commerce hub to render shared readiness semantic key ${AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey}, got ${JSON.stringify(readinessEl?.dataset.kgCommerceReadinessKey || null)}`)
    }
    const readinessSnapshot = readLocalCommerceReadinessSurfaceSnapshot()
    if (readinessSnapshot?.semanticKey !== AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey) {
      throw new Error(`expected Commerce hub to publish shared agent-ready readiness snapshot, got ${JSON.stringify(readinessSnapshot)}`)
    }
    if (!readinessSnapshot || !readinessSnapshot.routePaths.includes(AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle)) {
      throw new Error(`expected Commerce readiness snapshot to reuse shared route paths, got ${JSON.stringify(readinessSnapshot?.routePaths || null)}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window })
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
    resetBrowserLocalSurfaceSnapshotsForTests()
  }
}
