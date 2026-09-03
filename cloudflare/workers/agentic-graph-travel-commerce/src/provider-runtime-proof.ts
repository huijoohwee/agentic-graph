import {
  COMMERCE_PRD_REVISION,
  UPSTREAM_RUNTIME_EVIDENCE_SCHEMA,
  canonicalJson,
  runtimeEvidencePin,
  sha256Hex,
} from '../../commerce-provider-contract.ts'
import { COMMERCE_PROVIDER_RUNTIME_SPECS } from '../../commerce-provider-runtime-contract.mjs'
import { readBoundedJson } from '../../../../src/runtime/bounded-json.ts'
import { handleCommerceCheckoutProvider } from './commerce-checkout-provider.ts'
import { authenticateCommerceProviderControlRequest } from '../../commerce-provider-auth.ts'

const MAX_RESPONSE_BYTES = 65_536
const REQUEST_TIMEOUT_MS = 15_000

const PROVIDERS = Object.freeze(Object.values(COMMERCE_PROVIDER_RUNTIME_SPECS))

type ProviderSpec = (typeof PROVIDERS)[number]
type ProviderFetch = (request: Request) => Promise<Response | null>

export async function commerceProviderRuntimeProof(env: TravelCommerceEnv): Promise<Readonly<Record<string, unknown>> | null> {
  const sourceRevision = env.COMMERCE_PROVIDER_SOURCE_REVISION
  const providerVersionId = env.COMMERCE_PROVIDER_VERSION_ID
  const fetchers: Readonly<Record<string, ProviderFetch>> = Object.freeze({
    discovery: (request) => env.DISCOVERY_SERVICE.fetch(request),
    checkout: (request) => handleCommerceCheckoutProvider(request, env),
    marketplace: (request) => env.MARKETPLACE_SERVICE.fetch(request),
  })
  const authenticationSecrets: Readonly<Record<string, string | undefined>> = Object.freeze({
    checkout: env.CHECKOUT_PROVIDER_AUTH_SECRET,
    marketplace: env.MARKETPLACE_PROVIDER_AUTH_SECRET,
  })
  try {
    const providers = await Promise.all(PROVIDERS.map((spec) => probeProvider(
      spec, fetchers[spec.id], sourceRevision, providerVersionId, authenticationSecrets[spec.id],
    )))
    if (providers.some((provider) => provider === null)) return null
    return Object.freeze({
      schema: 'commerce.provider-runtime-proof/v1',
      sourceRevision,
      providerVersionId,
      providers: Object.freeze(providers),
    })
  } catch {
    return null
  }
}

async function probeProvider(
  spec: ProviderSpec,
  fetcher: ProviderFetch,
  sourceRevision: string,
  providerVersionId: string,
  authenticationSecret?: string,
): Promise<Readonly<Record<string, unknown>> | null> {
  const pin = await runtimeEvidencePin({
    COMMERCE_PROVIDER_SOURCE_REVISION: sourceRevision,
    COMMERCE_PROVIDER_STORAGE_REVISION: spec.storageRevision,
    COMMERCE_PROVIDER_VERSION_ID: providerVersionId,
  }, spec.checks)
  if (!pin) return null
  const evidence = Object.freeze({
    schema: UPSTREAM_RUNTIME_EVIDENCE_SCHEMA,
    prdRevision: COMMERCE_PRD_REVISION,
    ...pin,
    checks: Object.freeze([...spec.checks].sort().map((name) => Object.freeze({ name, ok: true }))),
  })
  const expectedEvidence = Object.freeze({ ok: true, contract: spec.contract, evidence })
  const [capabilitiesBody, evidenceBody] = await Promise.all([
    probeJson(fetcher, spec, '/v1/capabilities', authenticationSecret),
    probeJson(fetcher, spec, '/v1/runtime-evidence'),
  ])
  if (canonicalJson(capabilitiesBody) !== canonicalJson(spec.capabilities)
    || canonicalJson(evidenceBody) !== canonicalJson(expectedEvidence)) return null
  return Object.freeze({
    id: spec.id,
    contract: spec.contract,
    capabilitiesDigest: await sha256Hex(canonicalJson(spec.capabilities)),
    evidence,
  })
}

async function probeJson(
  fetcher: ProviderFetch,
  spec: ProviderSpec,
  pathname: string,
  authenticationSecret?: string,
): Promise<unknown | null> {
  const unsigned = new Request(`https://commerce-${spec.id}.internal${pathname}`, {
    method: 'GET',
    headers: { accept: 'application/json', 'x-commerce-contract': spec.contract },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const request = authenticationSecret === undefined
    ? unsigned
    : await authenticateCommerceProviderControlRequest(unsigned, spec.contract, authenticationSecret)
  if (!request) return null
  const response = await fetcher(request)
  if (!response) return null
  const body = await readBoundedJson(response, MAX_RESPONSE_BYTES)
  return response.ok ? body : null
}
