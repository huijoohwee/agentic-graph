import { normalizeString } from './db'

const SCHEMA = 'agenticgraph-storage-crawler-cursor/v1' as const

const encode = (value: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export const encodeAgenticGraphStorageCrawlerCursor = (args: {
  workspaceId: string; canonicalPath: string; id: string
}): string => encode({ schema: SCHEMA, ...args })

export const decodeAgenticGraphStorageCrawlerCursor = (token: string, workspaceId: string): {
  canonicalPath: string; id: string
} => {
  if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 4_096) throw new Error('invalid crawler page cursor')
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=')
    const binary = atob(base64)
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, character => character.charCodeAt(0)),
    )) as Record<string, unknown>
    const path = normalizeString(value.canonicalPath)
    const id = normalizeString(value.id)
    if (value.schema !== SCHEMA || normalizeString(value.workspaceId) !== workspaceId || !path || !id) throw new Error()
    return { canonicalPath: path, id }
  } catch {
    throw new Error('invalid crawler page cursor')
  }
}
