import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID,
  STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL,
  STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY,
  STRIPE_CHECKOUT_METADATA_WORKSPACE_ID,
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_REQUIRED_CHECKOUT_ENV_SUMMARY,
  STRIPE_PAYMENT_CHECKOUT_MODE_ENV_SUMMARY,
  STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE,
  STRIPE_PAYMENT_OPERATOR_CONFIGURE_SUMMARY,
  STRIPE_PAYMENT_OPERATOR_COMMANDS,
  STRIPE_PAYMENT_READINESS_CHECK_SUMMARY,
  STRIPE_PAYMENT_REQUIRED_D1_COLUMNS,
  STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS,
  STRIPE_PAYMENT_ROUTE_PATHS,
  STRIPE_PAYMENT_SERVER_RUNTIME_SCOPE,
  STRIPE_PAYMENT_SERVER_RUNTIME_VISIBLE_SCOPE,
  STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY,
  STRIPE_PAYMENT_SECRET_ENV_NAMES,
  STRIPE_PROJECTS_DOCS_URL,
  STRIPE_PROJECTS_SKILL_URL,
  STRIPE_PROJECTS_URL,
} from 'grph-shared/payments/stripePaymentSsot'
import {
  AGENTIC_COMMERCE_ENV_KEYS,
  AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY,
} from 'grph-shared/payments/agenticCommerceSsot'

export const STRIPE_PAYMENT_API_DOC_AREA = 'Stripe Payment API'

export function getStripePaymentApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('stripe-payment-api-row', rowKey)
}

type StripeApiDocRow = {
  key: string
  typeLabel: string
  value: string
  responsibility: string
  valueKey?: string
  notes?: string
  searchHints?: string[]
}

const STRIPE_PAYMENT_REQUIRED_D1_COLUMN_SUMMARY = Object.entries(STRIPE_PAYMENT_REQUIRED_D1_COLUMNS)
  .flatMap(([tableName, columnNames]) => columnNames.map(columnName => `${tableName}.${columnName}`))
  .join(', ')
const STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMN_SUMMARY = Object.entries(STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS)
  .flatMap(([tableName, columnNames]) => columnNames.map(columnName => `${tableName}.${columnName}`))
  .join(', ')
const STRIPE_PAYMENT_SECRET_ENV_NAME_SUMMARY = STRIPE_PAYMENT_SECRET_ENV_NAMES.join(', ')

const STRIPE_DOC_ROWS: ReadonlyArray<StripeApiDocRow> = [
  {
    key: 'stripeApi.docs_url',
    typeLabel: 'url',
    value: 'https://docs.stripe.com/api',
    responsibility: 'Authoritative Stripe API reference for resources, parameters, and errors.',
    searchHints: ['stripe docs api reference view as markdown'],
  },
  {
    key: 'stripeApi.projects.url',
    typeLabel: 'url',
    value: STRIPE_PROJECTS_URL,
    responsibility: 'Optional Stripe Projects entrypoint for provisioning provider services and syncing local credentials from the CLI.',
    notes: `Use ${STRIPE_PROJECTS_DOCS_URL} and ${STRIPE_PROJECTS_SKILL_URL} for setup; keep generated credential values out of browser storage and source control.`,
    searchHints: ['stripe projects', 'projects.dev', 'credential provisioning', STRIPE_PROJECTS_SKILL_URL],
  },
  {
    key: 'stripeApi.base_url',
    typeLabel: 'url',
    value: 'https://api.stripe.com',
    responsibility: 'Base URL for Stripe API requests.',
    searchHints: ['stripe base url api.stripe.com'],
  },
  {
    key: 'stripeApi.request.auth_header',
    typeLabel: 'header',
    value: 'Authorization: Bearer <STRIPE_SECRET_KEY>',
    responsibility: 'Authorization header for authenticated Stripe API calls.',
    notes: 'Keep secret keys server-side only; never embed in client code or public repos.',
    searchHints: ['authorization bearer header', 'sk_test_', 'sk_live_'],
  },
  {
    key: 'stripeApi.request.content_type',
    typeLabel: 'header',
    value: 'Content-Type: application/x-www-form-urlencoded',
    responsibility: 'Stripe REST API requests accept form-encoded bodies by default.',
    searchHints: ['form-encoded', 'application/x-www-form-urlencoded'],
  },
  {
    key: 'stripeApi.request.idempotency_key',
    typeLabel: 'header',
    value: 'Idempotency-Key: <server-owned request key>',
    responsibility: 'Server-owned idempotency key for retrying Stripe POST requests without duplicating side effects.',
    notes: 'agentic-graph sends the ACP session id for agentic hosted Checkout retries; human Paywall Checkout does not expose caller-owned Stripe idempotency.',
    searchHints: ['idempotency', 'retry', 'duplicate charge', 'ACP session id'],
  },
  {
    key: 'stripeApi.paywall.enabled',
    typeLabel: 'boolean',
    value: 'false',
    responsibility: 'Toggles the in-canvas Paywall panel for Chat UI features (centered overlay).',
    valueKey: 'payments.paywallEnabled',
    searchHints: ['paywall', 'chat ui', 'payments'],
  },
  {
    key: 'stripeApi.auth.secret_key',
    typeLabel: 'secret string',
    value: '—',
    responsibility: 'Server-side secret key used to authenticate Stripe API requests.',
    valueKey: 'payments.stripe.secretKey',
    notes: `Keep Stripe credentials server-side only; configure ${STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY} as payment Worker secrets, never visible Worker [vars] or browser settings.`,
    searchHints: ['sk_test_', 'sk_live_', 'secret key', 'authentication'],
  },
  {
    key: 'stripeApi.runtime.env_scope',
    typeLabel: 'deployment scope',
    value: STRIPE_PAYMENT_SERVER_RUNTIME_VISIBLE_SCOPE,
    responsibility: 'Identifies where server-only Stripe credentials must be configured for the hosted Checkout Session route.',
    notes: STRIPE_PAYMENT_SERVER_RUNTIME_SCOPE,
    searchHints: ['cloudflare pages variables', 'worker secrets', 'payment server runtime', STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession],
  },
  {
    key: 'stripeApi.checkout.server_price_authority',
    typeLabel: 'env names',
    value: STRIPE_PAYMENT_REQUIRED_CHECKOUT_ENV_SUMMARY,
    responsibility: 'Defines the server-owned price authority required before creating hosted Checkout Sessions.',
    notes: 'Prefer a Stripe Price id when one exists; otherwise provide the complete neutral inline price tuple. Keep checkout price authority in visible Worker [vars], not Worker secrets, so readiness can validate the exact Stripe price source.',
    searchHints: ['STRIPE_CHECKOUT_PRICE_ID', 'price authority', 'checkout price', 'Worker [vars]', 'not Worker secrets'],
  },
  {
    key: 'stripeApi.checkout.mode',
    typeLabel: 'env enum',
    value: STRIPE_PAYMENT_CHECKOUT_MODE_ENV_SUMMARY,
    responsibility: 'Selects one-time or subscription Checkout mode on the payment Worker while keeping mode authority server-side.',
    notes: 'Defaults to payment. Keep STRIPE_CHECKOUT_MODE in Worker [vars], not Worker secrets, so readiness can validate mode/price compatibility. Subscription mode requires a Stripe Price id so recurring price definition remains in Stripe.',
    searchHints: ['STRIPE_CHECKOUT_MODE', 'checkout mode', 'subscription checkout', 'payment checkout', 'Worker [vars]', 'not Worker secrets'],
  },
  {
    key: 'stripeApi.checkout.return_origin',
    typeLabel: 'server origin',
    value: `Checkout route origin or ${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin}`,
    responsibility: 'Validates hosted Checkout success and cancel URLs against the server-owned return origin; caller Origin headers do not define redirect authority.',
    notes: `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} is non-secret Worker [vars] configuration. It is only needed when Stripe must return to an app origin that differs from the payment route origin, and readiness fails if it is hidden as a Worker secret.`,
    searchHints: [STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin, 'success_url', 'cancel_url', 'server return origin', 'origin header', 'Worker [vars]', 'not Worker secrets'],
  },
  {
    key: 'stripeApi.worker.configure_command',
    typeLabel: 'operator command',
    value: STRIPE_PAYMENT_OPERATOR_CONFIGURE_SUMMARY,
    responsibility: 'Validates operator-supplied Stripe payment Worker env, dry-runs the Worker secret names, rejects non-secret visible-config input, and keeps live mutation behind explicit confirmation.',
    notes: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.configure} does not create Stripe Products, Prices, Checkout Sessions, webhook endpoints, or D1 migrations. Existing Worker secrets satisfy the secret-input checks, so operators do not need to re-enter ${STRIPE_PAYMENT_SECRET_ENV_NAME_SUMMARY} when only checkout price authority is missing. Cloudflare secret mutation uses wrangler secret put and requires -- --apply --yes --confirm=${STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation}; visible checkout price authority can be written to wrangler.toml only with ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation}, then deployed with npm run payment:worker:deploy or the explicit ${STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag} --apply flag before live Checkout smoke. Remove ${STRIPE_PAYMENT_SECRET_ENV_NAME_SUMMARY} from visible Worker [vars], keep checkout price authority, STRIPE_CHECKOUT_MODE, and STRIPE_CHECKOUT_RETURN_ORIGIN in Worker [vars], then run ${STRIPE_PAYMENT_OPERATOR_COMMANDS.d1MigrateRemote} separately before ${STRIPE_PAYMENT_OPERATOR_COMMANDS.readiness}.`,
    searchHints: [
      'payment:stripe:configure',
      'payment:d1:migrate:remote',
      'payment:stripe:readiness',
      STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation,
      STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag,
      STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag,
      'wrangler secret put',
      'payment:worker:deploy',
      'worker secret names',
      'STRIPE_CHECKOUT_MODE Worker vars',
      'STRIPE_CHECKOUT_RETURN_ORIGIN Worker vars',
      'STRIPE_CHECKOUT_PRICE_ID Worker vars',
    ],
  },
  {
    key: 'stripeApi.worker.x402_configure_command',
    typeLabel: 'operator command',
    value: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.x402Configure} -> ${STRIPE_PAYMENT_OPERATOR_COMMANDS.x402Readiness}`,
    responsibility: 'Writes and validates the operator-owned x402 payTo authority for machine-native paid-resource routes.',
    notes: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.x402Configure} writes ${AGENTIC_COMMERCE_ENV_KEYS.x402PayToAddress} to visible Worker [vars] only with ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag} --yes --confirm=${STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation}. It rejects the deterministic fallback payTo address and never creates wallets, tokens, facilitator resources, or onchain transactions. Deploy with npm run payment:worker:deploy or ${STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag} --apply before ${STRIPE_PAYMENT_OPERATOR_COMMANDS.x402Readiness}.`,
    searchHints: [
      'payment:x402:configure',
      'payment:x402:readiness',
      AGENTIC_COMMERCE_ENV_KEYS.x402PayToAddress,
      'x402 payTo',
      'fallback payTo',
      STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag,
      STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag,
    ],
  },
  {
    key: 'stripeApi.worker.combined_readiness',
    typeLabel: 'operator command',
    value: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.paymentReadiness} -- --live-checkout-create`,
    responsibility: 'Runs the existing Stripe and x402 readiness gates together after visible payment authority is configured and deployed.',
    notes: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.paymentReadiness} is an aggregate wrapper only; Stripe Checkout authority, Worker secrets, D1 schema, live Checkout create-and-expire, ACP/UCP/MPP discovery, and x402 payTo authority remain owned by the existing focused readiness scripts. Use -- --live-checkout-create only when intentionally creating and expiring one hosted Checkout smoke Session.`,
    searchHints: [
      'payment:readiness',
      'combined payment readiness',
      'live checkout smoke',
      'payment:stripe:readiness',
      'payment:x402:readiness',
    ],
  },
  {
    key: 'stripeApi.worker.d1_migrations',
    typeLabel: 'operator command',
    value: STRIPE_PAYMENT_OPERATOR_COMMANDS.d1MigrateRemote,
    responsibility: 'Applies pending payment Worker D1 migrations before deploy/readiness, including Stripe webhook processing state columns and nullable in-flight claim fields.',
    notes: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.d1MigrateRemote} wraps ${STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE}. Required remote schema includes ${STRIPE_PAYMENT_REQUIRED_D1_COLUMN_SUMMARY}; nullable in-flight claim fields include ${STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMN_SUMMARY}. This is an intentional D1 mutation and is not run by configure/readiness helpers.`,
    searchHints: [
      'payment:d1:migrate:remote',
      'wrangler d1 migrations apply',
      'required webhook-processing columns',
      'nullable webhook-processing columns',
      'stripe_webhook_events.processing_status',
      'stripe_webhook_events.processing_error',
      'stripe_webhook_events.processed_at nullable',
      STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE,
    ],
  },
  {
    key: 'stripeApi.worker.readiness_gate',
    typeLabel: 'operator gate',
    value: STRIPE_PAYMENT_READINESS_CHECK_SUMMARY,
    responsibility: 'Checks payment Worker config and persistence prerequisites before an intentional bounded hosted Checkout create-and-expire smoke.',
    notes: `${STRIPE_PAYMENT_OPERATOR_COMMANDS.readiness} verifies Worker secret names, visible Worker [vars], required remote D1 payment tables, required webhook-processing columns, and nullable in-flight claim fields through Wrangler; it fails if Stripe credentials appear in visible Worker [vars] or if checkout price authority, STRIPE_CHECKOUT_MODE, or STRIPE_CHECKOUT_RETURN_ORIGIN is hidden as a Worker secret. Add -- --live-checkout-create only after production Stripe config and schema are approved; the bounded smoke asks the Worker to create, persist, expire, and withhold the hosted URL for the test Session. Use -- --live-checkout-timeout-ms=<ms> only to intentionally adjust the smoke timeout.`,
    searchHints: [
      'payment:stripe:readiness',
      'worker-d1-schema',
      'remote D1 payment tables',
      'required webhook-processing columns',
      'processed_at nullable',
      'wrangler d1 execute',
      'live-checkout-create',
      'live-checkout-timeout-ms',
    ],
  },
  {
    key: 'stripeApi.auth.publishable_key',
    typeLabel: 'string',
    value: '—',
    responsibility: 'Optional publishable key (client-side) for Stripe.js flows.',
    valueKey: 'payments.stripe.publishableKey',
    searchHints: ['publishable key', 'pk_test_', 'pk_live_'],
  },
  {
    key: 'stripeApi.mode',
    typeLabel: 'enum',
    value: 'test',
    responsibility: 'Operational mode label for your stored Stripe keys (test vs live).',
    valueKey: 'payments.stripe.mode',
    searchHints: ['test mode', 'live mode', 'sandbox'],
  },
  {
    key: 'stripeApi.webhooks.signing_secret',
    typeLabel: 'secret string',
    value: '—',
    responsibility: 'Server-side webhook signing secret used by the Cloudflare Worker to verify Stripe webhook signatures.',
    valueKey: 'payments.stripe.webhookSecret',
    notes: 'Server-managed only; configure STRIPE_WEBHOOK_SECRET as a Worker secret, not visible Worker [vars] or browser settings.',
    searchHints: ['webhook', 'signature', 'whsec_'],
  },
  {
    key: 'stripeApi.account.id',
    typeLabel: 'string',
    value: '—',
    responsibility: 'Optional Stripe account id for multi-account / Connect contexts.',
    valueKey: 'payments.stripe.accountId',
    searchHints: ['connect', 'account', 'acct_'],
  },
  {
    key: 'stripeApi.request.stripe_account_header',
    typeLabel: 'header',
    value: 'Stripe-Account: <acct_...>',
    responsibility: 'Optional header to make calls on behalf of a connected account.',
    searchHints: ['stripe account header', 'connect', 'acct_'],
  },
  {
    key: 'stripeApi.transport',
    typeLabel: 'string',
    value: 'HTTPS only',
    responsibility: 'Stripe API requests must be made over HTTPS.',
    searchHints: ['https', 'tls'],
  },
  {
    key: 'stripeApi.errors.http_status_codes',
    typeLabel: 'map',
    value: 'HTTP status categories',
    responsibility: 'HTTP status code categories commonly returned by the Stripe API.',
    searchHints: ['stripe http status codes', '402 request failed', '409 conflict', '429 too many requests'],
  },
  {
    key: 'stripeApi.errors.types',
    typeLabel: 'enum',
    value: 'api_error | card_error | idempotency_error | invalid_request_error',
    responsibility: 'Stripe API error.type categories for programmatic handling.',
    searchHints: ['stripe error types', 'card_error', 'idempotency_error'],
  },
  {
    key: 'stripeApi.endpoints.payment_intents.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/payment_intents',
    responsibility: 'Creates a PaymentIntent for collecting a payment.',
    searchHints: ['payment intents', 'create paymentintent'],
  },
  {
    key: 'stripeApi.endpoints.payment_intents.confirm',
    typeLabel: 'endpoint',
    value: 'POST /v1/payment_intents/{id}/confirm',
    responsibility: 'Confirms an existing PaymentIntent (server-driven confirmation flow).',
    searchHints: ['payment intents confirm'],
  },
  {
    key: 'stripeApi.endpoints.payment_intents.retrieve',
    typeLabel: 'endpoint',
    value: 'GET /v1/payment_intents/{id}',
    responsibility: 'Retrieves a PaymentIntent by id.',
    searchHints: ['payment intents retrieve'],
  },
  {
    key: 'stripeApi.endpoints.setup_intents.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/setup_intents',
    responsibility: 'Creates a SetupIntent for saving a payment method for future use.',
    searchHints: ['setup intents create'],
  },
  {
    key: 'stripeApi.endpoints.checkout.sessions.create',
    typeLabel: 'endpoint',
    value: `POST ${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`,
    responsibility: 'Creates a hosted Checkout Session through the server-owned route so the browser never sends Stripe secrets or price authority.',
    notes: 'If Stripe creates a hosted Session but the Worker cannot persist the Stripe audit row, the Worker expires the hosted Session before returning an error and does not hand out an untracked Checkout URL.',
    searchHints: ['checkout sessions create', STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession, 'server-owned checkout'],
  },
  {
    key: 'stripeApi.checkout.agentic_metadata',
    typeLabel: 'metadata',
    value: `${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID} + ${STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL}/${STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY}`,
    responsibility: 'Binds agent-created ACP checkout sessions to hosted Stripe Checkout without replacing workspace identity, losing total authority, or duplicating Sessions on retry.',
    notes: `Request ${AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY} during ACP session creation, or pass agenticCommerceSessionId plus expectedAmountTotal/expectedCurrency to the hosted Checkout route; both write metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}], keep workspaceId in metadata[${STRIPE_CHECKOUT_METADATA_WORKSPACE_ID}], send the ACP id as Stripe Idempotency-Key/client_reference_id, and reject or expire hosted Checkout when Stripe totals diverge from ACP or Stripe audit/ACP persistence fails before the handoff is owned. Settlement also requires Stripe client_reference_id to match metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}].`,
    searchHints: [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY, 'agenticCommerceSessionId', 'expectedAmountTotal', 'expectedCurrency', 'Idempotency-Key', 'client_reference_id', STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID, STRIPE_CHECKOUT_METADATA_WORKSPACE_ID, 'ACP checkout settlement', 'Stripe audit persistence failure', 'ACP persistence failure'],
  },
  {
    key: 'stripeApi.checkout.session_url',
    typeLabel: 'runtime url',
    value: '—',
    responsibility: 'Checkout Session URL returned by Stripe (field: url) during each hosted Checkout handoff; it is redirected immediately and not persisted in browser settings.',
    notes: 'The Paywall Open Checkout action creates a fresh Session on demand through the payment Worker. Stripe keys, price authority, and hosted Checkout Session creation stay on the Worker or dev/preview server.',
    searchHints: ['checkout session url', 'paywall open checkout', 'checkout.stripe.com', 'ui_mode hosted', 'redirect', 'session-only'],
  },
  {
    key: 'stripeApi.webhooks.worker_route',
    typeLabel: 'endpoint',
    value: `POST ${STRIPE_PAYMENT_ROUTE_PATHS.webhook}`,
    responsibility: 'Receives Stripe webhook events, verifies stripe-signature with STRIPE_WEBHOOK_SECRET, and records completed Checkout Sessions server-side.',
    searchHints: ['webhook route', STRIPE_PAYMENT_ROUTE_PATHS.webhook, 'checkout.session.completed', 'stripe-signature'],
  },
  {
    key: 'stripeApi.endpoints.checkout.sessions.retrieve',
    typeLabel: 'endpoint',
    value: 'GET /v1/checkout/sessions/{id}',
    responsibility: 'Retrieves a Checkout Session by id only after the payment Worker has confirmed the id belongs to a locally stored Checkout row.',
    notes: 'The public status route accepts only the canonical session_id query parameter, rejects unknown session_id values before Stripe retrieve, and returns only minimal payment state for owned rows; customer identifiers, Stripe metadata, hosted Checkout URLs, and workspace ids stay in D1/server settlement paths.',
    searchHints: ['checkout sessions retrieve', 'locally owned checkout session', 'unowned session_id', 'session_id only'],
  },
  {
    key: 'stripeApi.endpoints.customers.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/customers',
    responsibility: 'Creates a Customer record for recurring billing and saved payment methods.',
    searchHints: ['customers create'],
  },
  {
    key: 'stripeApi.endpoints.products.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/products',
    responsibility: 'Creates a Product used for pricing and catalog organization.',
    searchHints: ['products create'],
  },
  {
    key: 'stripeApi.endpoints.prices.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/prices',
    responsibility: 'Creates a Price (amount, currency, interval) attached to a Product.',
    searchHints: ['prices create'],
  },
  {
    key: 'stripeApi.endpoints.subscriptions.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/subscriptions',
    responsibility: 'Creates a Subscription for recurring charges.',
    searchHints: ['subscriptions create'],
  },
  {
    key: 'stripeApi.endpoints.invoices.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/invoices',
    responsibility: 'Creates an Invoice for a customer.',
    searchHints: ['invoices create'],
  },
  {
    key: 'stripeApi.endpoints.refunds.create',
    typeLabel: 'endpoint',
    value: 'POST /v1/refunds',
    responsibility: 'Creates a Refund for a prior charge or payment.',
    searchHints: ['refunds create'],
  },
]

export const STRIPE_PAYMENT_API_REQUEST_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> = STRIPE_DOC_ROWS.map((row) => {
  const meta: SettingMeta = {
    key: row.key,
    type: 'string',
    source: 'backendEnv',
    read: () => row.value,
  }
  const details: FlowDetails = {
    area: STRIPE_PAYMENT_API_DOC_AREA,
    responsibility: row.responsibility,
    notes: row.notes,
  }
  return {
    meta,
    details,
    value: row.value,
    typeLabel: row.typeLabel,
    valueKey: row.valueKey,
    searchHints: row.searchHints,
  }
})
