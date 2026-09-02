import { canonicalJson, sha256Hex } from './commerce-provider-contract.ts'

export const COMMERCE_PROVIDER_AUTH_SCHEMA = 'commerce-provider-auth/v1'
export const COMMERCE_PROVIDER_AUTH_HEADERS = Object.freeze({
  schema: 'x-commerce-provider-auth-schema',
  signature: 'x-commerce-provider-auth-signature',
})

const SECRET_PATTERN = /^[\x21-\x7e]{32,4096}$/u
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const UNBOUND_DIGEST = '0'.repeat(64)

export type CommerceProviderAuthentication = Readonly<{
  contract: string
  requestDigest: string
  bindingDigest: string
}>

export function validCommerceProviderSecret(value: unknown): value is string {
  return typeof value === 'string' && SECRET_PATTERN.test(value)
}

export async function authenticateCommerceProviderRequest(
  request: Request,
  authentication: CommerceProviderAuthentication,
  secret: string,
): Promise<Request | null> {
  const signature = await commerceProviderSignature(authentication, secret)
  if (!signature) return null
  const headers = new Headers(request.headers)
  headers.set(COMMERCE_PROVIDER_AUTH_HEADERS.schema, COMMERCE_PROVIDER_AUTH_SCHEMA)
  headers.set(COMMERCE_PROVIDER_AUTH_HEADERS.signature, signature)
  return new Request(request, { headers })
}

export async function authenticateCommerceProviderControlRequest(
  request: Request,
  contract: string,
  secret: string,
): Promise<Request | null> {
  const requestDigest = await controlRequestDigest(request)
  return requestDigest
    ? authenticateCommerceProviderRequest(request, {
        contract,
        requestDigest,
        bindingDigest: UNBOUND_DIGEST,
      }, secret)
    : null
}

export async function verifyCommerceProviderControlRequest(
  request: Request,
  contract: string,
  secret: string,
): Promise<boolean> {
  const requestDigest = await controlRequestDigest(request)
  return requestDigest !== null && verifyCommerceProviderRequestAuthentication(request, {
    contract,
    requestDigest,
    bindingDigest: UNBOUND_DIGEST,
  }, secret)
}

export async function verifyCommerceProviderRequestAuthentication(
  request: Request,
  authentication: CommerceProviderAuthentication,
  secret: string,
): Promise<boolean> {
  const signature = request.headers.get(COMMERCE_PROVIDER_AUTH_HEADERS.signature) ?? ''
  if (request.headers.get(COMMERCE_PROVIDER_AUTH_HEADERS.schema) !== COMMERCE_PROVIDER_AUTH_SCHEMA
    || !SHA256_PATTERN.test(signature)
    || !validAuthentication(authentication)
    || !validCommerceProviderSecret(secret)) return false
  try {
    const key = await hmacKey(secret, ['verify'])
    return crypto.subtle.verify(
      'HMAC',
      key,
      hexBytes(signature),
      new TextEncoder().encode(signaturePayload(authentication)),
    )
  } catch {
    return false
  }
}

export async function commerceProviderSignature(
  authentication: CommerceProviderAuthentication,
  secret: string,
): Promise<string | null> {
  if (!validAuthentication(authentication) || !validCommerceProviderSecret(secret)) return null
  try {
    const key = await hmacKey(secret, ['sign'])
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signaturePayload(authentication)),
    )
    return bytesHex(new Uint8Array(signature))
  } catch {
    return null
  }
}

async function controlRequestDigest(request: Request): Promise<string | null> {
  if (request.method.toUpperCase() !== 'GET' || request.body !== null) return null
  return sha256Hex(canonicalJson({
    method: 'GET',
    url: request.url,
    semanticHeaders: Object.fromEntries([
      'accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id',
      'x-commerce-contract', 'x-operator-id',
    ].map((name) => [name, request.headers.get(name)])),
    bodyDigest: await sha256Hex(''),
  }))
}

function signaturePayload(authentication: CommerceProviderAuthentication): string {
  return canonicalJson({
    schema: COMMERCE_PROVIDER_AUTH_SCHEMA,
    contract: authentication.contract,
    requestDigest: authentication.requestDigest,
    bindingDigest: authentication.bindingDigest,
  })
}

function validAuthentication(authentication: CommerceProviderAuthentication): boolean {
  return /^[a-z][a-z0-9.-]{0,127}\/v[1-9]\d*$/u.test(authentication.contract)
    && SHA256_PATTERN.test(authentication.requestDigest)
    && SHA256_PATTERN.test(authentication.bindingDigest)
}

function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

function bytesHex(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexBytes(value: string): ArrayBuffer {
  return Uint8Array.from(
    value.match(/.{2}/gu) ?? [],
    (byte) => Number.parseInt(byte, 16),
  ).buffer as ArrayBuffer
}
