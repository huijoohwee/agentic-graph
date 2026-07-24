import { StorageRelayError } from './storageRelaySafety'

const TOKEN_VERSION = 1
const DEFAULT_TOKEN_TTL_MS = 15 * 60_000
const MAX_TOKEN_TTL_MS = 60 * 60_000

export type StorageRelayTokenPurpose =
  | 'entry'
  | 'page-cursor'
  | 'complete-listing'

export type StorageRelayTokenBinding = {
  purpose: StorageRelayTokenPurpose
  workspaceId: string
  providerId: string
  rootKey: string
}

type StorageRelayTokenEnvelope<Payload> = StorageRelayTokenBinding & {
  version: typeof TOKEN_VERSION
  issuedAtMs: number
  expiresAtMs: number
  payload: Payload
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const decodeBase64 = (value: string): Uint8Array => {
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export const encodeStorageRelayBase64Url = (bytes: Uint8Array): string =>
  encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')

export const decodeStorageRelayBase64Url = (value: string): Uint8Array => {
  const normalized = String(value || '').trim()
  if (!/^[A-Za-z0-9_-]+$/u.test(normalized)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  const standard = normalized.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  return decodeBase64(padded)
}

export const encodeStorageRelayJsonHeader = (value: unknown): string =>
  encodeStorageRelayBase64Url(new TextEncoder().encode(JSON.stringify(value)))

export const decodeStorageRelayJsonHeader = <Value>(value: string): Value => {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(decodeStorageRelayBase64Url(value)),
    ) as Value
  } catch (error) {
    if (error instanceof StorageRelayError) throw error
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
}

const assertBoundedIdentifier = (value: string): void => {
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export class StorageRelayOpaqueTokenCodec {
  private readonly secret: string
  private readonly now: () => number
  private encryptionKeyPromise: Promise<CryptoKey> | null = null
  private stableKeyPromise: Promise<CryptoKey> | null = null

  constructor(args: { secret: string; now?: () => number }) {
    this.secret = String(args.secret || '')
    this.now = args.now ?? Date.now
    if (this.secret.length < 16) {
      throw new StorageRelayError({ code: 'provider_not_configured', status: 503 })
    }
  }

  async seal<Payload extends Record<string, unknown>>(args: {
    binding: StorageRelayTokenBinding
    payload: Payload
    ttlMs?: number
  }): Promise<string> {
    this.assertBinding(args.binding)
    if (!isRecord(args.payload)) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const issuedAtMs = this.now()
    const ttlMs = Math.max(1, Math.min(MAX_TOKEN_TTL_MS, args.ttlMs ?? DEFAULT_TOKEN_TTL_MS))
    const envelope: StorageRelayTokenEnvelope<Payload> = {
      version: TOKEN_VERSION,
      ...args.binding,
      issuedAtMs,
      expiresAtMs: issuedAtMs + ttlMs,
      payload: args.payload,
    }
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(JSON.stringify(envelope))
    const key = await this.readEncryptionKey()
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this.bindingBytes(args.binding) },
      key,
      plaintext,
    )
    return `${encodeStorageRelayBase64Url(iv)}.${encodeStorageRelayBase64Url(new Uint8Array(ciphertext))}`
  }

  async open<Payload extends Record<string, unknown>>(args: {
    token: string
    binding: StorageRelayTokenBinding
  }): Promise<Payload> {
    this.assertBinding(args.binding)
    const parts = String(args.token || '').split('.')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const iv = decodeStorageRelayBase64Url(parts[0])
    if (iv.byteLength !== 12) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const ciphertext = decodeStorageRelayBase64Url(parts[1])
    let plaintext: ArrayBuffer
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: this.bindingBytes(args.binding) },
        await this.readEncryptionKey(),
        ciphertext,
      )
    } catch {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    let envelope: StorageRelayTokenEnvelope<Payload>
    try {
      envelope = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
      ) as StorageRelayTokenEnvelope<Payload>
    } catch {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    if (
      !isRecord(envelope)
      || envelope.version !== TOKEN_VERSION
      || envelope.purpose !== args.binding.purpose
      || envelope.workspaceId !== args.binding.workspaceId
      || envelope.providerId !== args.binding.providerId
      || envelope.rootKey !== args.binding.rootKey
      || !Number.isFinite(envelope.issuedAtMs)
      || !Number.isFinite(envelope.expiresAtMs)
      || envelope.expiresAtMs <= this.now()
      || envelope.issuedAtMs > this.now() + 60_000
      || !isRecord(envelope.payload)
    ) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    return envelope.payload
  }

  async deriveStableKey(args: {
    workspaceId: string
    providerId: string
    rootKey: string
    resourceId: string
  }): Promise<string> {
    for (const value of Object.values(args)) assertBoundedIdentifier(value)
    const data = new TextEncoder().encode(JSON.stringify([
      TOKEN_VERSION,
      args.workspaceId,
      args.providerId,
      args.rootKey,
      args.resourceId,
    ]))
    const signature = await crypto.subtle.sign('HMAC', await this.readStableKey(), data)
    return `file:${encodeStorageRelayBase64Url(new Uint8Array(signature))}`
  }

  private assertBinding(binding: StorageRelayTokenBinding): void {
    assertBoundedIdentifier(binding.purpose)
    assertBoundedIdentifier(binding.workspaceId)
    assertBoundedIdentifier(binding.providerId)
    assertBoundedIdentifier(binding.rootKey)
  }

  private bindingBytes(binding: StorageRelayTokenBinding): Uint8Array {
    return new TextEncoder().encode(JSON.stringify([
      TOKEN_VERSION,
      binding.purpose,
      binding.workspaceId,
      binding.providerId,
      binding.rootKey,
    ]))
  }

  private readEncryptionKey(): Promise<CryptoKey> {
    if (!this.encryptionKeyPromise) {
      this.encryptionKeyPromise = crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`knowgrph-storage-relay:aead:${this.secret}`),
      ).then(keyBytes => crypto.subtle.importKey(
        'raw',
        keyBytes,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      ))
    }
    return this.encryptionKeyPromise
  }

  private readStableKey(): Promise<CryptoKey> {
    if (!this.stableKeyPromise) {
      this.stableKeyPromise = crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(`knowgrph-storage-relay:stable:${this.secret}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )
    }
    return this.stableKeyPromise
  }
}
