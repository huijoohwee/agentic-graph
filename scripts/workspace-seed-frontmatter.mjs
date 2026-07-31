import { load as loadYaml } from 'js-yaml'

export const isRecord = value => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

export const parseYamlFrontmatter = (basename, source) => {
  const match = String(source || '').match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )
  if (!match) {
    throw new Error(
      `workspace document ${basename} must begin with YAML frontmatter`,
    )
  }
  let frontmatter
  try {
    frontmatter = loadYaml(match[1])
  } catch (error) {
    throw new Error(
      `workspace document ${basename} has invalid YAML frontmatter: ${error.message}`,
    )
  }
  if (!isRecord(frontmatter)) {
    throw new Error(
      `workspace document ${basename} frontmatter must parse as an object`,
    )
  }
  return frontmatter
}

const normalizePresetToken = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_+-]+/g, '')

export const readCanvasSurfaceMode = value => {
  const token = normalizePresetToken(value)
  if (token === '2d' || token === 'mode2d' || token === 'surface2d') return '2d'
  if (token === '3d' || token === 'mode3d' || token === 'surface3d') return '3d'
  if (token === 'xr' || token === 'xrmode' || token === 'surfacexr') return 'xr'
  if (token === 'geoxr' || token === 'geoxrmode' || token === 'surfacegeoxr') return 'geo-xr'
  if (
    token === 'geospatial'
    || token === 'geomode'
    || token === 'geospatialmode'
    || token === 'surfacegeospatial'
  ) return 'geospatial'
  return undefined
}

export const readCanvasRenderMode = value => {
  const token = normalizePresetToken(value)
  if (token === '2d' || token === 'mode2d' || token === 'surface2d') return '2d'
  if (
    token === '3d'
    || token === 'mode3d'
    || token === 'surface3d'
    || token === 'xr'
    || token === 'xrmode'
  ) return '3d'
  return undefined
}

export const readCanvas2dRenderer = value => {
  const token = normalizePresetToken(value)
  return token === 'flow' || token === 'flowcanvas' || token === 'canvas'
    ? 'flow'
    : undefined
}

export const readBooleanPreset = value => {
  if (typeof value === 'boolean') return value
  const token = normalizePresetToken(value)
  if (token === 'true' || token === '1' || token === 'yes' || token === 'on') {
    return true
  }
  if (token === 'false' || token === '0' || token === 'no' || token === 'off') {
    return false
  }
  return undefined
}

export { normalizePresetToken }
