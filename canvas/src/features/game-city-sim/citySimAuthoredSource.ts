import {
  CITY_SIM_SCHEMA_ID,
  validateCityGrid,
  type CityGrid,
} from './citySimModel'
import { parseCityGridDocument } from './citySimCodec'

export type CitySimAuthoredSource = Readonly<{
  city: CityGrid
}>

export type CitySimAuthoredSourceError = Readonly<{
  code: 'malformed-source' | 'unsupported-schema' | 'invalid-city'
  message: string
}>

export type CitySimAuthoredSourceResult =
  | Readonly<{ ok: true; source: CitySimAuthoredSource }>
  | Readonly<{ ok: false; error: CitySimAuthoredSourceError }>

const CITY_POI_ZONING_HEADING = '## Authored initial POI zoning'

function sourceFrontmatter(document: string): string {
  if (document.includes('\r')) throw new Error('City source line endings must be LF')
  if (!document.startsWith('---\n')) {
    throw new Error('City source must begin with YAML frontmatter')
  }
  const closingIndex = document.indexOf('\n---\n', 4)
  if (closingIndex < 0) throw new Error('City source frontmatter is not closed')
  return document.slice(4, closingIndex)
}

function section(frontmatter: string, name: string): readonly string[] {
  const lines = frontmatter.split('\n')
  const header = `${name}:`
  const indexes = lines.flatMap((line, index) => line === header ? [index] : [])
  if (indexes.length !== 1) {
    throw new Error(`City source must contain exactly one ${name} section`)
  }
  const start = indexes[0] + 1
  let end = start
  while (end < lines.length && (lines[end].startsWith('  ') || !lines[end])) end += 1
  return Object.freeze(lines.slice(start, end))
}

function sectionValue(lines: readonly string[], key: string): string {
  const prefix = `  ${key}: `
  const values = lines
    .filter(line => line.startsWith(prefix))
    .map(line => line.slice(prefix.length))
  if (values.length !== 1 || !values[0]) {
    throw new Error(`City source field ${key} must appear exactly once`)
  }
  return values[0]
}

function canonicalInteger(value: string, label: string): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must use canonical base-10 integer text`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} must be a safe integer`)
  return parsed
}

function quotedString(value: string, label: string): string {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'string' || !parsed.trim()) throw new Error()
    return parsed
  } catch {
    throw new Error(`${label} must be a non-empty JSON string`)
  }
}

function poiZoningCsv(document: string): string {
  const fence = String.fromCharCode(96).repeat(3)
  const headingStart = document.indexOf(CITY_POI_ZONING_HEADING)
  if (
    headingStart < 0
    || document.lastIndexOf(CITY_POI_ZONING_HEADING) !== headingStart
  ) {
    throw new Error('City source must contain exactly one authored initial POI zoning block')
  }
  const marker = `${fence}csv\n`
  const fenceStart = document.indexOf(marker, headingStart + CITY_POI_ZONING_HEADING.length)
  const nextHeading = document.indexOf('\n## ', headingStart + CITY_POI_ZONING_HEADING.length)
  if (fenceStart < 0 || (nextHeading >= 0 && fenceStart > nextHeading)) {
    throw new Error('City source authored initial POI zoning CSV block is missing')
  }
  const contentStart = fenceStart + marker.length
  const contentEnd = document.indexOf(`\n${fence}`, contentStart)
  if (contentEnd < 0) {
    throw new Error('City source authored initial POI zoning CSV block is not closed')
  }
  return document.slice(contentStart, contentEnd)
}

function encodeFrontmatterString(value: string): string {
  return /^[A-Za-z0-9 _.-]+$/.test(value) && value.trim() === value
    ? value
    : JSON.stringify(value)
}

function parseAuthoredCity(frontmatter: string, document: string): CityGrid {
  const runtime = section(frontmatter, 'city_runtime')
  const initial = section(frontmatter, 'city_initial')
  const schemaId = quotedString(sectionValue(runtime, 'schema_id'), 'City schema id')
  if (schemaId !== CITY_SIM_SCHEMA_ID) {
    throw new Error(`Unsupported city schema ${schemaId}`)
  }
  const cityName = quotedString(sectionValue(initial, 'city_name'), 'City name')
  const regionalPoiProfileId = quotedString(
    sectionValue(initial, 'regional_poi_profile_id'),
    'Regional POI profile id',
  )
  const rows = canonicalInteger(sectionValue(initial, 'rows'), 'City rows')
  const columns = canonicalInteger(sectionValue(initial, 'columns'), 'City columns')
  const tick = canonicalInteger(sectionValue(initial, 'tick'), 'City tick')
  const treasuryCents = canonicalInteger(
    sectionValue(initial, 'treasury_cents'),
    'City treasury',
  )
  const taxRateBasisPoints = canonicalInteger(
    sectionValue(initial, 'tax_rate_basis_points'),
    'City tax rate',
  )
  const canonicalDocument = [
    '---',
    `schema_id: ${schemaId}`,
    `city_name: ${encodeFrontmatterString(cityName)}`,
    `regional_poi_profile_id: ${encodeFrontmatterString(regionalPoiProfileId)}`,
    `tick: ${tick}`,
    `treasury_cents: ${treasuryCents}`,
    `tax_rate_basis_points: ${taxRateBasisPoints}`,
    '---',
    '',
    poiZoningCsv(document),
    '',
  ].join('\n')
  const parsed = parseCityGridDocument(canonicalDocument)
  if (parsed.ok === false) throw new Error(parsed.error.message)
  if (parsed.city.rows !== rows || parsed.city.columns !== columns) {
    throw new Error(
      `Authored City ordering dimensions ${rows}x${columns} do not match its POI zoning table ${parsed.city.rows}x${parsed.city.columns}`,
    )
  }
  return parsed.city
}

export function validateCitySimAuthoredSource(
  source: CitySimAuthoredSource,
): readonly string[] {
  return validateCityGrid(source.city)
}

function classifyError(error: unknown): CitySimAuthoredSourceError {
  const message = error instanceof Error ? error.message : String(error)
  return Object.freeze({
    code: message.startsWith('Unsupported city schema')
      ? 'unsupported-schema'
      : message.startsWith('Invalid city grid')
        ? 'invalid-city'
        : 'malformed-source',
    message,
  })
}

export function parseCitySimAuthoredSource(
  document: string,
): CitySimAuthoredSourceResult {
  try {
    const normalizedDocument = String(document)
    const frontmatter = sourceFrontmatter(normalizedDocument)
    const runReady = section(frontmatter, 'run_ready_demo')
    if (quotedString(sectionValue(runReady, 'id'), 'Run-ready demo id') !== 'city-sim') {
      throw new Error('City source run_ready_demo.id must be city-sim')
    }
    const source = Object.freeze({
      city: parseAuthoredCity(frontmatter, normalizedDocument),
    })
    const issues = validateCitySimAuthoredSource(source)
    if (issues.length > 0) {
      throw new Error(`Invalid city grid: ${issues.join('; ')}`)
    }
    return Object.freeze({ ok: true, source })
  } catch (error) {
    return Object.freeze({ ok: false, error: classifyError(error) })
  }
}
