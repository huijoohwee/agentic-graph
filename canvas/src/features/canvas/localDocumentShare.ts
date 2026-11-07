const SHARE_FRAGMENT_PREFIX = '#kgShare='
const SHARE_PAYLOAD_VERSION = 1
export const LOCAL_DOCUMENT_SHARE_MAX_MARKDOWN_BYTES = 4_096
export const LOCAL_DOCUMENT_SHARE_MAX_URL_CHARS = 8_192

export type LocalDocumentShare = Readonly<{ title: string; markdown: string }>
export type ParsedLocalDocumentShare =
  | Readonly<{ status: 'shared'; document: LocalDocumentShare }>
  | Readonly<{ status: 'invalid' }>

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

const decodeBase64Url = (value: string): Uint8Array => {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error('Invalid share data')
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/')
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const validDocument = (value: unknown): LocalDocumentShare | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.version !== SHARE_PAYLOAD_VERSION || typeof row.title !== 'string' || typeof row.markdown !== 'string') return null
  const title = row.title.trim()
  if (!title || title.length > 160 || [...title].some(character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })) return null
  if (!row.markdown.trim() || new TextEncoder().encode(row.markdown).byteLength > LOCAL_DOCUMENT_SHARE_MAX_MARKDOWN_BYTES) return null
  return Object.freeze({ title, markdown: row.markdown })
}

export function isLocalDocumentShareFragment(hash: string): boolean {
  return String(hash || '').startsWith(SHARE_FRAGMENT_PREFIX)
}

export function buildLocalDocumentShareUrl(args: {
  title: string
  markdown: string
  baseUrl: string
}): string | null {
  const document = validDocument({ version: SHARE_PAYLOAD_VERSION, title: args.title, markdown: args.markdown })
  if (!document) return null
  try {
    const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify({
      version: SHARE_PAYLOAD_VERSION,
      title: document.title,
      markdown: document.markdown,
    })))
    const url = new URL(args.baseUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.search = ''
    url.hash = `kgShare=${payload}`
    return url.href.length <= LOCAL_DOCUMENT_SHARE_MAX_URL_CHARS ? url.href : null
  } catch {
    return null
  }
}

export function parseLocalDocumentShareHash(hash: string): ParsedLocalDocumentShare | null {
  const value = String(hash || '')
  if (!isLocalDocumentShareFragment(value)) return null
  const token = value.slice(SHARE_FRAGMENT_PREFIX.length)
  if (token.length > LOCAL_DOCUMENT_SHARE_MAX_URL_CHARS) return { status: 'invalid' }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(token))
    const document = validDocument(JSON.parse(decoded))
    return document ? { status: 'shared', document } : { status: 'invalid' }
  } catch {
    return { status: 'invalid' }
  }
}
