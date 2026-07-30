export function readStoryboardNodeProperties(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return {}
  const properties = (node as { properties?: unknown }).properties
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {}
  return properties as Record<string, unknown>
}

export function readStoryboardScalar(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function readStoryboardNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function readStoryboardStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(readStoryboardScalar).filter(Boolean)
  const scalar = readStoryboardScalar(value)
  if (!scalar) return []
  return scalar.split(/[\n,|]+/g).map(readStoryboardScalar).filter(Boolean)
}
