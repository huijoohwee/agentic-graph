import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { serializeMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { API_REFERENCE_CODEBASE_INDEX_DIRECTORY } from './apiReferenceOutputPaths'

const REPO_ROOT = process.cwd()
const INDEX_DIR = path.join(
  REPO_ROOT,
  API_REFERENCE_CODEBASE_INDEX_DIRECTORY,
)

type SsotRow = {
  key: string
  typeLabel: string
  value: string
  responsibility: string
  valueKey?: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
  tooltipMin?: string | number
  tooltipMax?: string | number
  tooltipInterval?: string | number
  tooltipExpansionNote?: string
  tooltipContractionNote?: string
  tooltipImpact?: string
  modules?: string[]
  classes?: string[]
  functions?: string[]
  ssot?: string
}

type IndexSpec = {
  sourceFile: string
  outputFilename: string
  endpointPrefix: string
  provider: string
  apiFamily: string
  baseUrl?: string
  auth?: string
  asyncPattern?: string
}

const INDEX_SPECS: ReadonlyArray<IndexSpec> = [
  {
    sourceFile: 'canvas/src/features/integrations/openaiResponsesSsot.ts',
    outputFilename: 'agentic-graph-openai-responses-api-reference-codebase-index.md',
    endpointPrefix: 'POST /responses',
    provider: 'OpenAI',
    apiFamily: 'Responses API',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'Bearer <OPENAI_API_KEY>',
    asyncPattern: 'stream',
  },
  {
    sourceFile: 'canvas/src/features/integrations/openaiImagesSsot.ts',
    outputFilename: 'agentic-graph-openai-images-api-reference-codebase-index.md',
    endpointPrefix: 'POST /images/generations',
    provider: 'OpenAI',
    apiFamily: 'Images API',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'Bearer <OPENAI_API_KEY>',
    asyncPattern: 'poll',
  },
  {
    sourceFile: 'canvas/src/features/integrations/byteplusChatApiSsot.rows.ts',
    outputFilename: 'agentic-graph-byteplus-modelark-chat-api-reference-codebase-index.md',
    endpointPrefix: 'POST /api/v3/chat/completions',
    provider: 'BytePlus ModelArk',
    apiFamily: 'Shared + Text API',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com',
    auth: 'Bearer <BYTEPLUS_API_KEY>',
    asyncPattern: 'poll | webhook',
  },
  {
    sourceFile: 'canvas/src/features/integrations/byteplusImageGenerationSsot.ts',
    outputFilename: 'agentic-graph-byteplus-modelark-image-generation-api-reference-codebase-index.md',
    endpointPrefix: 'POST /api/v3/image/generation',
    provider: 'BytePlus ModelArk',
    apiFamily: 'Image Generation API',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com',
    auth: 'Bearer <BYTEPLUS_API_KEY>',
    asyncPattern: 'poll | webhook',
  },
  {
    sourceFile: 'canvas/src/features/integrations/byteplusVideoGenerationSsot.ts',
    outputFilename: 'agentic-graph-byteplus-modelark-video-generation-api-reference-codebase-index.md',
    endpointPrefix: 'POST /api/v3/contents/generations/tasks',
    provider: 'BytePlus ModelArk',
    apiFamily: 'Video Generation API',
    baseUrl: 'https://ark.ap-southeast.bytepluses.com',
    auth: 'Bearer <BYTEPLUS_API_KEY>',
    asyncPattern: 'poll | webhook',
  },
  {
    sourceFile: 'canvas/src/features/integrations/grabMapsSsot.rows.ts',
    outputFilename: 'agentic-graph-grabmaps-api-reference-codebase-index.md',
    endpointPrefix: 'ALL',
    provider: 'GrabMaps',
    apiFamily: 'Maps API',
  },
  {
    sourceFile: 'canvas/src/features/panels/views/deerflowApiDocs.ts',
    outputFilename: 'agentic-graph-deerflow-gateway-api-reference-codebase-index.md',
    endpointPrefix: 'POST /api/llm/chat/completions',
    provider: 'DeerFlow Gateway',
    apiFamily: 'Gateway API (OpenAI-compatible)',
    baseUrl: 'http://localhost:8001',
    auth: 'None (local gateway handles own auth)',
    asyncPattern: 'stream',
  },
  {
    sourceFile: 'canvas/src/features/integrations/geminiVideoGenerationSsot.ts',
    outputFilename: 'agentic-graph-gemini-veo-video-generation-api-reference-codebase-index.md',
    endpointPrefix: 'POST /v1beta/models/{model}:predictLongRunning',
    provider: 'Google Gemini',
    apiFamily: 'Veo Video Generation API',
    baseUrl: 'https://generativelanguage.googleapis.com',
    auth: 'x-goog-api-key: <GEMINI_API_KEY>',
    asyncPattern: 'poll',
  },
]

const EXPORT_NAME_MAP: Record<string, string> = {
  'canvas/src/features/integrations/openaiResponsesSsot.ts': 'OPENAI_RESPONSES_API_DOC_ROWS',
  'canvas/src/features/integrations/openaiImagesSsot.ts': 'OPENAI_IMAGES_API_DOC_ROWS',
  'canvas/src/features/integrations/byteplusChatApiSsot.rows.ts': 'BYTEPLUS_SHARED_TEXT_API_DOC_ROWS',
  'canvas/src/features/integrations/byteplusImageGenerationSsot.ts': 'BYTEPLUS_IMAGE_GENERATION_DOC_ROWS',
  'canvas/src/features/integrations/byteplusVideoGenerationSsot.ts': 'BYTEPLUS_VIDEO_GENERATION_DOC_ROWS',
  'canvas/src/features/integrations/grabMapsSsot.rows.ts': 'GRABMAPS_DOC_ROWS',
  'canvas/src/features/panels/views/deerflowApiDocs.ts': 'DEERFLOW_API_REQUEST_DOC_ENTRIES',
  'canvas/src/features/integrations/geminiVideoGenerationSsot.ts': 'GEMINI_VIDEO_GENERATION_DOC_ROWS',
}

function normalizeRow(raw: Record<string, unknown>): SsotRow {
  const meta = raw.meta as Record<string, unknown> | undefined
  const details = raw.details as Record<string, unknown> | undefined
  return {
    key: String((meta?.key ?? raw.key) || ''),
    typeLabel: String(raw.typeLabel ?? meta?.type ?? ''),
    value: String(raw.value ?? ''),
    responsibility: String(details?.responsibility ?? raw.responsibility ?? ''),
    valueKey: raw.valueKey as string | undefined,
    notes: raw.notes as string | undefined,
    searchHints: raw.searchHints as string[] | undefined,
    tooltipDefaultValue: raw.tooltipDefaultValue as string | number | boolean | null | undefined,
    tooltipMin: raw.tooltipMin as string | number | undefined,
    tooltipMax: raw.tooltipMax as string | number | undefined,
    tooltipInterval: raw.tooltipInterval as string | number | undefined,
    tooltipExpansionNote: raw.tooltipExpansionNote as string | undefined,
    tooltipContractionNote: raw.tooltipContractionNote as string | undefined,
    tooltipImpact: raw.tooltipImpact as string | undefined,
    modules: (details?.modules ?? raw.modules) as string[] | undefined,
    classes: (details?.classes ?? raw.classes) as string[] | undefined,
    functions: (details?.functions ?? raw.functions) as string[] | undefined,
  }
}

function inferEndpointKind(key: string, endpointPrefix: string): string {
  const lower = key.toLowerCase()
  if (lower === 'provider' || lower === 'auth_mode' || lower === 'api_key' || lower === 'endpoint' || lower === 'endpoint_url') return 'ALL'
  if (lower === 'model' || lower === 'prompt' || lower === 'input' || lower === 'text' || lower === 'messages') return endpointPrefix
  return endpointPrefix
}

function inferActor(key: string): string {
  const lower = key.toLowerCase()
  if (lower === 'provider' || lower === 'auth_mode' || lower === 'api_key' || lower === 'endpoint' || lower === 'endpoint_url') return 'Operator'
  return 'Caller'
}

function inferRequired(value: string, typeLabel: string): string {
  const lower = value.toLowerCase()
  if (lower.startsWith('required')) return 'yes'
  if (lower.startsWith('optional')) return 'no'
  if (typeLabel === 'boolean') return 'no'
  return 'yes'
}

function inferPattern(typeLabel: string): string {
  const lower = typeLabel.toLowerCase()
  if (lower.includes('boolean')) return 'scalar'
  if (lower.includes('integer') || lower.includes('float') || lower.includes('number')) return 'scalar'
  if (lower.includes('object') || lower.includes('[]')) return 'array<union>'
  if (lower.includes('enum')) return 'scalar'
  return 'scalar'
}

function inferType(typeLabel: string): string {
  const lower = typeLabel.toLowerCase()
  if (lower.includes('boolean')) return 'boolean'
  if (lower.includes('integer') || lower.includes('float') || lower.includes('number')) return 'number'
  if (lower.includes('object') || lower.includes('[]')) return 'json'
  return 'string'
}

function buildRow(row: SsotRow, spec: IndexSpec): string[] {
  const endpoint = inferEndpointKind(row.key, spec.endpointPrefix)
  const actor = inferActor(row.key)
  const required = inferRequired(row.value, row.typeLabel)
  const pattern = inferPattern(row.typeLabel)
  const type = inferType(row.typeLabel)

  const modules = row.modules?.length
    ? row.modules.join('; ')
    : spec.sourceFile

  const classes = row.classes?.length
    ? row.classes.join('; ')
    : ''

  const functions = row.functions?.length
    ? row.functions.join('; ')
    : ''

  return [
    endpoint,
    'param',
    row.key,
    type,
    row.value,
    required,
    'in',
    actor,
    '—',
    endpoint === 'ALL' ? '—' : 'body',
    '—',
    pattern,
    row.responsibility,
    row.value,
    modules,
    classes,
    functions,
  ]
}

function generateIndex(spec: IndexSpec, rows: ReadonlyArray<SsotRow>): string {
  const sectionHeader = '## Table'

  const dataRows = rows
    .map(raw => normalizeRow(raw as unknown as Record<string, unknown>))
    .filter(row => row.key)
    .map(row => buildRow(row, spec))

  const table = serializeMarkdownPipeTable({
    columns: ['endpoint', 'kind', 'key', 'type', 'value', 'required', 'direction', 'actor', 'seq-note', 'location', 'scope', 'pattern', 'key-description', 'value-description', 'module', 'class', 'function'],
    rows: dataRows,
  })

  return [sectionHeader, '', ...table].join('\n')
}

async function main() {
  const checkMode = process.argv.includes('--check')
  const verbose = process.argv.includes('--verbose')
  const targetFilter = process.argv.find(arg => !arg.startsWith('-') && !arg.includes('node') && !arg.includes('tsx') && !arg.includes('generateApiCodebaseIndex'))

  const specsToRun = targetFilter
    ? INDEX_SPECS.filter(s => s.outputFilename === targetFilter || s.provider.toLowerCase().includes(targetFilter.toLowerCase()))
    : INDEX_SPECS

  if (specsToRun.length === 0) {
    console.error(`No matching spec found for filter: ${targetFilter}`)
    console.error(`Available: ${INDEX_SPECS.map(s => s.outputFilename).join(', ')}`)
    process.exit(1)
  }

  let driftCount = 0

  for (const spec of specsToRun) {
    const sourcePath = path.join(REPO_ROOT, spec.sourceFile)
    if (!existsSync(sourcePath)) {
      console.error(`SKIP: source not found: ${spec.sourceFile}`)
      continue
    }

    const outputPath = path.join(INDEX_DIR, spec.outputFilename)
    if (!existsSync(INDEX_DIR)) {
      mkdirSync(INDEX_DIR, { recursive: true })
    }

    const exportName = EXPORT_NAME_MAP[spec.sourceFile]
    if (!exportName) {
      console.error(`SKIP: no export name mapping for ${spec.sourceFile}`)
      continue
    }

    let rows: ReadonlyArray<SsotRow>
    try {
      const fileUrl = pathToFileURL(sourcePath).href
      const mod = await import(fileUrl)
      rows = mod[exportName]
      if (!Array.isArray(rows)) {
        console.error(`SKIP: export ${exportName} is not an array in ${spec.sourceFile}`)
        continue
      }
    } catch (err) {
      console.error(`SKIP: failed to import ${spec.sourceFile}: ${err}`)
      continue
    }

    const generated = generateIndex(spec, rows)

    if (checkMode) {
      if (!existsSync(outputPath)) {
        console.error(`DRIFT: ${spec.outputFilename} does not exist (needs generation)`)
        driftCount++
        continue
      }
      const existing = readFileSync(outputPath, 'utf-8')
      if (existing.trim() !== generated.trim()) {
        console.error(`DRIFT: ${spec.outputFilename} differs from generated output`)
        driftCount++
      } else {
        if (verbose) console.log(`OK: ${spec.outputFilename} is up to date`)
      }
    } else {
      writeFileSync(outputPath, generated + '\n', 'utf-8')
      console.log(`GENERATED: ${spec.outputFilename} (${rows.length} rows)`)
    }
  }

  if (checkMode) {
    if (driftCount === 0) {
      console.log('OK: all index files are up to date')
      process.exit(0)
    } else {
      console.error(`DRIFT: ${driftCount} file(s) differ. Run without --check to regenerate.`)
      process.exit(1)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
