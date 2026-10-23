export type WebpageLayoutSnapshotMeta = {
  kind: 'layout'
  title: string
  href: string
  viewport: { w: number; h: number }
  scroll: { x: number; y: number; height: number }
  ts: number
}

export type WebpageLayoutElement = {
  id: string
  pid: string
  tag: string
  rect: { x: number; y: number; w: number; h: number }
  text: string
  attrs: { id: string; class: string; role: string; ariaLabel: string; placeholder: string; href: string; src: string; alt: string }
  style: null | {
    display: string
    position: string
    zIndex: string
    transform?: string
    filter?: string
    isolation?: string
    willChange?: string
    backgroundColor: string
    color: string
    borderRadius: string
    borderColor: string
    borderWidth: string
    padding: string
    margin: string
    gap: string
    rowGap?: string
    columnGap?: string
    justifyContent: string
    justifyItems?: string
    alignItems: string
    alignContent?: string
    justifySelf?: string
    alignSelf?: string
    flexDirection: string
    flexWrap: string
    flexGrow?: string
    flexShrink?: string
    flexBasis?: string
    order?: string
    gridTemplateColumns?: string
    gridTemplateRows?: string
    gridAutoFlow?: string
    fontSize: string
    fontWeight: string
    fontFamily: string
    lineHeight: string
    letterSpacing: string
    textTransform: string
    textAlign: string
    boxShadow: string
    opacity: string
  }
}

export type WebpageLayoutSnapshot = {
  meta: WebpageLayoutSnapshotMeta
  elements: WebpageLayoutElement[]
}

const clampInt = (n: unknown, fallback: number, min: number, max: number): number => {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

export async function exportWebpageLayoutViaHiddenIframe(args: {
  url: string
  timeoutMs?: number
  maxChars?: number
  maxElements?: number
  scrollCrawl?: boolean
  expandDisclosures?: boolean
  waitForNetworkIdle?: boolean
  networkIdleMs?: number
  minWaitAfterLoadMs?: number
}): Promise<WebpageLayoutSnapshot | null> {
  const url = String(args.url || '').trim()
  if (!url) return null
  const { exportWebpageDomViaHiddenIframe } = await import('./webpageDomExport')
  const res = await exportWebpageDomViaHiddenIframe({
    url,
    mode: 'layout',
    timeoutMs: clampInt(args.timeoutMs, 30_000, 2000, 120_000),
    maxChars: clampInt(args.maxChars, 6_000_000, 64_000, 8_000_000),
    maxElements: clampInt(args.maxElements, 1400, 200, 3500),
    scrollCrawl: !!args.scrollCrawl,
    expandDisclosures: args.expandDisclosures !== false,
    waitForNetworkIdle: args.waitForNetworkIdle !== false,
    networkIdleMs: clampInt(args.networkIdleMs, 600, 150, 2500),
    minWaitAfterLoadMs: clampInt(args.minWaitAfterLoadMs, 350, 0, 5000),
  })
  if (!res?.text) return null
  try {
    const parsed = JSON.parse(res.text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const obj = parsed as Record<string, unknown>
    const meta = obj.meta as Record<string, unknown> | null
    const elements = obj.elements as unknown
    if (!meta || typeof meta !== 'object') return null
    if (!Array.isArray(elements)) return null
    if (meta.kind !== 'layout') return null
    return parsed as WebpageLayoutSnapshot
  } catch {
    return null
  }
}
