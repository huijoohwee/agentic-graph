import {
  AGENTIC_COMMERCE_API_VERSION,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'

export type HeadersRecord = Record<string, string>

export const json = (status: number, body: unknown, corsHeaders: HeadersRecord): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  })

export const errorJson = (status: number, error: string, corsHeaders: HeadersRecord): Response =>
  json(status, { ok: false, apiVersion: AGENTIC_COMMERCE_API_VERSION, error }, corsHeaders)

export const readRequestJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}
