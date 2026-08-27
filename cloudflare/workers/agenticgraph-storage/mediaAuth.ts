// =============================================================================
// Media auth helpers — knowgrph-storage worker
// knowgrph-widget-canvas-media spec · Task 7.2
// Requirements R4.5, R4.6, R9.3, R9.4, R9.5
//
// Auth strategy (offline-testable, no shared secret):
//   Authorization: Bearer <token>
//   or ?kg_media_token=<token> for browser-openable, short-lived media links.
//   where <token> is a base64url-encoded JSON object: { runId, expiresAt }
//
// Verification:
//   (a) token is not expired  (expiresAt > Date.now())
//   (b) token's runId matches the R2 key's runId
//
// Export `verifyMediaAuth` as a pure helper for unit tests.
// Export `MEDIA_AUTH_UNAUTHENTICATED_CODE` and `MEDIA_AUTH_UNAUTHORIZED_CODE`.
// =============================================================================

// -----------------------------------------------------------------------------
// Error code constants (exported for tests and callers)
// -----------------------------------------------------------------------------

export const MEDIA_AUTH_UNAUTHENTICATED_CODE = 'authentication_required' as const
export const MEDIA_AUTH_UNAUTHORIZED_CODE = 'authorization_failed' as const

// -----------------------------------------------------------------------------
// AuthProvider type (injectable for offline tests)
// -----------------------------------------------------------------------------

export type MediaAuthResult =
  | { ok: true }
  | { ok: false; authError: string; code: typeof MEDIA_AUTH_UNAUTHENTICATED_CODE | typeof MEDIA_AUTH_UNAUTHORIZED_CODE }

export type MediaAuthProvider = (
  request: Request,
  runId: string,
) => Promise<MediaAuthResult> | MediaAuthResult

// -----------------------------------------------------------------------------
// Base64url decode helper (no dependency, works in Node and Workers)
// -----------------------------------------------------------------------------

function base64urlDecode(s: string): Uint8Array | null {
  try {
    // Convert base64url → base64 standard
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

// -----------------------------------------------------------------------------
// Parse + validate the Bearer token payload
// -----------------------------------------------------------------------------

function parseTokenPayload(token: string): { runId: string; expiresAt: number } | null {
  const bytes = base64urlDecode(token)
  if (!bytes) return null
  let text: string
  try {
    text = new TextDecoder().decode(bytes)
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).runId !== 'string' ||
    typeof (parsed as Record<string, unknown>).expiresAt !== 'number'
  ) {
    return null
  }
  return parsed as { runId: string; expiresAt: number }
}

// -----------------------------------------------------------------------------
// verifyMediaAuth — pure helper, unit-testable
//
// Reads the `Authorization: Bearer <token>` header or `kg_media_token` URL
// query parameter, decodes the token, and
// checks:
//   1. Header present and has a non-empty token → else 401
//   2. Token is parseable and not expired       → else 401
//   3. Token's runId matches the object's runId → else 403
//
// Optional `options.now` lets tests inject a clock (defaults to Date.now).
// -----------------------------------------------------------------------------

export interface VerifyMediaAuthOptions {
  /** Injectable clock for tests. Defaults to `Date.now`. */
  now?: () => number
}

export function verifyMediaAuth(
  request: Request,
  runId: string,
  options: VerifyMediaAuthOptions = {},
): MediaAuthResult {
  const now = options.now ?? Date.now

  // 1. Extract Authorization header or query token
  const authHeader = request.headers.get('authorization') ?? ''
  const bearerPrefix = 'Bearer '
  let token = authHeader.startsWith(bearerPrefix) ? authHeader.slice(bearerPrefix.length).trim() : ''
  if (!token) {
    try {
      token = new URL(request.url).searchParams.get('kg_media_token')?.trim() || ''
    } catch {
      token = ''
    }
  }
  if (!token) {
    return {
      ok: false,
      authError: 'authentication required',
      code: MEDIA_AUTH_UNAUTHENTICATED_CODE,
    }
  }

  // 2. Parse and check expiry
  const payload = parseTokenPayload(token)
  if (!payload) {
    return {
      ok: false,
      authError: 'authentication required',
      code: MEDIA_AUTH_UNAUTHENTICATED_CODE,
    }
  }

  if (payload.expiresAt <= now()) {
    return {
      ok: false,
      authError: 'authentication required',
      code: MEDIA_AUTH_UNAUTHENTICATED_CODE,
    }
  }

  // 3. Check run-scoped authorization
  if (payload.runId !== runId) {
    return {
      ok: false,
      authError: 'access denied',
      code: MEDIA_AUTH_UNAUTHORIZED_CODE,
    }
  }

  return { ok: true }
}

// -----------------------------------------------------------------------------
// extractRunIdFromKey — parse runId from R2 key ".../runs/{runId}/..."
// -----------------------------------------------------------------------------

export function extractRunIdFromKey(objectKey: string): string | null {
  const parts = objectKey.split('/')
  const runsIndex = parts.indexOf('runs')
  if (runsIndex < 0 || parts.length <= runsIndex + 1) return null
  const runId = parts[runsIndex + 1]
  return runId && runId.length > 0 ? runId : null
}

// -----------------------------------------------------------------------------
// defaultAuthProvider — uses verifyMediaAuth with real Date.now clock
// -----------------------------------------------------------------------------

export const defaultMediaAuthProvider: MediaAuthProvider = (request, runId) =>
  verifyMediaAuth(request, runId)
