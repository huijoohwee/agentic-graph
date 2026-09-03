import type { RenderEngine } from './htmlVideoRendererSsot'
import { AGENTIC_OS_HTML_VIDEO_ENGINE } from './htmlVideoRendererSsot'

export type HtmlVideoEngineRegistry = ReadonlyMap<string, RenderEngine>

export type EngineResolveOk = { ok: true; engine: RenderEngine }
export type EngineResolveError = {
  ok: false
  errorCode: 'engine_not_configured'
  engineId: string
}
export type EngineResolveResult = EngineResolveOk | EngineResolveError

const cleanString = (value: unknown): string => String(value || '').trim()

const readRuntimeEnv = (name: string): string => {
  const processEnv = typeof process !== 'undefined' ? process.env : undefined
  return cleanString(processEnv?.[name])
}

export function createHtmlVideoEngineRegistry(
  adapters: ReadonlyArray<RenderEngine>,
): HtmlVideoEngineRegistry {
  const registry = new Map<string, RenderEngine>()
  for (let i = 0; i < adapters.length; i += 1) {
    const adapter = adapters[i]
    const engineId = cleanString(adapter?.engineId)
    if (!engineId || typeof adapter?.render !== 'function') continue
    registry.set(engineId, adapter)
  }
  return registry
}

export function createHtmlVideoEngineRegistryFromRuntimeConfig(config?: {
  adapters?: ReadonlyArray<RenderEngine> | null
} | null): HtmlVideoEngineRegistry {
  const globalConfig = globalThis as typeof globalThis & {
    agenticGraphHtmlVideoEngines?: ReadonlyArray<RenderEngine> | null
  }
  const adapters = Array.isArray(config?.adapters)
    ? config.adapters
    : Array.isArray(globalConfig.agenticGraphHtmlVideoEngines)
      ? globalConfig.agenticGraphHtmlVideoEngines
      : []
  return createHtmlVideoEngineRegistry(adapters)
}

export function resolveHtmlVideoEngine(
  registry: HtmlVideoEngineRegistry,
  engineHint?: string,
): EngineResolveResult {
  const engineId = cleanString(engineHint) || readRuntimeEnv(AGENTIC_OS_HTML_VIDEO_ENGINE)
  const engine = engineId ? registry.get(engineId) : null
  if (!engine) return { ok: false, errorCode: 'engine_not_configured', engineId }
  return { ok: true, engine }
}
