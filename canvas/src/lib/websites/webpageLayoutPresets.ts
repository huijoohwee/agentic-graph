export type WebpageLayoutProbePreset = {
  cacheScope: string
  cacheVersion: string
  maxElements: number
  viewportW: number
  viewportH: number
  timeoutMs: number
  networkIdleMs: number
  domQuietMs: number
  minWaitAfterLoadMs: number
  scrollCrawl: boolean
  expandDisclosures: boolean
  waitForNetworkIdle: boolean
}

export function buildWebpageLayoutCacheKey(
  preset: WebpageLayoutProbePreset,
  extras?: { epoch?: number | null },
): string {
  const epoch = Number.isFinite(extras?.epoch) ? Math.max(0, Math.floor(Number(extras?.epoch))) : null
  const epochPart = epoch != null ? `:e=${epoch}` : ''
  return [
    `${preset.cacheScope}:${preset.cacheVersion}${epochPart}`,
    `maxEl=${preset.maxElements}`,
    `vp=${preset.viewportW}x${preset.viewportH}`,
    `scroll=${preset.scrollCrawl ? 1 : 0}`,
    `disclosures=${preset.expandDisclosures ? 1 : 0}`,
    `netIdle=${preset.waitForNetworkIdle ? 1 : 0}`,
    `netIdleMs=${preset.networkIdleMs}`,
    `domQuietMs=${preset.domQuietMs}`,
    `minAfter=${preset.minWaitAfterLoadMs}`,
  ].join(':')
}

export function getUiWebpageSnapshotPreset(): WebpageLayoutProbePreset {
  return {
    cacheScope: 'ui-webpage-layout',
    cacheVersion: 'v1',
    maxElements: 1100,
    viewportW: 1100,
    viewportH: 720,
    timeoutMs: 22_000,
    networkIdleMs: 700,
    domQuietMs: 550,
    minWaitAfterLoadMs: 750,
    scrollCrawl: true,
    expandDisclosures: true,
    waitForNetworkIdle: true,
  }
}

export function getMarkdownWebpageSnapshotPreset(): WebpageLayoutProbePreset {
  return {
    cacheScope: 'md-webpage-layout',
    cacheVersion: 'v1',
    maxElements: 1200,
    viewportW: 1200,
    viewportH: 800,
    timeoutMs: 22_000,
    networkIdleMs: 700,
    domQuietMs: 550,
    minWaitAfterLoadMs: 750,
    scrollCrawl: true,
    expandDisclosures: true,
    waitForNetworkIdle: true,
  }
}

export function getDesignWebpageWireframePreset(args: {
  fidelityLevel: 1 | 2 | 3 | 4
  viewportWidth?: number
  viewportHeight?: number
}): WebpageLayoutProbePreset {
  const fidelity = args.fidelityLevel
  const fallbackWidth = 1200
  const fallbackHeight = 800
  const width = Number.isFinite(args.viewportWidth)
    ? Math.max(900, Math.min(1400, Math.floor(Number(args.viewportWidth) * 0.9)))
    : fallbackWidth
  const height = Number.isFinite(args.viewportHeight)
    ? Math.max(650, Math.min(1000, Math.floor(Number(args.viewportHeight) * 0.84)))
    : fallbackHeight

  return {
    cacheScope: 'layout',
    cacheVersion: 'v2',
    maxElements: fidelity === 4 ? 3200 : fidelity === 3 ? 2400 : fidelity === 2 ? 1800 : 1400,
    viewportW: width,
    viewportH: height,
    timeoutMs: 45_000,
    networkIdleMs: fidelity >= 3 ? 1100 : 900,
    domQuietMs: fidelity >= 3 ? 900 : 650,
    minWaitAfterLoadMs: fidelity >= 3 ? 1600 : 1200,
    scrollCrawl: true,
    expandDisclosures: true,
    waitForNetworkIdle: true,
  }
}
