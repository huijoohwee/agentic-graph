import { digest, requireText, SENTINEL, TRAVEL_MESH_PLAN } from './travel-mesh-release-plan.mjs'

const storage = TRAVEL_MESH_PLAN.find(entry => entry.id === 'storage')
export const CORE_RUNTIME_PLAN = Object.freeze([Object.freeze({
  ...storage,
  secrets: Object.freeze([['AGENTIC_OS_STORAGE_SIGNING_SECRET', 'AGENTIC_OS_STORAGE_SIGNING_SECRET']]),
  overrides: Object.freeze([
    ['AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE', 'AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE'],
    ['AGENTIC_OS_STORAGE_LOCAL_RUNTIME', 'AGENTIC_OS_STORAGE_LOCAL_RUNTIME'],
  ]),
  zoneVariable: 'AGENTIC_OS_PUBLIC_ZONE_NAME',
  storageVariables: ['AGENTIC_OS_STORAGE_D1_DATABASE_NAME', 'AGENTIC_OS_STORAGE_D1_DATABASE_ID', 'AGENTIC_OS_STORAGE_R2_BUCKET'],
  bindingProofs: [
    ['DB', 'd1', 'AGENTIC_OS_STORAGE_D1_DATABASE_ID', 'id'],
    ['AGENTIC_OS_STORAGE_BLOB_BUCKET', 'r2_bucket', 'AGENTIC_OS_STORAGE_R2_BUCKET', 'bucket_name'],
  ],
})])

export const validateCoreConfiguration = environment => {
  const variables = Object.fromEntries([
    'CLOUDFLARE_ACCOUNT_ID', 'AGENTIC_OS_PUBLIC_ZONE_ID', 'AGENTIC_OS_PUBLIC_ZONE_NAME',
    'AGENTIC_OS_STORAGE_D1_DATABASE_NAME', 'AGENTIC_OS_STORAGE_D1_DATABASE_ID', 'AGENTIC_OS_STORAGE_R2_BUCKET',
    'AGENTIC_OS_STORAGE_OWNER_ID', 'AGENTIC_OS_STORAGE_OWNER_EMAIL', 'AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID',
    'AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT',
  ].map(name => [name, requireText(environment[name], name)]))
  for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'AGENTIC_OS_PUBLIC_ZONE_ID']) {
    if (!/^[a-f0-9]{32}$/.test(variables[name])) throw new Error(`${name} is malformed`)
  }
  if (variables.AGENTIC_OS_PUBLIC_ZONE_NAME !== 'airvio.co'
    || variables.AGENTIC_OS_STORAGE_D1_DATABASE_ID !== '633355bf-1a52-4085-bd3c-eba4220ff152'
    || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(variables.AGENTIC_OS_STORAGE_D1_DATABASE_NAME)
    || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(variables.AGENTIC_OS_STORAGE_R2_BUCKET)) throw new Error('core resource identity is malformed')
  if (!/^[A-Za-z0-9:._@-]{3,200}$/.test(variables.AGENTIC_OS_STORAGE_OWNER_ID)
    || !/^[^\s@]{1,100}@[^\s@]{1,100}\.[^\s@]{2,40}$/.test(variables.AGENTIC_OS_STORAGE_OWNER_EMAIL)
    || !/^[A-Za-z0-9:._-]{3,200}$/.test(variables.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID)) throw new Error('core operator identity is malformed')
  const expires = Date.parse(variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT)
  if (!Number.isFinite(expires) || new Date(expires).toISOString() !== variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT) throw new Error('core operator key expiry is malformed')
  if (SENTINEL.test(JSON.stringify(variables))) throw new Error('core configuration contains a production sentinel')
  const signingSecret = requireText(environment.AGENTIC_OS_STORAGE_SIGNING_SECRET, 'AGENTIC_OS_STORAGE_SIGNING_SECRET')
  const ownerAccessKey = requireText(environment.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY, 'AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY')
  requireText(environment.CLOUDFLARE_API_TOKEN, 'CLOUDFLARE_API_TOKEN')
  if (signingSecret.length < 32 || SENTINEL.test(signingSecret)) throw new Error('storage signing secret is invalid')
  if (!/^[a-f0-9]{64}$/.test(ownerAccessKey)) throw new Error('core operator access key must contain 256 bits of hex data')
  variables.AGENTIC_OS_STORAGE_LOCAL_RUNTIME = 'false'
  variables.AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE = 'session-exchange'
  const overrides = { storage: Object.fromEntries(CORE_RUNTIME_PLAN[0].overrides.map(([binding, name]) => [binding, variables[name]])) }
  const secrets = { storage: { AGENTIC_OS_STORAGE_SIGNING_SECRET: signingSecret } }
  return { variables, overrides, secrets, ownerAccessKey, serviceTargets: { storage: {} },
    configurationDigest: digest({ profile: 'core', variables, overrides, secretDigests: { signing: digest(signingSecret), owner: digest(ownerAccessKey) } }) }
}

export const validateCoreOwnerAuthority = (authorization, configuration, now = () => new Date()) => {
  if (authorization.humanActorId !== configuration.variables.AGENTIC_OS_STORAGE_OWNER_ID) {
    throw new Error('core operator must be the exact protected human authorizer')
  }
  const remaining = Date.parse(configuration.variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT) - now().getTime()
  if (remaining < 5 * 60_000 || remaining > 30 * 86400_000) throw new Error('core operator key must expire between five minutes and thirty days from release')
}
