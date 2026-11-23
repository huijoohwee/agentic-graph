import type { RenderEngine } from './htmlVideoRendererSsot'
import { HTML_VIDEO_ENGINE_IDS } from './htmlVideoRendererSsot'

const localBrowserEngine: RenderEngine = {
  engineId: HTML_VIDEO_ENGINE_IDS.canvas2d,
  async render(spec) {
    const { canvas2dAdapter } = await import('./engines/canvas2dAdapter')
    return canvas2dAdapter.render(spec)
  },
}

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
  adapters: ReadonlyArray<RenderEngine> = [localBrowserEngine],
): void {
  const globalConfig = globalThis as HtmlVideoRuntimeGlobal
  const existing = Array.isArray(globalConfig.agenticGraphHtmlVideoEngines)
    ? globalConfig.agenticGraphHtmlVideoEngines
    : []
  globalConfig.agenticGraphHtmlVideoEngines = dedupeEngines([...existing, ...adapters])
}
