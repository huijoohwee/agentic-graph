import { STORAGE_FETCH_ORIGIN } from '../cloudflare/pages/agentic-graph-agent-ready-shared.mjs'
import { digest } from './travel-mesh-release-plan.mjs'
import { cloudflareApiAllPages, cloudflareApiEnvelope } from './travel-mesh-release-inventory.mjs'

const root = 'https://api.cloudflare.com/client/v4'
const domainSpec = configuration => {
  const v = configuration.variables
  const hostname = new URL(STORAGE_FETCH_ORIGIN).hostname
  if (hostname !== `storage.${v.AGENTIC_OS_PUBLIC_ZONE_NAME}`) throw new Error('Core storage fetch origin differs from the owned zone')
  return { hostname, service: 'agentic-storage', zone_id: v.AGENTIC_OS_PUBLIC_ZONE_ID,
    zone_name: v.AGENTIC_OS_PUBLIC_ZONE_NAME, environment: 'production' }
}
const domainUrl = configuration => `${root}/accounts/${configuration.variables.CLOUDFLARE_ACCOUNT_ID}/workers/domains`
const scriptDomainUrl = configuration => `${root}/accounts/${configuration.variables.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/agentic-storage/domains`
const originsFor = spec => [{ hostname: spec.hostname, zone_id: spec.zone_id, zone_name: spec.zone_name }]
const normalizeDomain = (value, spec) => {
  if (!value || typeof value.id !== 'string' || !value.id
    || Object.entries(spec).some(([key, expected]) => value[key] !== expected)) {
    throw new Error('Core storage custom domain conflicts with its exact service or zone owner')
  }
  return { id: value.id, ...spec }
}

// The provider's read-only changeset detects DNS occupancy without a separate
// DNS permission. The mutation also disables both takeover overrides, so a
// conflict arriving after this observation is rejected by the provider.
export const inspectCoreStorageDomain = async ({ configuration, environment, apiFetch = fetch }) => {
  const spec = domainSpec(configuration)
  const domains = await cloudflareApiAllPages(apiFetch,
    `${domainUrl(configuration)}?hostname=${encodeURIComponent(spec.hostname)}&zone_id=${spec.zone_id}`,
    environment, 'core storage custom domain', { singlePage: true })
  const matching = domains.filter(value => value.hostname === spec.hostname)
  if (matching.length > 1) throw new Error('Core storage custom domain is ambiguous')
  const domain = matching.length ? normalizeDomain(matching[0], spec) : null
  const { result: changes } = await cloudflareApiEnvelope(apiFetch,
    `${scriptDomainUrl(configuration)}/changeset?replace_state=true`, environment,
    'core storage read-only domain changeset', { method: 'POST', body: originsFor(spec) })
  if (!changes || ['added', 'updated', 'removed', 'conflicting'].some(key => !Array.isArray(changes[key]))) throw new Error('Core storage domain changeset is malformed')
  if (changes.removed.length || changes.conflicting.length || changes.updated.some(item => item.modified !== undefined && item.modified !== false)) {
    throw new Error('Core storage domain plan conflicts with existing DNS or domain ownership')
  }
  // The script changeset uses an empty default environment; the account's
  // active-domain inventory names that same environment production. Validate
  // each endpoint strictly rather than accepting any environment on readback.
  const plannedSpec = { ...spec, environment: '' }
  if (changes.added.length !== (domain ? 0 : 1)
    || changes.added.some(item => normalizeDomain(item, plannedSpec).hostname !== spec.hostname)
    || changes.updated.length > 1 || changes.updated.some(item => item.id !== domain?.id)) {
    throw new Error('Core storage domain plan differs from the exact intended addition')
  }
  return { spec, domain, action: domain ? 'reuse' : 'create' }
}

export const configureCoreStorageDomain = async ({ configuration, environment, apiFetch = fetch, expectedDigest }) => {
  const before = await inspectCoreStorageDomain({ configuration, environment, apiFetch })
  if (digest(before) !== expectedDigest) throw new Error('Core storage custom domain changed after preflight')
  if (before.domain) return { status: 'proved', disposition: 'existing', before, after: before }
  // The protected release invokes this only after exact Worker activation.
  // No Worker, subscription, or paid service is created. A response loss is
  // preserved for investigation; it never causes an automatic second PUT.
  await cloudflareApiEnvelope(apiFetch, `${scriptDomainUrl(configuration)}/records`, environment,
    'core storage custom domain creation', { method: 'PUT', body: {
      override_scope: false, override_existing_origin: false, override_existing_dns_record: false,
      origins: originsFor(before.spec),
    } })
  const after = await inspectCoreStorageDomain({ configuration, environment, apiFetch })
  if (!after.domain) throw new Error('Core storage custom domain creation was not proved')
  return { status: 'proved', disposition: 'created', before, after }
}

export const verifyCoreStorageDomain = async ({ configuration, environment, apiFetch = fetch, routing }) => {
  if (routing?.status !== 'proved') throw new Error('Core storage routing receipt is not proved')
  const current = await inspectCoreStorageDomain({ configuration, environment, apiFetch })
  if (digest(current) !== digest(routing.after)) throw new Error('Core storage custom domain changed after activation')
  return current
}

export const restoreCoreStorageDomain = async ({ configuration, environment, apiFetch = fetch, routing }) => {
  if (!routing || routing.status === 'not-attempted') return { status: 'not-required' }
  if (routing.status !== 'proved') throw new Error('Core storage domain mutation is ambiguous; preserve provider state')
  await verifyCoreStorageDomain({ configuration, environment, apiFetch, routing })
  if (routing.disposition === 'existing') return { status: 'proved', disposition: 'retained-existing' }
  if (routing.disposition !== 'created' || routing.before.domain || routing.before.action !== 'create') throw new Error('Core storage domain rollback identity is invalid')
  await cloudflareApiEnvelope(apiFetch, `${domainUrl(configuration)}/${encodeURIComponent(routing.after.domain.id)}`,
    environment, 'core storage custom domain rollback', { method: 'DELETE' })
  const restored = await inspectCoreStorageDomain({ configuration, environment, apiFetch })
  if (digest(restored) !== digest(routing.before)) throw new Error('Core storage custom domain rollback was not proved')
  return { status: 'proved', disposition: 'removed-created-domain', restored }
}
