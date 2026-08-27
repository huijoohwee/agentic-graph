import { readEnvString } from '@/lib/config.env'
import type { WorkspaceImportUrlOpts } from '@/features/markdown-explorer/workspaceActionBridge'

export const VIDEO_AGENT_VALIDATION_CONFIG_STORAGE_KEY = 'agenticgraph:video-agent:validation-config:v1'
export const VIDEO_AGENT_VALIDATION_DOC_PATH_ENV_KEY = 'VITE_AGENTICGRAPH_VIDEO_AGENT_VALIDATION_DOC_PATH'
export const VIDEO_AGENT_VALIDATION_URLS_ENV_KEY = 'VITE_AGENTICGRAPH_VIDEO_AGENT_VALIDATION_URLS'
export const STORYBOARD_VIDEO_AGENT_VALIDATION_IMPORT_OPTIONS = Object.freeze({
  canvas2dRenderer: 'storyboard',
  documentSemanticMode: 'document',
} satisfies WorkspaceImportUrlOpts)

export type VideoAgentValidationConfig = {
  validationDocPath: string
  importUrls: string[]
}

export type VideoAgentValidationUrlOption = {
  index: number
  label: string
  url: string
}

export const splitVideoAgentValidationUrls = (value: string): string[] =>
  Array.from(new Set(
    String(value || '')
      .split(/[,\n]+/)
      .map(part => part.trim())
      .filter(Boolean),
  ))

export const serializeVideoAgentValidationUrls = (urls: readonly string[]): string =>
  splitVideoAgentValidationUrls(urls.join('\n')).join('\n')

export function normalizeVideoAgentValidationConfig(value: Partial<VideoAgentValidationConfig> | null | undefined): VideoAgentValidationConfig {
  return {
    validationDocPath: String(value?.validationDocPath || '').trim(),
    importUrls: splitVideoAgentValidationUrls(Array.isArray(value?.importUrls) ? value.importUrls.join('\n') : ''),
  }
}

export function mergeVideoAgentValidationConfigs(
  primary: Partial<VideoAgentValidationConfig> | null | undefined,
  fallback: Partial<VideoAgentValidationConfig> | null | undefined,
): VideoAgentValidationConfig {
  const primaryConfig = normalizeVideoAgentValidationConfig(primary)
  const fallbackConfig = normalizeVideoAgentValidationConfig(fallback)
  return {
    validationDocPath: primaryConfig.validationDocPath || fallbackConfig.validationDocPath,
    importUrls: primaryConfig.importUrls.length > 0 ? primaryConfig.importUrls : fallbackConfig.importUrls,
  }
}

export function buildVideoAgentValidationUrlOptions(urls: readonly string[]): VideoAgentValidationUrlOption[] {
  return splitVideoAgentValidationUrls(urls.join('\n')).map((url, index) => ({
    index,
    label: `URL ${index + 1}`,
    url,
  }))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const unwrapValidationValue = (value: unknown): unknown => {
  if (!isRecord(value)) return value
  return 'value' in value ? value.value : value
}

const readRecord = (value: unknown): Record<string, unknown> | null => {
  const unwrapped = unwrapValidationValue(value)
  return isRecord(unwrapped) ? unwrapped : null
}

const readJsonRecord = (value: unknown): Record<string, unknown> | null => {
  const unwrapped = unwrapValidationValue(value)
  if (isRecord(unwrapped)) return unwrapped
  if (typeof unwrapped !== 'string') return null
  const text = unwrapped.trim()
  if (!text.startsWith('{')) return null
  try {
    const parsed = JSON.parse(text) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

const appendValidationUrls = (out: string[], value: unknown): void => {
  const unwrapped = unwrapValidationValue(value)
  const raw = Array.isArray(unwrapped)
    ? unwrapped.map(item => String(unwrapValidationValue(item) || '')).join('\n')
    : String(unwrapped || '')
  for (const url of splitVideoAgentValidationUrls(raw)) {
    if (!out.includes(url)) out.push(url)
  }
}

const collectValidationUrlsFromRecord = (out: string[], record: Record<string, unknown>): void => {
  appendValidationUrls(out, record.testUrls)
  appendValidationUrls(out, record.testUrl)
  appendValidationUrls(out, record.importUrls)
  appendValidationUrls(out, record.validationUrls)
  appendValidationUrls(out, record.validationImportUrls)
  const sourceVideo = readRecord(record.sourceVideo)
  if (!sourceVideo) return
  appendValidationUrls(out, sourceVideo.testUrls)
  appendValidationUrls(out, sourceVideo.urls)
  appendValidationUrls(out, sourceVideo.url)
}

const collectValidationUrlsFromRuntimeInput = (out: string[], input: unknown): void => {
  const record = readRecord(input)
  if (!record) return
  collectValidationUrlsFromRecord(out, record)

  const contract = readRecord(record.videoAgentRuntimeContract)
  if (contract) collectValidationUrlsFromRecord(out, contract)

  const metadata = readRecord(record.metadata)
  if (metadata) {
    collectValidationUrlsFromRecord(out, metadata)
    const metadataContract = readRecord(metadata.videoAgentRuntimeContract)
    if (metadataContract) collectValidationUrlsFromRecord(out, metadataContract)
    const frontmatterMeta = readRecord(metadata.frontmatterMeta)
    if (frontmatterMeta) {
      collectValidationUrlsFromRecord(out, frontmatterMeta)
      const frontmatterContract = readRecord(frontmatterMeta.videoAgentRuntimeContract)
      if (frontmatterContract) collectValidationUrlsFromRecord(out, frontmatterContract)
    }
  }

  const properties = readRecord(record.properties)
  const dataJson = readJsonRecord(record.data_json) || readJsonRecord(record.dataJson) || readJsonRecord(properties?.data_json)
  if (dataJson) collectValidationUrlsFromRecord(out, dataJson)
}

export function readVideoAgentValidationConfigFromRuntimeInput(input: unknown): VideoAgentValidationConfig {
  const importUrls: string[] = []
  collectValidationUrlsFromRuntimeInput(importUrls, input)
  const graphRecord = readRecord(input)
  const nodes = Array.isArray(graphRecord?.nodes) ? graphRecord.nodes : []
  for (const node of nodes) collectValidationUrlsFromRuntimeInput(importUrls, node)
  return normalizeVideoAgentValidationConfig({ importUrls })
}

export function readVideoAgentValidationConfigFromEnv(): VideoAgentValidationConfig {
  return normalizeVideoAgentValidationConfig({
    validationDocPath: readEnvString(VIDEO_AGENT_VALIDATION_DOC_PATH_ENV_KEY, ''),
    importUrls: splitVideoAgentValidationUrls(readEnvString(VIDEO_AGENT_VALIDATION_URLS_ENV_KEY, '')),
  })
}

export function readVideoAgentValidationConfigFromStorage(storage?: Storage | null): VideoAgentValidationConfig | null {
  if (!storage) return null
  try {
    const raw = String(storage.getItem(VIDEO_AGENT_VALIDATION_CONFIG_STORAGE_KEY) || '').trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VideoAgentValidationConfig>
    return normalizeVideoAgentValidationConfig(parsed)
  } catch {
    return null
  }
}

export function writeVideoAgentValidationConfigToStorage(
  config: Partial<VideoAgentValidationConfig>,
  storage?: Storage | null,
): VideoAgentValidationConfig {
  const normalized = normalizeVideoAgentValidationConfig(config)
  if (storage) {
    try {
      storage.setItem(VIDEO_AGENT_VALIDATION_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
    } catch {
      void 0
    }
  }
  return normalized
}

const getBrowserStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readVideoAgentValidationConfig(storage: Storage | null = getBrowserStorage()): VideoAgentValidationConfig {
  const envConfig = readVideoAgentValidationConfigFromEnv()
  const storedConfig = readVideoAgentValidationConfigFromStorage(storage)
  if (!storedConfig) return envConfig
  return {
    validationDocPath: storedConfig.validationDocPath || envConfig.validationDocPath,
    importUrls: storedConfig.importUrls.length > 0 ? storedConfig.importUrls : envConfig.importUrls,
  }
}

export function writeVideoAgentValidationConfig(config: Partial<VideoAgentValidationConfig>): VideoAgentValidationConfig {
  return writeVideoAgentValidationConfigToStorage(config, getBrowserStorage())
}
