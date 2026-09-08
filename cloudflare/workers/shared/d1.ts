export type D1RunResult = { success?: boolean; meta?: unknown; results?: unknown[] }
export type D1AllResult<T> = { results?: T[] }
export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike
  run: () => Promise<D1RunResult>
  all: <T = Record<string, unknown>>() => Promise<D1AllResult<T>>
}
export type D1DatabaseLike = {
  batch?(statements: D1StatementLike[]): Promise<D1RunResult[]>
  prepare: (query: string) => D1StatementLike
}

export const readDb = (env: { DB?: unknown }): D1DatabaseLike | null => {
  const candidate = env.DB
  if (!candidate || typeof candidate !== 'object') return null
  const db = candidate as Partial<D1DatabaseLike>
  return typeof db.prepare === 'function' ? (db as D1DatabaseLike) : null
}

export const normalizeString = (value: unknown): string => String(value || '').trim()

export const normalizeNullableString = (value: unknown): string | null => {
  const next = normalizeString(value)
  return next ? next : null
}

export const normalizeNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback
}

export const isoFromMs = (updatedAtMs: number, fallbackIso: string): string => {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return fallbackIso
  try {
    return new Date(updatedAtMs).toISOString()
  } catch {
    return fallbackIso
  }
}

export const queryAll = async <T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> => {
  const result = await db.prepare(sql).bind(...values).all<T>()
  return Array.isArray(result.results) ? result.results : []
}

export const queryFirst = async <T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = [],
): Promise<T | null> => {
  const rows = await queryAll<T>(db, sql, values)
  return rows[0] ?? null
}

export const execute = async (db: D1DatabaseLike, sql: string, values: unknown[] = []): Promise<void> => {
  await db.prepare(sql).bind(...values).run()
}
