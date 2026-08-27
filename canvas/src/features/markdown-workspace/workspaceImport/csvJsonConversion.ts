import type { WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath, workspaceBasename, workspaceStem } from '@/features/workspace-fs/path'
import type { WorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  generateDelimitedText,
  AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER,
  AGENTICGRAPH_DELIMITED_TEXT_PARSER_VERSION,
  defaultDelimitedTextDelimiterForName,
  parseDelimitedText,
  rowsToRecords,
  type DelimitedTextDiagnostic,
  type DelimitedTextParseOptions,
  type DelimitedTextParseResult,
} from '@/lib/delimited-text/delimitedText'
import { parseDelimitedTextWithWorkerFallback } from '@/lib/delimited-text/delimitedTextWorkerBridge'

export type CsvJsonConversionDirection = 'delimited-to-json' | 'json-to-delimited'

export type CsvJsonConversionDiagnostic = DelimitedTextDiagnostic | {
  severity: 'warning' | 'error'
  code: 'invalid-json' | 'unsupported-json-root'
  message: string
}

export type CsvJsonConversionOptions = {
  delimiter?: string
  sourceKind: 'local' | 'url'
  sourceUrl?: string | null
  originalName?: string | null
}

export type CsvJsonConversionMetadata = {
  conversionId: string
  sourcePath: string
  sourceHash: string
  direction: CsvJsonConversionDirection
  sourceFormat: string
  targetFormat: string
  rowCount?: number
  fieldNames?: string[]
  delimiter?: string
  newline?: string
  parserOwner: typeof AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER | 'native-json'
  parserVersion: string
  safety: {
    formulaEscaping?: boolean
  }
  diagnosticsSummary: {
    warnings: number
    errors: number
  }
  createdAt: string
}

export type CsvJsonDerivedArtifact = {
  targetName: string
  targetText: string
  metadataName: string
  metadataText: string
  targetFormat: 'json' | 'csv'
  metadata: CsvJsonConversionMetadata
  diagnostics: CsvJsonConversionDiagnostic[]
}

type TabularJsonModel = {
  fields: string[]
  rows: unknown[][]
  sourceShape: 'array-of-objects' | 'array-of-arrays' | 'fields-data'
}

type CsvJsonImportArtifactsResult = {
  createdPaths: WorkspacePath[]
  sources: Array<{ path: WorkspacePath; source: WorkspaceEntrySource }>
  jsonSourceDocuments: Array<{ path: WorkspacePath; text: string }>
  diagnostics: CsvJsonConversionDiagnostic[]
}

export type CsvJsonWorkspaceExportTargetFormat = 'json' | 'csv'

export type CsvJsonWorkspaceExportArtifact = {
  name: string
  text: string
  targetFormat: CsvJsonWorkspaceExportTargetFormat
  source: 'active-document' | 'source-attached-json' | 'converted'
  mimeType: string
  description: string
  accept: Record<string, string[]>
}

const DELIMITED_EXTS = new Set(['csv', 'tsv', 'tab'])
const JSON_EXTS = new Set(['json', 'geojson', 'jsonld'])

function pathParent(path: WorkspacePath): WorkspacePath {
  const normalized = normalizeWorkspacePath(path)
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return '/'
  return normalizeWorkspacePath(normalized.slice(0, index))
}

function extensionLower(nameRaw: string): string {
  const base = workspaceBasename(nameRaw).toLowerCase()
  const index = base.lastIndexOf('.')
  return index > 0 ? base.slice(index + 1) : ''
}

export function isCsvJsonConvertibleImportName(nameRaw: string): boolean {
  const ext = extensionLower(nameRaw)
  return DELIMITED_EXTS.has(ext) || JSON_EXTS.has(ext)
}

function formatForName(nameRaw: string): string {
  const ext = extensionLower(nameRaw)
  if (ext === 'tsv' || ext === 'tab') return 'tsv'
  if (DELIMITED_EXTS.has(ext)) return 'csv'
  if (JSON_EXTS.has(ext)) return ext
  return 'unknown'
}

function summarizeDiagnostics(diagnostics: CsvJsonConversionDiagnostic[]): { warnings: number; errors: number } {
  return diagnostics.reduce(
    (acc, item) => {
      if (item.severity === 'error') acc.errors += 1
      else acc.warnings += 1
      return acc
    },
    { warnings: 0, errors: 0 },
  )
}

function hasFatalDiagnostics(diagnostics: CsvJsonConversionDiagnostic[]): boolean {
  return diagnostics.some(item => item.severity === 'error')
}

function buildMetadata(args: {
  sourcePath: WorkspacePath
  sourceText: string
  direction: CsvJsonConversionDirection
  sourceFormat: string
  targetFormat: string
  rowCount?: number
  fieldNames?: string[]
  delimiter?: string
  newline?: string
  parserOwner: CsvJsonConversionMetadata['parserOwner']
  safety?: CsvJsonConversionMetadata['safety']
  diagnostics: CsvJsonConversionDiagnostic[]
}): CsvJsonConversionMetadata {
  const sourceHash = hashStringToHex(args.sourceText)
  return {
    conversionId: hashStringToHex([
      'csv-json',
      args.sourcePath,
      sourceHash,
      args.direction,
      args.targetFormat,
    ].join('|')),
    sourcePath: args.sourcePath,
    sourceHash,
    direction: args.direction,
    sourceFormat: args.sourceFormat,
    targetFormat: args.targetFormat,
    ...(typeof args.rowCount === 'number' ? { rowCount: args.rowCount } : {}),
    ...(args.fieldNames && args.fieldNames.length > 0 ? { fieldNames: args.fieldNames } : {}),
    ...(args.delimiter ? { delimiter: args.delimiter } : {}),
    ...(args.newline ? { newline: args.newline } : {}),
    parserOwner: args.parserOwner,
    parserVersion: args.parserOwner === 'native-json' ? 'runtime' : AGENTICGRAPH_DELIMITED_TEXT_PARSER_VERSION,
    safety: args.safety || {},
    diagnosticsSummary: summarizeDiagnostics(args.diagnostics),
    createdAt: new Date().toISOString(),
  }
}

function buildMetadataText(metadata: CsvJsonConversionMetadata, diagnostics: CsvJsonConversionDiagnostic[]): string {
  return `${JSON.stringify({
    kind: 'agenticgraph-csv-json-conversion-metadata',
    metadata,
    diagnostics,
  }, null, 2)}\n`
}

function buildCsvJsonExportName(pathRaw: WorkspacePath | string, targetFormat: CsvJsonWorkspaceExportTargetFormat): string {
  const normalized = normalizeWorkspacePath(pathRaw)
  const stem = workspaceStem(normalized) || workspaceStem(normalizeWorkspacePath(`/${String(pathRaw || 'document')}`)) || 'document'
  return `${stem}.${targetFormat}`
}

function buildCsvJsonWorkspaceExportArtifact(args: {
  activeDocumentPath: WorkspacePath
  text: string
  targetFormat: CsvJsonWorkspaceExportTargetFormat
  source: CsvJsonWorkspaceExportArtifact['source']
}): CsvJsonWorkspaceExportArtifact {
  const isJson = args.targetFormat === 'json'
  return {
    name: buildCsvJsonExportName(args.activeDocumentPath, args.targetFormat),
    text: args.text,
    targetFormat: args.targetFormat,
    source: args.source,
    mimeType: isJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
    description: isJson ? 'JSON Files' : 'CSV Files',
    accept: isJson ? { 'application/json': ['.json'] } : { 'text/csv': ['.csv'] },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeFields(fieldsRaw: unknown[]): string[] {
  const fields: string[] = []
  const seen = new Map<string, number>()
  for (let index = 0; index < fieldsRaw.length; index += 1) {
    const raw = String(fieldsRaw[index] ?? '').trim()
    const base = raw || `field_${index + 1}`
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    fields.push(count === 0 ? base : `${base}_${count + 1}`)
  }
  return fields
}

function resolveTabularJson(value: unknown): TabularJsonModel | null {
  if (Array.isArray(value)) {
    if (value.every(Array.isArray)) {
      return { fields: [], rows: value.map(row => [...row]), sourceShape: 'array-of-arrays' }
    }
    if (value.every(isRecord)) {
      const fields: string[] = []
      const seen = new Set<string>()
      for (const record of value) {
        for (const key of Object.keys(record)) {
          if (seen.has(key)) continue
          seen.add(key)
          fields.push(key)
        }
      }
      const rows = value.map(record => fields.map(field => record[field]))
      return { fields, rows, sourceShape: 'array-of-objects' }
    }
    return null
  }
  if (!isRecord(value)) return null
  const fieldsRaw = value.fields
  const dataRaw = value.data
  if (!Array.isArray(fieldsRaw) || !Array.isArray(dataRaw) || !dataRaw.every(Array.isArray)) return null
  const fields = normalizeFields(fieldsRaw)
  return { fields, rows: dataRaw.map(row => [...row]), sourceShape: 'fields-data' }
}

function buildDelimitedToJsonArtifactFromParseResult(args: {
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
  parsed: DelimitedTextParseResult
  allowFatalDiagnostics?: boolean
}): CsvJsonDerivedArtifact | null {
  const parsed = args.parsed
  const diagnostics = parsed.diagnostics
  if (!args.allowFatalDiagnostics && hasFatalDiagnostics(diagnostics)) return null
  const rows = rowsToRecords(parsed.rows, parsed.headers)
  const metadata = buildMetadata({
    sourcePath: args.sourcePath,
    sourceText: args.sourceText,
    direction: 'delimited-to-json',
    sourceFormat: formatForName(args.sourceName),
    targetFormat: 'json',
    rowCount: rows.length,
    fieldNames: parsed.headers,
    delimiter: parsed.metadata.delimiter,
    newline: parsed.metadata.newline,
    parserOwner: AGENTICGRAPH_DELIMITED_TEXT_PARSER_OWNER,
    diagnostics,
  })
  const conversion = {
    direction: metadata.direction,
    sourcePath: metadata.sourcePath,
    sourceFormat: metadata.sourceFormat,
    targetFormat: metadata.targetFormat,
  }
  const targetText = `${JSON.stringify({ rows, metadata, diagnostics, conversion }, null, 2)}\n`
  const stem = workspaceStem(args.sourcePath) || workspaceStem(args.sourceName) || 'import'
  return {
    targetName: `${stem}.json`,
    targetText,
    metadataName: `${stem}.conversion.json`,
    metadataText: buildMetadataText(metadata, diagnostics),
    targetFormat: 'json',
    metadata,
    diagnostics,
  }
}

async function buildDelimitedToJsonArtifact(args: {
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
  options?: CsvJsonConversionOptions
}): Promise<CsvJsonDerivedArtifact | null> {
  const delimiterOptions: DelimitedTextParseOptions = {
    header: true,
    delimiter: args.options?.delimiter || defaultDelimitedTextDelimiterForName(args.sourceName),
    chunkSizeChars: 64 * 1024,
  }
  const parsed = await parseDelimitedTextWithWorkerFallback(args.sourceText, delimiterOptions)
  return buildDelimitedToJsonArtifactFromParseResult({ ...args, parsed })
}

export function buildDelimitedTextJsonPreviewText(args: {
  sourcePath: WorkspacePath | string
  sourceName?: string | null
  sourceText: string
  options?: CsvJsonConversionOptions
}): string | null {
  const sourcePath = normalizeWorkspacePath(args.sourcePath)
  const sourceName = String(args.sourceName || workspaceBasename(sourcePath) || sourcePath)
  const ext = extensionLower(sourceName || sourcePath)
  if (!DELIMITED_EXTS.has(ext)) return null
  const parsed = parseDelimitedText(args.sourceText, {
    header: true,
    delimiter: args.options?.delimiter || defaultDelimitedTextDelimiterForName(sourceName),
    chunkSizeChars: 64 * 1024,
  })
  const artifact = buildDelimitedToJsonArtifactFromParseResult({
    sourcePath,
    sourceName,
    sourceText: args.sourceText,
    parsed,
    allowFatalDiagnostics: true,
  })
  return artifact?.targetText ?? null
}

function buildJsonToDelimitedArtifact(args: {
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
}): CsvJsonDerivedArtifact | null {
  let value: unknown
  try {
    value = JSON.parse(args.sourceText)
  } catch (error) {
    void error
    return null
  }
  const model = resolveTabularJson(value)
  if (!model) return null
  const diagnostics: CsvJsonConversionDiagnostic[] = []
  const targetText = `${generateDelimitedText(model.rows, {
    fields: model.fields.length > 0 ? model.fields : undefined,
    escapeFormulaCells: true,
  })}\n`
  const metadata = buildMetadata({
    sourcePath: args.sourcePath,
    sourceText: args.sourceText,
    direction: 'json-to-delimited',
    sourceFormat: formatForName(args.sourceName),
    targetFormat: 'csv',
    rowCount: model.rows.length,
    fieldNames: model.fields,
    delimiter: ',',
    newline: '\r\n',
    parserOwner: 'native-json',
    safety: { formulaEscaping: true },
    diagnostics,
  })
  const stem = workspaceStem(args.sourcePath) || workspaceStem(args.sourceName) || 'import'
  return {
    targetName: `${stem}.csv`,
    targetText,
    metadataName: `${stem}.conversion.json`,
    metadataText: buildMetadataText(metadata, diagnostics),
    targetFormat: 'csv',
    metadata,
    diagnostics,
  }
}

export async function buildCsvJsonDerivedArtifact(args: {
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
  options?: CsvJsonConversionOptions
}): Promise<CsvJsonDerivedArtifact | null> {
  const ext = extensionLower(args.sourceName || args.sourcePath)
  if (DELIMITED_EXTS.has(ext)) return await buildDelimitedToJsonArtifact(args)
  if (JSON_EXTS.has(ext)) return buildJsonToDelimitedArtifact(args)
  return null
}

export async function resolveCsvJsonWorkspaceExport(args: {
  activeDocumentPath: WorkspacePath | string
  activeText: string
  targetFormat: CsvJsonWorkspaceExportTargetFormat
  jsonSourceText?: string | null
  options?: CsvJsonConversionOptions
}): Promise<CsvJsonWorkspaceExportArtifact | null> {
  const activeDocumentPath = normalizeWorkspacePath(args.activeDocumentPath)
  const sourceName = workspaceBasename(activeDocumentPath) || String(args.activeDocumentPath || 'document')
  const sourceText = String(args.activeText ?? '')
  const ext = extensionLower(sourceName)

  if (args.targetFormat === 'json') {
    const sourceAttachedJson = typeof args.jsonSourceText === 'string' && args.jsonSourceText.trim()
      ? args.jsonSourceText
      : ''
    if (sourceAttachedJson) {
      return buildCsvJsonWorkspaceExportArtifact({
        activeDocumentPath,
        text: sourceAttachedJson,
        targetFormat: 'json',
        source: 'source-attached-json',
      })
    }
    if (JSON_EXTS.has(ext)) {
      return buildCsvJsonWorkspaceExportArtifact({
        activeDocumentPath,
        text: sourceText,
        targetFormat: 'json',
        source: 'active-document',
      })
    }
    if (DELIMITED_EXTS.has(ext)) {
      const artifact = await buildCsvJsonDerivedArtifact({
        sourcePath: activeDocumentPath,
        sourceName,
        sourceText,
        options: args.options,
      })
      if (artifact?.targetFormat === 'json') {
        return buildCsvJsonWorkspaceExportArtifact({
          activeDocumentPath,
          text: artifact.targetText,
          targetFormat: 'json',
          source: 'converted',
        })
      }
    }
    return null
  }

  if (ext === 'csv') {
    return buildCsvJsonWorkspaceExportArtifact({
      activeDocumentPath,
      text: sourceText,
      targetFormat: 'csv',
      source: 'active-document',
    })
  }
  if (JSON_EXTS.has(ext)) {
    const artifact = await buildCsvJsonDerivedArtifact({
      sourcePath: activeDocumentPath,
      sourceName,
      sourceText,
      options: args.options,
    })
    if (artifact?.targetFormat === 'csv') {
      return buildCsvJsonWorkspaceExportArtifact({
        activeDocumentPath,
        text: artifact.targetText,
        targetFormat: 'csv',
        source: 'converted',
      })
    }
  }
  return null
}

export async function materializeCsvJsonImportArtifacts(args: {
  fs: WorkspaceFs
  sourcePath: WorkspacePath
  sourceName: string
  sourceText: string
  source: WorkspaceEntrySource
  options?: CsvJsonConversionOptions
}): Promise<CsvJsonImportArtifactsResult> {
  if (!isCsvJsonConvertibleImportName(args.sourceName || args.sourcePath)) {
    return { createdPaths: [], sources: [], jsonSourceDocuments: [], diagnostics: [] }
  }
  const sourcePath = normalizeWorkspacePath(args.sourcePath)
  const artifact = await buildCsvJsonDerivedArtifact({
    sourcePath,
    sourceName: args.sourceName,
    sourceText: args.sourceText,
    options: args.options,
  })
  if (!artifact) return { createdPaths: [], sources: [], jsonSourceDocuments: [], diagnostics: [] }
  if (artifact.targetFormat === 'json') {
    return {
      createdPaths: [],
      sources: [],
      jsonSourceDocuments: [{ path: sourcePath, text: artifact.targetText }],
      diagnostics: artifact.diagnostics,
    }
  }
  const parentPath = pathParent(sourcePath)
  const targetPath = normalizeWorkspacePath(await args.fs.createFile({
    parentPath,
    name: artifact.targetName,
    text: artifact.targetText,
  }))
  const metadataPath = normalizeWorkspacePath(await args.fs.createFile({
    parentPath,
    name: artifact.metadataName,
    text: artifact.metadataText,
  }))
  return {
    createdPaths: [targetPath, metadataPath],
    sources: [
      { path: targetPath, source: args.source },
      { path: metadataPath, source: args.source },
    ],
    jsonSourceDocuments: [],
    diagnostics: artifact.diagnostics,
  }
}
