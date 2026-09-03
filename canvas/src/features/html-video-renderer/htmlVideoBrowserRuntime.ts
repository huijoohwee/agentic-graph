import type { RenderEngine } from './htmlVideoRendererSsot'
import { canvas2dAdapter } from './engines/canvas2dAdapter'

type HtmlVideoRuntimeGlobal = typeof globalThis & {
  agenticGraphHtmlVideoEngines?: ReadonlyArray<RenderEngine> | null
}

const dedupeEngines = (adapters: ReadonlyArray<RenderEngine>): RenderEngine[] => {
  const seen = new Set<string>()
  const out: RenderEngine[] = []
  for (const adapter of adapters) {
    const engineId = String(adapter?.engineId || '').trim()
    if (!engineId || typeof adapter?.render !== 'function' || seen.has(engineId)) continue
    seen.add(engineId)
    out.push(adapter)
  }
  return out
}

export function installHtmlVideoBrowserRuntimeAdapters(
  adapters: ReadonlyArray<RenderEngine> = [canvas2dAdapter],
): void {
  const globalConfig = globalThis as HtmlVideoRuntimeGlobal
  const existing = Array.isArray(globalConfig.agenticGraphHtmlVideoEngines)
    ? globalConfig.agenticGraphHtmlVideoEngines
    : []
  globalConfig.agenticGraphHtmlVideoEngines = dedupeEngines([...existing, ...adapters])
}
