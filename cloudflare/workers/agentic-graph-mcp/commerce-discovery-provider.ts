import {
  DISCOVERY_EVIDENCE_CHECKS,
  DISCOVERY_PROVIDER_CONTRACT,
  canonicalJson,
  providerBindingHeaders,
  providerJson,
  readBoundProviderRequest,
  runtimeEvidencePin,
  runtimeEvidenceResponse,
  sha256Hex,
  type ProviderBinding,
  type ProviderRuntimeEnv,
} from '../commerce-provider-contract'
import { COMMERCE_DISCOVERY_TOOL_NAMES } from './commerce-discovery-contract.mjs'
import { handleTravelCommerceServiceRoute } from './travel-commerce-router.mjs'

const DISCOVERY_RECEIPT_CONTRACT = 'commerce.discovery-receipt/v1'
const DISCOVERY_OFFER_SCHEMA = 'commerce.discovery-offer/v1'
const MCP_PATH = '/agentic-os/control-plane/mcp'
const MAX_OWNER_RESPONSE_BYTES = 65_536
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256 = /^[0-9a-f]{64}$/u

type DiscoveryEnv = Env & ProviderRuntimeEnv
type ToolResult = Readonly<{
  content: Array<{ type: 'text'; text: string }>
  structuredContent: Record<string, unknown>
  isError: boolean
}>

export async function commerceDiscoveryHttpRoute(
  request: Request,
  env: DiscoveryEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/v1/runtime-evidence') {
    return runtimeEvidenceResponse(env, DISCOVERY_PROVIDER_CONTRACT, DISCOVERY_EVIDENCE_CHECKS)
  }
  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    return providerJson({
      ok: true,
      contract: DISCOVERY_PROVIDER_CONTRACT,
      transport: 'mcp/streamable-http',
      tools: Object.values(COMMERCE_DISCOVERY_TOOL_NAMES),
    })
  }
  return null
}

export async function commerceDiscoveryBinding(
  request: Request,
  env: DiscoveryEnv,
): Promise<Readonly<{ request: Request; binding: ProviderBinding }> | null | undefined> {
  const url = new URL(request.url)
  if (url.pathname !== MCP_PATH || request.headers.get('x-commerce-contract') !== DISCOVERY_PROVIDER_CONTRACT) {
    return undefined
  }
  return readBoundProviderRequest(request, env, DISCOVERY_EVIDENCE_CHECKS)
}

export function withCommerceDiscoveryBinding(response: Response, binding: ProviderBinding): Response {
  const headers = new Headers(response.headers)
  providerBindingHeaders(binding).forEach((value, name) => headers.set(name, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function dispatchCommerceDiscoveryMcp(
  request: Request,
  env: DiscoveryEnv,
  serve: (request: Request) => Promise<Response>,
): Promise<Response> {
  const bound = await commerceDiscoveryBinding(request, env)
  if (bound === null) return providerJson({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32003, message: 'Discovery operational evidence binding invalid.' },
  }, 409)
  const response = await serve(bound?.request ?? request)
  return bound ? withCommerceDiscoveryBinding(response, bound.binding) : response
}

export async function executeCommerceDiscoveryTool(
  toolName: string,
  args: Record<string, unknown>,
  env: DiscoveryEnv,
  route: typeof handleTravelCommerceServiceRoute = handleTravelCommerceServiceRoute,
): Promise<ToolResult> {
  const category = Object.entries(COMMERCE_DISCOVERY_TOOL_NAMES)
    .find(([, name]) => name === toolName)?.[0]
  if (!category) return result({ ok: false, code: 'discovery_tool_unknown' }, true)
  const context = isRecord(args.commerceContext) ? args.commerceContext : null
  const constraintKeys = Object.keys(args).filter((key) => key !== 'commerceContext').sort().join(',')
  if (constraintKeys !== 'bundle_id,changed_leg_id,prior_amount_minor,prior_offer_id'
    || !context
    || Object.keys(context).sort().join(',') !== 'agentId,category,contract,idempotencyKey,intentDigest,intentId'
    || context.contract !== 'commerce.discovery-dispatch/v1'
    || context.category !== category
    || typeof context.intentId !== 'string' || !IDENTIFIER.test(context.intentId)
    || typeof context.intentDigest !== 'string' || !SHA256.test(context.intentDigest)
    || typeof context.agentId !== 'string' || !IDENTIFIER.test(context.agentId)
    || typeof context.idempotencyKey !== 'string'
    || !context.idempotencyKey.startsWith(`intent:${context.intentId}:`)
    || !isIdentifier(args.bundle_id)
    || !isIdentifier(args.changed_leg_id)
    || !(args.prior_offer_id === null || isIdentifier(args.prior_offer_id))
    || !(args.prior_amount_minor === null
      || (Number.isSafeInteger(args.prior_amount_minor) && Number(args.prior_amount_minor) >= 0))) {
    return result({ ok: false, code: 'discovery_projection_unsupported' }, true)
  }
  const internalIntentId = `commerce:${(await sha256Hex(canonicalJson({
    intentId: context.intentId,
    changedLegId: args.changed_leg_id,
  }))).slice(0, 32)}:${args.changed_leg_id}`
  const routeResponse = await route(new Request(
    'https://agentic-mcp.internal/v1/route-intent',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agentic-graph-component': 'Reopt_Worker',
      },
      body: JSON.stringify({
        operation: 'routeIntent',
        intent: {
          intentId: internalIntentId,
          category,
          constraints: {
            bundle_id: args.bundle_id,
            changed_leg_id: args.changed_leg_id,
            prior_offer_id: args.prior_offer_id,
            prior_amount_minor: args.prior_amount_minor,
          },
        },
      }),
    },
  ), env)
  const quote = routeResponse ? await boundedRecord(routeResponse) : null
  if (!routeResponse?.ok || !quote
    || quote.kind !== 'offer'
    || quote.agentId !== context.agentId
    || typeof quote.offerId !== 'string' || !IDENTIFIER.test(quote.offerId)
    || !Number.isSafeInteger(quote.amountMinor) || Number(quote.amountMinor) <= 0
    || typeof quote.currency !== 'string' || !/^[A-Z]{3}$/u.test(quote.currency)
    || quote.priceVerification !== 'verified'
    || quote.promptTokens !== 0 || quote.completionTokens !== 0 || quote.dollarCost !== 0) {
    return result({ ok: false, code: 'discovery_owner_result_invalid' }, true)
  }
  const pin = await runtimeEvidencePin(env, DISCOVERY_EVIDENCE_CHECKS)
  if (!pin) return result({ ok: false, code: 'provider_evidence_unconfigured' }, true)
  const receiptWithoutDigest = Object.freeze({
    schema: DISCOVERY_OFFER_SCHEMA,
    intentId: context.intentId,
    intentDigest: context.intentDigest,
    agentId: context.agentId,
    offerId: quote.offerId,
    amountMinor: quote.amountMinor,
    currency: quote.currency,
    providerRevision: pin.sourceRevision,
  })
  const receipt = Object.freeze({
    ...receiptWithoutDigest,
    receiptDigest: await sha256Hex(canonicalJson(receiptWithoutDigest)),
  })
  return result({
    contract: DISCOVERY_RECEIPT_CONTRACT,
    ok: true,
    offers: [receipt],
  }, false)
}

function result(payload: Record<string, unknown>, isError: boolean): ToolResult {
  return Object.freeze({
    content: [{ type: 'text' as const, text: canonicalJson(payload) }],
    structuredContent: payload,
    isError,
  })
}

async function boundedRecord(response: Response): Promise<Record<string, unknown> | null> {
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_OWNER_RESPONSE_BYTES)) {
    await response.body?.cancel('discovery owner response exceeded bound')
    return null
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > MAX_OWNER_RESPONSE_BYTES) {
        await reader.cancel('discovery owner response exceeded bound')
        return null
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const text = new TextDecoder().decode(bytes)
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch { return null }
  finally { reader.releaseLock() }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value)
}
