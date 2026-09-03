import path from 'node:path'

export const assertSafeRoot = (root, label) => {
  const resolved = path.resolve(root)
  if (resolved === path.parse(resolved).root) throw new Error(`${label} cannot be a filesystem root`)
  return resolved
}

export const normalizeRelativePath = value => {
  const normalized = String(value || '').replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) {
    throw new Error(`Invalid artifact-relative path: ${JSON.stringify(value)}`)
  }
  const parts = normalized.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe artifact-relative path: ${JSON.stringify(value)}`)
  }
  return normalized
}

export const resolveWithin = (root, relativePath) => {
  const normalized = normalizeRelativePath(relativePath)
  const resolved = path.resolve(root, ...normalized.split('/'))
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path escapes its root: ${relativePath}`)
  }
  return resolved
}

export const normalizeGitRelativePath = value => {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`Git diff contains a noncanonical path: ${JSON.stringify(value)}`)
  }
  const parts = value.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Git diff contains an unsafe path: ${JSON.stringify(value)}`)
  }
  return value
}

export const parseNulTerminatedGitPaths = output => {
  const records = []
  let start = 0
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== 0) continue
    const bytes = output.subarray(start, index)
    start = index + 1
    if (bytes.length === 0) continue
    const decoded = bytes.toString('utf8')
    if (!Buffer.from(decoded, 'utf8').equals(bytes)) throw new Error('Git diff path is not valid UTF-8')
    records.push(normalizeGitRelativePath(decoded))
  }
  if (start !== output.length) throw new Error('Git diff path inventory is not NUL-terminated')
  return records
}
