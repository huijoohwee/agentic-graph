import type { FeishuBaseSourceAdapterInput } from '@/features/source-files/feishuBaseSourceAdapter'
import {
  FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF,
  QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH,
  QUERY_PARAM_LARK_HANDOFF,
} from '@/lib/routing/queryParams'

export type LarkAppCanvasHandoffSurface = 'webpage' | 'baseinfo' | 'backend'
export type LarkAppCanvasHandoffIntent = 'read-only' | 'review' | 'import'
export type LarkAppCanvasImportAction = 'importSnapshot' | 'readKnowledgeSource'

export type LarkKnowledgeSourceHandoff = {
  sourceId: string
  token: string
}

export type LarkAppCanvasHandoff = {
  source: 'lark-app'
  surface: LarkAppCanvasHandoffSurface
  intent: LarkAppCanvasHandoffIntent
  openMainPanelTab: string | null
  openEditorWorkspace: boolean
  openCanvas: boolean
  importAction: LarkAppCanvasImportAction | null
  fileId: string | null
  snapshot: FeishuBaseSourceAdapterInput | null
  knowledgeSource: LarkKnowledgeSourceHandoff | null
  returnUrl: string | null
}

type LarkAppCanvasHandoffInput = {
  source?: unknown
  surface?: unknown
  intent?: unknown
  openMainPanelTab?: unknown
  openEditorWorkspace?: unknown
  openCanvas?: unknown
  importAction?: unknown
  fileId?: unknown
  snapshot?: unknown
  returnUrl?: unknown
}

export type LarkAppCanvasHandoffParseResult =
  | { ok: true; value: LarkAppCanvasHandoff; rawToken: string }
  | { ok: false; error: string; rawToken: string }

const SUPPORTED_SURFACES: ReadonlyArray<LarkAppCanvasHandoffSurface> = ['webpage', 'baseinfo', 'backend']
const SUPPORTED_INTENTS: ReadonlyArray<LarkAppCanvasHandoffIntent> = ['read-only', 'review', 'import']
const SECRET_LIKE_KEY_PATTERN = /(tenant[_-]?access[_-]?token|app[_-]?secret|password|credential|authorization|cookie)/i
const SECRET_LIKE_VALUE_PATTERN = /(tenant_access_token|app_secret|authorization:|bearer\s+[a-z0-9._-]+)/i
const FORBIDDEN_ENDPOINT_OVERRIDE_KEY_PATTERN = /^(remoteUrl|mcpUrl|endpointUrl|serverUrl)$/i
const KNOWLEDGE_SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const KNOWLEDGE_SOURCE_TOKEN_MAX_LENGTH = 16_384

const readOptionalString = (value: unknown): string | null => {
  const text = String(value || '').trim()
  return text || null
}

const readOptionalBoolean = (value: unknown): boolean | null => {
  if (value === true) return true
  if (value === false) return false
  const text = String(value || '').trim().toLowerCase()
  if (!text) return null
  if (text === '1' || text === 'true' || text === 'yes') return true
  if (text === '0' || text === 'false' || text === 'no') return false
  return null
}

const encodeBase64UrlText = (text: string): string => {
  const value = String(text || '')
  if (!value) return ''
  if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
  const BufferCtor = (globalThis as unknown as {
    Buffer?: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } }
  }).Buffer
  if (BufferCtor && typeof BufferCtor.from === 'function') {
    return BufferCtor.from(value, 'utf8').toString('base64url')
  }
  throw new Error('Base64 URL encoding unavailable')
}

const decodeBase64UrlText = (raw: string): string => {
  const normalized = String(raw || '').trim().replace(/-/g, '+').replace(/_/g, '/')
  if (!normalized) return ''
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  const BufferCtor = (globalThis as unknown as {
    Buffer?: { from: (value: string, encoding: string) => { toString: (encoding: string) => string } }
  }).Buffer
  if (BufferCtor && typeof BufferCtor.from === 'function') {
    return BufferCtor.from(padded, 'base64').toString('utf8')
  }
  throw new Error('Base64 URL decoding unavailable')
}

const parsePayloadText = (raw: string): string => {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('{') ? trimmed : decodeBase64UrlText(trimmed)
}

const normalizeKnowledgeSourceHandoff = (value: unknown): LarkKnowledgeSourceHandoff | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  if (keys.length !== 2 || keys[0] !== 'sourceId' || keys[1] !== 'token') return null
  const sourceId = readOptionalString(record.sourceId)
  const token = readOptionalString(record.token)
  if (!sourceId || !KNOWLEDGE_SOURCE_ID_PATTERN.test(sourceId)) return null
  if (!token || token.length > KNOWLEDGE_SOURCE_TOKEN_MAX_LENGTH || /\s/.test(token)) return null
  return { sourceId, token }
}

const containsSecretLikeMaterial = (value: unknown): boolean => {
  if (value == null) return false
  if (typeof value === 'string') return SECRET_LIKE_VALUE_PATTERN.test(value)
  if (Array.isArray(value)) return value.some(containsSecretLikeMaterial)
  if (typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (SECRET_LIKE_KEY_PATTERN.test(key)) return true
    return containsSecretLikeMaterial(child)
  })
}

const containsForbiddenEndpointOverride = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (FORBIDDEN_ENDPOINT_OVERRIDE_KEY_PATTERN.test(key)) return true
    return containsForbiddenEndpointOverride(child)
  })
}

const normalizeSurface = (value: unknown): LarkAppCanvasHandoffSurface | null => {
  const surface = readOptionalString(value)
  if (!surface) return null
  return SUPPORTED_SURFACES.includes(surface as LarkAppCanvasHandoffSurface)
    ? surface as LarkAppCanvasHandoffSurface
    : null
}

const normalizeIntent = (value: unknown): LarkAppCanvasHandoffIntent | null => {
  const intent = readOptionalString(value)
  if (!intent) return null
  return SUPPORTED_INTENTS.includes(intent as LarkAppCanvasHandoffIntent)
    ? intent as LarkAppCanvasHandoffIntent
    : null
}

export function buildLarkAppCanvasHandoff(input: LarkAppCanvasHandoffInput): LarkAppCanvasHandoff {
  if (containsSecretLikeMaterial(input)) {
    throw new Error('Lark App Canvas handoff must not contain secret material.')
  }
  if (containsForbiddenEndpointOverride(input)) {
    throw new Error('Lark App Canvas handoff must not override the deployed MCP endpoint.')
  }

  const surface = normalizeSurface(input.surface)
  if (!surface) throw new Error('Lark App Canvas handoff requires a supported surface.')

  const intent = normalizeIntent(input.intent)
  if (!intent) throw new Error('Lark App Canvas handoff requires a supported intent.')

  const openMainPanelTab = readOptionalString(input.openMainPanelTab)
  const openEditorWorkspace = readOptionalBoolean(input.openEditorWorkspace) ?? intent !== 'read-only'
  const openCanvas = readOptionalBoolean(input.openCanvas) ?? true
  const importAction = intent === 'import' ? 'importSnapshot' : null
  const fileId = readOptionalString(input.fileId)
  const snapshot = input.snapshot && typeof input.snapshot === 'object' && !Array.isArray(input.snapshot)
    ? input.snapshot as FeishuBaseSourceAdapterInput
    : null
  const returnUrl = readOptionalString(input.returnUrl)

  if (intent === 'import' && !snapshot) {
    throw new Error('Lark App Canvas import handoff requires a structured snapshot payload.')
  }

  return {
    source: 'lark-app',
    surface,
    intent,
    openMainPanelTab,
    openEditorWorkspace,
    openCanvas,
    importAction,
    fileId,
    snapshot,
    knowledgeSource: null,
    returnUrl,
  }
}

export function buildLarkKnowledgeSourceHandoffFragment(input: {
  sourceId: string
  token: string
}): string {
  if (containsSecretLikeMaterial(input)) {
    throw new Error('Lark knowledge-source handoff must not contain secret material.')
  }
  const knowledgeSource = normalizeKnowledgeSourceHandoff(input)
  if (!knowledgeSource) throw new Error('Lark knowledge-source handoff is invalid.')
  const payload = {
    sourceId: knowledgeSource.sourceId,
    token: knowledgeSource.token,
  }
  const search = new URLSearchParams({ [QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH]: '1' })
  const fragment = new URLSearchParams()
  fragment.set(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF, encodeBase64UrlText(JSON.stringify(payload)))
  return `?${search.toString()}#${fragment.toString()}`
}

export function buildLarkAppCanvasHandoffToken(input: LarkAppCanvasHandoffInput): string {
  return encodeBase64UrlText(JSON.stringify(buildLarkAppCanvasHandoff(input)))
}

export function buildLarkAppCanvasHandoffQuery(input: LarkAppCanvasHandoffInput): string {
  const params = new URLSearchParams()
  params.set(QUERY_PARAM_LARK_HANDOFF, buildLarkAppCanvasHandoffToken(input))
  return `?${params.toString()}`
}

export function readLarkAppCanvasHandoffTokenFromSearch(search: string): string {
  const params = new URLSearchParams(String(search || '').startsWith('?') ? String(search || '').slice(1) : String(search || ''))
  return String(params.get(QUERY_PARAM_LARK_HANDOFF) || '').trim()
}

const readFragmentParams = (hash: string): URLSearchParams => {
  const withoutHash = String(hash || '').startsWith('#') ? String(hash || '').slice(1) : String(hash || '')
  return new URLSearchParams(withoutHash.startsWith('?') ? withoutHash.slice(1) : withoutHash)
}

export function parseLarkAppCanvasHandoffFromLocation(input: {
  search: string
  hash: string
}): LarkAppCanvasHandoffParseResult | null {
  const { search, hash } = input
  const params = new URLSearchParams(String(search || '').startsWith('?') ? String(search || '').slice(1) : String(search || ''))
  const fragment = readFragmentParams(hash)
  const knowledgeSourceToken = String(fragment.get(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF) || '').trim()
  const legacyToken = readLarkAppCanvasHandoffTokenFromSearch(search)
  if (knowledgeSourceToken && legacyToken) {
    return {
      ok: false,
      error: 'Lark handoff location must contain exactly one handoff payload.',
      rawToken: `ambiguous:${knowledgeSourceToken}:${legacyToken}`,
    }
  }
  if (knowledgeSourceToken) {
    try {
      const payload = JSON.parse(parsePayloadText(knowledgeSourceToken)) as Record<string, unknown>
      if (containsSecretLikeMaterial(payload) || containsForbiddenEndpointOverride(payload)) {
        throw new Error('Lark knowledge-source handoff contains forbidden material.')
      }
      const knowledgeSource = normalizeKnowledgeSourceHandoff(payload)
      if (!knowledgeSource) throw new Error('Lark knowledge-source handoff is invalid.')
      return {
        ok: true,
        rawToken: `knowledge-source:${knowledgeSourceToken}`,
        value: {
          source: 'lark-app',
          surface: 'backend',
          intent: 'import',
          openMainPanelTab: null,
          openEditorWorkspace: true,
          openCanvas: true,
          importAction: 'readKnowledgeSource',
          fileId: null,
          snapshot: null,
          knowledgeSource,
          returnUrl: null,
        },
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Invalid Lark knowledge-source handoff payload.',
        rawToken: `knowledge-source:${knowledgeSourceToken}`,
      }
    }
  }
  const rawToken = legacyToken
  if (!rawToken) return null
  try {
    const payloadText = parsePayloadText(rawToken)
    const parsed = JSON.parse(payloadText) as LarkAppCanvasHandoffInput
    return { ok: true, value: buildLarkAppCanvasHandoff(parsed), rawToken }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid Lark App Canvas handoff payload.',
      rawToken,
    }
  }
}

export function consumeLarkAppCanvasHandoffLocation(input: { search: string; hash: string }): void {
  try {
    const { search, hash } = input
    const params = new URLSearchParams(String(search || '').startsWith('?') ? String(search || '').slice(1) : String(search || ''))
    const fragment = readFragmentParams(hash)
    const hasKnowledgeSourceFragment = fragment.has(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF)
    if (!params.has(QUERY_PARAM_LARK_HANDOFF)
      && !params.has(QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH)
      && !hasKnowledgeSourceFragment) return
    params.delete(QUERY_PARAM_LARK_HANDOFF)
    params.delete(QUERY_PARAM_KNOWLEDGE_SOURCE_LAUNCH)
    fragment.delete(FRAGMENT_PARAM_KNOWLEDGE_SOURCE_HANDOFF)
    const next = params.toString()
    const nextFragment = hasKnowledgeSourceFragment
      ? (fragment.toString() ? `#${fragment.toString()}` : '')
      : String(hash || '')
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ''}${nextFragment}`
    window.history.replaceState(null, '', nextUrl)
    try {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    } catch {
      window.dispatchEvent(new Event('popstate'))
    }
  } catch {
    void 0
  }
}

export function buildLarkAppCanvasReviewHandoffQuery(): string {
  return buildLarkAppCanvasHandoffQuery({
    surface: 'webpage',
    intent: 'review',
    openMainPanelTab: 'mcp',
    openEditorWorkspace: true,
    openCanvas: true,
  })
}
