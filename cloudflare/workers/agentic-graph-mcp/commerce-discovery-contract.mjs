export const COMMERCE_DISCOVERY_TOOL_NAMES = Object.freeze({
  flight: 'commerce.flight.discover',
  experience: 'commerce.experience.discover',
})

const CONTEXT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['contract', 'intentId', 'intentDigest', 'agentId', 'category', 'idempotencyKey'],
  properties: {
    contract: { const: 'commerce.discovery-dispatch/v1' },
    intentId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
    intentDigest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    agentId: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
    category: { type: 'string' },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 256 },
  },
})

const INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'bundle_id', 'changed_leg_id', 'prior_offer_id', 'prior_amount_minor', 'commerceContext',
  ],
  properties: {
    bundle_id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
    changed_leg_id: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
    prior_offer_id: {
      anyOf: [
        { type: 'null' },
        { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' },
      ],
    },
    prior_amount_minor: {
      anyOf: [
        { type: 'null' },
        { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      ],
    },
    commerceContext: CONTEXT_SCHEMA,
  },
})

const OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['contract', 'ok', 'offers'],
  properties: {
    contract: { const: 'commerce.discovery-receipt/v1' },
    ok: { const: true },
    offers: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'schema', 'intentId', 'intentDigest', 'agentId', 'offerId',
          'amountMinor', 'currency', 'providerRevision', 'receiptDigest',
        ],
        properties: {
          schema: { const: 'commerce.discovery-offer/v1' },
          intentId: { type: 'string' },
          intentDigest: { type: 'string' },
          agentId: { type: 'string' },
          offerId: { type: 'string' },
          amountMinor: { type: 'integer', minimum: 1 },
          currency: { type: 'string', pattern: '^[A-Z]{3}$' },
          providerRevision: { type: 'string', pattern: '^[0-9a-f]{40}$' },
          receiptDigest: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        },
      },
    },
  },
})

export const COMMERCE_DISCOVERY_TOOL_DEFINITIONS = Object.freeze(
  Object.entries(COMMERCE_DISCOVERY_TOOL_NAMES).map(([category, name]) => Object.freeze({
    name,
    title: `Commerce ${category} discovery`,
    description: `Dispatch one evidence-bound ${category} intent to the registered live owner.`,
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
  })),
)
