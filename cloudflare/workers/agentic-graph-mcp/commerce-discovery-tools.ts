import { z } from 'zod'
import { COMMERCE_DISCOVERY_TOOL_NAMES } from './commerce-discovery-contract.mjs'

type RegisterTool = (name: string, input: z.ZodRawShape, output: z.ZodRawShape) => void

export function isCommerceDiscoveryTool(toolName: string): boolean {
  return (Object.values(COMMERCE_DISCOVERY_TOOL_NAMES) as readonly string[]).includes(toolName)
}

export function registerCommerceDiscoveryTools(register: RegisterTool): void {
  const input = {
    bundle_id: z.string(),
    changed_leg_id: z.string(),
    prior_offer_id: z.string().nullable(),
    prior_amount_minor: z.number().int().nonnegative().nullable(),
    commerceContext: z.object({
      contract: z.literal('commerce.discovery-dispatch/v1'),
      intentId: z.string(),
      intentDigest: z.string(),
      agentId: z.string(),
      category: z.string(),
      idempotencyKey: z.string(),
    }).strict(),
  }
  const output = {
    contract: z.literal('commerce.discovery-receipt/v1'),
    ok: z.literal(true),
    offers: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
  }
  for (const name of Object.values(COMMERCE_DISCOVERY_TOOL_NAMES)) register(name, input, output)
}
