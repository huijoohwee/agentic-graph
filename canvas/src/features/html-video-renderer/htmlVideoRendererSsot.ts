export const AGENTICGRAPH_HTML_VIDEO_ENGINE = 'AGENTICGRAPH_HTML_VIDEO_ENGINE' as const

export const HTML_VIDEO_ENGINE_IDS = Object.freeze({
  headlessBrowser: 'headless-browser',
  canvas2d: 'canvas-2d',
  serverSide: 'server-side',
} as const)

export type HtmlVideoEngineId = typeof HTML_VIDEO_ENGINE_IDS[keyof typeof HTML_VIDEO_ENGINE_IDS]

export type RenderSpec = {
  html: string
  durationMs: number
  fps: number
  width: number
  height: number
  css?: string
  data?: Record<string, unknown>
  engineHint?: string
}

export type RenderResult = {
  blob: Blob
  engineId: string
  durationMs: number
  fps: number
  width: number
  height: number
  renderLog?: string[]
}

export type RenderEngine = {
  readonly engineId: HtmlVideoEngineId | string
  render(spec: Readonly<RenderSpec>): Promise<RenderResult>
}
