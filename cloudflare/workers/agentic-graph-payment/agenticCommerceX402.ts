import { HTTPFacilitatorClient } from '@x402/core/server'
import type { Network, Price } from '@x402/core/types'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { Hono } from 'hono'
import { paymentMiddleware, x402ResourceServer } from '@x402/hono'
import {
  AGENTIC_COMMERCE_API_VERSION,
  AGENTIC_COMMERCE_ROUTE_PATHS,
  AGENTIC_COMMERCE_X402_ROUTE_PATHS,
  readAgenticCommerceX402FacilitatorUrl,
  readAgenticCommerceX402Network,
  readAgenticCommerceX402PayToAddress,
  readAgenticCommerceX402Price,
  type AgenticCommerceEnvLike,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'

type HeadersRecord = Record<string, string>
type X402AppFetch = (request: Request) => Promise<Response>

const withCorsHeaders = (response: Response, corsHeaders: HeadersRecord): Response => {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value)
  headers.set('cache-control', response.headers.get('cache-control') || 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const readX402Config = (request: Request, env: AgenticCommerceEnvLike) => {
  const url = new URL(request.url)
  const pathname = AGENTIC_COMMERCE_X402_ROUTE_PATHS.includes(url.pathname as never)
    ? url.pathname
    : AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired
  return {
    facilitatorUrl: readAgenticCommerceX402FacilitatorUrl(env),
    network: readAgenticCommerceX402Network(env),
    pathname,
    payTo: readAgenticCommerceX402PayToAddress(env),
    price: readAgenticCommerceX402Price(env),
    resourceUrl: `${url.origin}${pathname}`,
  }
}

type X402Config = Omit<ReturnType<typeof readX402Config>, 'payTo'> & Readonly<{ payTo: string }>

const createX402AppFetch = (config: X402Config): X402AppFetch => {
  const app = new Hono()
  const server = new x402ResourceServer(new HTTPFacilitatorClient({
    url: config.facilitatorUrl,
  })).register(config.network as Network, new ExactEvmScheme())

  app.use(paymentMiddleware({
    [`GET ${config.pathname}`]: {
      accepts: {
        scheme: 'exact',
        network: config.network as Network,
        payTo: config.payTo,
        price: config.price as Price,
      },
      resource: config.resourceUrl,
      description: 'agentic-graph commerce paid-resource readiness probe',
      mimeType: 'application/json',
    },
  }, server))

  app.get(config.pathname, c => c.json({
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    protocol: 'x402',
    resource: config.resourceUrl,
  }))

  return async request => await app.fetch(request)
}

export const handleAgenticCommerceX402Route = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const config = readX402Config(request, env)
  if (!config.payTo) {
    return withCorsHeaders(Response.json({
      ok: false,
      apiVersion: AGENTIC_COMMERCE_API_VERSION,
      code: 'x402_payee_unconfigured',
    }, { status: 503 }), corsHeaders)
  }
  // The request origin and route participate in the x402 resource identity.
  // Build the immutable middleware graph per request instead of retaining an
  // unbounded module-level cache whose keys can be influenced by Host headers.
  const appFetch = createX402AppFetch({ ...config, payTo: config.payTo })
  return withCorsHeaders(await appFetch(request), corsHeaders)
}
