import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { FALLBACK_DETAILS } from '@/features/panels/views/SettingsFallbackDetails'
import { settingsRegistry } from '@/features/settings/registry'
import type { SettingBackingKind, SettingMeta } from '@/features/settings/types'
import {
  buildResponsibilityMarkdownArtifacts,
  RESPONSIBILITY_MARKDOWN_DIRECTORY,
  RESPONSIBILITY_MARKDOWN_PART_PATTERN,
} from './settingsResponsibilityMarkdown'
import {
  resolveSettingsArea,
  resolveSettingsResponsibility,
} from './settingsResponsibilityTaxonomy'

export type SettingsFlowRow = {
  area: string
  modules: string[]
  classes: string[]
  functions: string[]
  responsibility: string
  imports: string[]
  notes: string
  lineRange: string
}

export type SettingsFlowSchema = Record<string, SettingsFlowRow>

export type SettingsFlowArtifact = {
  relativePath: string
  absolutePath: string
  content: string
}

export type SettingsFlowBuild = {
  schema: SettingsFlowSchema
  artifacts: SettingsFlowArtifact[]
}

type SourceFile = {
  modulePath: string
  lines: string[]
  text: string
}

type SourceLocation = {
  modulePath: string
  line: number
  tier: number
}

const JSON_ARTIFACT_PATHS = [
  'canvas/public/settings-flow.json',
  'canvas/src/features/settings/settings-flow.schema.json',
] as const

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareText)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function literalPattern(key: string): RegExp {
  return new RegExp(`['"]${escapeRegExp(key)}['"]`)
}

function collectTypeScriptFiles(directory: string): string[] {
  const results: string[] = []
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectTypeScriptFiles(absolutePath))
      continue
    }
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) results.push(absolutePath)
  }
  return results
}

function isProvenanceSource(modulePath: string): boolean {
  const normalized = toPosix(modulePath)
  if (normalized.includes('/__tests__/') || normalized.includes('/tests/')) return false
  if (normalized.includes('/cli/')) return false
  if (/\.(?:test|spec)\.tsx?$/.test(normalized)) return false
  return !normalized.endsWith('/features/panels/views/SettingsFallbackDetails.ts')
}

function readSourceFiles(repoRoot: string): SourceFile[] {
  const sourceRoot = path.join(repoRoot, 'canvas', 'src')
  return collectTypeScriptFiles(sourceRoot)
    .map(absolutePath => {
      const modulePath = toPosix(path.relative(repoRoot, absolutePath))
      const text = readFileSync(absolutePath, 'utf8')
      return { modulePath, lines: splitLines(text), text }
    })
    .filter(sourceFile => isProvenanceSource(sourceFile.modulePath))
    .sort((left, right) => compareText(left.modulePath, right.modulePath))
}

function ownershipTier(sourceFile: SourceFile, line: string, key: string): number {
  const directKey = new RegExp(`\\bkey\\s*:\\s*['"]${escapeRegExp(key)}['"]`)
  if (directKey.test(line) && sourceFile.text.includes('SettingMeta')) return 0
  if (directKey.test(line)) return 1
  return 2
}

function indexSettingLocations(
  sourceFiles: SourceFile[],
  keys: ReadonlySet<string>,
): Map<string, SourceLocation[]> {
  const locationsByKey = new Map<string, SourceLocation[]>()
  for (const sourceFile of sourceFiles) {
    sourceFile.lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (
        trimmed.startsWith('//')
        || trimmed.startsWith('/*')
        || trimmed.startsWith('*')
      ) {
        return
      }
      for (const match of line.matchAll(/(['"])([^'"]+)\1/g)) {
        const key = match[2] ?? ''
        if (!keys.has(key)) continue
        const locations = locationsByKey.get(key) ?? []
        locations.push({
          modulePath: sourceFile.modulePath,
          line: index + 1,
          tier: ownershipTier(sourceFile, line, key),
        })
        locationsByKey.set(key, locations)
      }
    })
  }
  for (const locations of locationsByKey.values()) {
    locations.sort((left, right) => (
      left.tier - right.tier
      || compareText(left.modulePath, right.modulePath)
      || left.line - right.line
    ))
  }
  return locationsByKey
}

function extractSetterNames(write: SettingMeta['write']): string[] {
  if (typeof write !== 'function') return []
  const matches = write.toString().match(/\.set[A-Za-z0-9_]+/g) ?? []
  return uniqueSorted(matches.map(match => match.slice(1)))
}

function extractClasses(meta: SettingMeta): string[] {
  const source = `${meta.read.toString()}\n${meta.write?.toString() ?? ''}`
  const classes: string[] = []
  if (source.includes('useGraphStore')) classes.push('useGraphStore')
  if (source.includes('localStorage')) classes.push('window.localStorage')
  if (source.includes('documentElement')) classes.push('window.document.documentElement')
  else if (source.includes('document')) classes.push('window.document')
  if (source.includes('window')) classes.push('window')
  return uniqueSorted(classes)
}

function importsForSource(source: SettingMeta['source']): SettingBackingKind[] {
  if (source === 'store') return ['zustand']
  if (source === 'localStorage') return ['localStorage']
  if (source === 'env') return ['import.meta.env']
  if (source === 'backendEnv') return ['window.__ENV__']
  if (source === 'eslint') return ['eslint']
  return []
}

function importsForSetting(meta: SettingMeta): SettingBackingKind[] {
  return uniqueSorted([
    ...importsForSource(meta.source),
    ...(meta.backingImports ?? []),
  ]) as SettingBackingKind[]
}

export function assertUniqueSettingKeys(registry: readonly SettingMeta[]): void {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const meta of registry) {
    if (seen.has(meta.key)) duplicates.add(meta.key)
    seen.add(meta.key)
  }
  if (duplicates.size > 0) {
    throw new Error(`Duplicate settings registry keys: ${[...duplicates].sort(compareText).join(', ')}`)
  }
}

function buildSchema(
  repoRoot: string,
  registry: readonly SettingMeta[] = settingsRegistry,
): SettingsFlowSchema {
  assertUniqueSettingKeys(registry)
  const sourceFiles = readSourceFiles(repoRoot)
  const keys = new Set(registry.map(meta => meta.key))
  const locationsByKey = indexSettingLocations(sourceFiles, keys)
  const metaByKey = new Map(registry.map(meta => [meta.key, meta] as const))
  const schema: SettingsFlowSchema = {}

  for (const key of [...keys].sort(compareText)) {
    const meta = metaByKey.get(key)
    if (!meta) throw new Error(`Missing registry metadata for ${key}`)
    const locations = locationsByKey.get(key) ?? []
    const selectedTier = locations[0]?.tier
    const owners = locations.filter(location => location.tier === selectedTier)
    if (owners.length === 0) {
      throw new Error(`No source literal provenance found for setting ${key}`)
    }
    if (owners.length > 1) {
      const candidates = owners.map(owner => `${owner.modulePath}:L${owner.line}`).join(', ')
      throw new Error(`Ambiguous source provenance for setting ${key}: ${candidates}`)
    }
    const owner = owners[0]
    if (!owner) throw new Error(`Missing source owner for setting ${key}`)

    const fallback = FALLBACK_DETAILS[key] ?? {}
    const setters = extractSetterNames(meta.write)

    schema[key] = {
      area: fallback.area || resolveSettingsArea(key, owner.modulePath),
      modules: [owner.modulePath],
      classes: extractClasses(meta),
      functions: setters,
      responsibility: fallback.responsibility || resolveSettingsResponsibility(key, meta.type),
      imports: importsForSetting(meta),
      notes: fallback.notes || '',
      lineRange: `${owner.modulePath}:L${owner.line}`,
    }
  }
  return schema
}

function parseLineReference(reference: string): { modulePath: string; start: number; end: number } {
  const match = reference.match(/^(.+):L(\d+)(?:-L?(\d+))?$/)
  if (!match) throw new Error(`Malformed source line reference: ${reference}`)
  const start = Number(match[2])
  const end = Number(match[3] ?? match[2])
  if (start < 1 || end < start) throw new Error(`Invalid source line range: ${reference}`)
  return { modulePath: match[1] ?? '', start, end }
}

export function validateSettingsFlow(
  repoRoot: string,
  schema: SettingsFlowSchema,
  registry: readonly SettingMeta[] = settingsRegistry,
): void {
  assertUniqueSettingKeys(registry)
  const expectedKeys = registry.map(meta => meta.key).sort(compareText)
  const actualKeys = Object.keys(schema).sort(compareText)
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `Settings flow key mismatch: expected ${expectedKeys.length}, received ${actualKeys.length}`,
    )
  }

  const fileLines = new Map<string, string[]>()
  const rootPrefix = `${path.resolve(repoRoot)}${path.sep}`
  for (const key of actualKeys) {
    const row = schema[key]
    if (!row) throw new Error(`Missing settings flow row for ${key}`)
    if (!row.area.trim() || row.area.trim() === '—') throw new Error(`Missing area for ${key}`)
    if (!row.responsibility.trim()) throw new Error(`Missing responsibility for ${key}`)
    if (row.modules.length === 0) throw new Error(`Missing source module for ${key}`)
    if (!row.lineRange.trim()) throw new Error(`Missing source line range for ${key}`)

    const references = row.lineRange.split(';').map(value => value.trim()).filter(Boolean)
    const parsedReferences = references.map(parseLineReference)
    const referencedModules = new Set(parsedReferences.map(reference => reference.modulePath))
    for (const modulePath of row.modules) {
      if (!referencedModules.has(modulePath)) {
        throw new Error(`Module ${modulePath} has no source line reference for ${key}`)
      }
    }

    let exactLiteralFound = false
    for (const reference of parsedReferences) {
      const absolutePath = path.resolve(repoRoot, reference.modulePath)
      if (!absolutePath.startsWith(rootPrefix) || !existsSync(absolutePath)) {
        throw new Error(`Missing source module ${reference.modulePath} for ${key}`)
      }
      const lines = fileLines.get(absolutePath)
        ?? splitLines(readFileSync(absolutePath, 'utf8'))
      fileLines.set(absolutePath, lines)
      if (reference.end > lines.length) {
        throw new Error(`Out-of-bounds source line reference ${reference.modulePath}:L${reference.end}`)
      }
      for (let line = reference.start; line <= reference.end; line += 1) {
        if (literalPattern(key).test(lines[line - 1] ?? '')) exactLiteralFound = true
      }
    }
    if (!exactLiteralFound) throw new Error(`No exact source literal at referenced lines for ${key}`)
  }
}

export function buildSettingsFlowArtifacts(repoRoot: string): SettingsFlowBuild {
  const schema = buildSchema(repoRoot)
  validateSettingsFlow(repoRoot, schema)
  const json = `${JSON.stringify(schema, null, 2)}\n`
  const markdownArtifacts = buildResponsibilityMarkdownArtifacts(
    Object.entries(schema).map(([key, row]) => ({ key, ...row })),
  )
  const artifacts = [
    ...markdownArtifacts,
    ...JSON_ARTIFACT_PATHS.map(relativePath => ({ relativePath, content: json })),
  ].map(artifact => ({
    ...artifact,
    absolutePath: path.join(repoRoot, artifact.relativePath),
  }))
  return { schema, artifacts }
}

function findUnexpectedMarkdownParts(
  repoRoot: string,
  artifacts: readonly SettingsFlowArtifact[],
): string[] {
  const directory = path.join(repoRoot, RESPONSIBILITY_MARKDOWN_DIRECTORY)
  if (!existsSync(directory)) return []
  const desired = new Set(artifacts.map(artifact => artifact.relativePath))
  return readdirSync(directory)
    .filter(filename => RESPONSIBILITY_MARKDOWN_PART_PATTERN.test(filename))
    .map(filename => `${RESPONSIBILITY_MARKDOWN_DIRECTORY}/${filename}`)
    .filter(relativePath => !desired.has(relativePath))
    .sort(compareText)
}

export function findStaleSettingsFlowArtifacts(
  artifacts: SettingsFlowArtifact[],
  repoRoot?: string,
): string[] {
  const stale = artifacts
    .filter(artifact => (
      !existsSync(artifact.absolutePath)
      || readFileSync(artifact.absolutePath, 'utf8') !== artifact.content
    ))
    .map(artifact => artifact.relativePath)
  return repoRoot ? [...stale, ...findUnexpectedMarkdownParts(repoRoot, artifacts)] : stale
}

export function writeSettingsFlowArtifacts(
  artifacts: SettingsFlowArtifact[],
  repoRoot?: string,
): void {
  const stagedPaths = artifacts.map((artifact, index) => (
    `${artifact.absolutePath}.tmp-${process.pid}-${index}`
  ))
  try {
    artifacts.forEach((artifact, index) => {
      const directory = path.dirname(artifact.absolutePath)
      mkdirSync(directory, { recursive: true })
      if (!statSync(directory).isDirectory()) throw new Error(`Missing artifact directory: ${directory}`)
      writeFileSync(stagedPaths[index] ?? '', artifact.content, 'utf8')
    })
    artifacts.forEach((artifact, index) => {
      renameSync(stagedPaths[index] ?? '', artifact.absolutePath)
    })
    if (repoRoot) {
      findUnexpectedMarkdownParts(repoRoot, artifacts).forEach(relativePath => {
        unlinkSync(path.join(repoRoot, relativePath))
      })
    }
  } finally {
    stagedPaths.forEach(stagedPath => {
      if (existsSync(stagedPath)) unlinkSync(stagedPath)
    })
  }
}
