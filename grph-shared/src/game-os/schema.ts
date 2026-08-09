export const exactRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  field: string,
  optionalKeys: readonly string[] = [],
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`)
  }
  const record = value as Record<string, unknown>
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const unknownKeys = Object.keys(record).filter(key => !allowed.has(key))
  const missingKeys = requiredKeys.filter(key => !Object.hasOwn(record, key))
  if (unknownKeys.length > 0) throw new Error(`${field} has unknown keys: ${unknownKeys.join(',')}`)
  if (missingKeys.length > 0) throw new Error(`${field} lacks keys: ${missingKeys.join(',')}`)
  return record
}

export const exactText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${field} must be a non-empty normalized string`)
  }
  return value
}

export const exactSafeInteger = (
  value: unknown,
  field: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be a safe integer from ${minimum} to ${maximum}`)
  }
  return value
}

export const exactArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value
}
