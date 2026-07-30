import { load as loadYaml } from 'js-yaml'

export function requireSourceMarkers(source, markers, label) {
  const missing = markers.filter(marker => !source.includes(marker))
  if (missing.length > 0) {
    throw new Error(`${label} is missing required source markers: ${missing.join(', ')}`)
  }
}

export function parseYamlFrontmatter(source, relativePath) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`${relativePath} must begin with YAML frontmatter`)
  let value
  try {
    value = loadYaml(match[1])
  } catch (error) {
    throw new Error(`${relativePath} has invalid YAML frontmatter: ${error.message}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${relativePath} frontmatter must be an object`)
  }
  return value
}

export function requireOrderedSourceMarkers(source, markers, label) {
  let cursor = -1
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1)
    if (next < 0) {
      throw new Error(`${label} must contain ${marker} after the preceding readiness step`)
    }
    cursor = next
  }
}
