import {
  applyMediaProxySrc as applyGympgrphMediaProxySrc,
  coerceFetchUrl as coerceGympgrphFetchUrl,
  MEDIA_PROXY_ENDPOINT as GYMPGRPH_MEDIA_PROXY_ENDPOINT,
} from 'gympgrph/testkit'

export const testGympgrphApplyMediaProxyNormalizesGithubBlobUrl = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'http://localhost:5173' } }
  try {
    const blobLike = 'https://github.com/owner/repo/blob/main/doc.md'
    const out = applyGympgrphMediaProxySrc(blobLike)
    if (!out.startsWith(`${GYMPGRPH_MEDIA_PROXY_ENDPOINT}?url=`)) throw new Error('expected proxy wrapper')
    const encoded = out.slice(`${GYMPGRPH_MEDIA_PROXY_ENDPOINT}?url=`.length)
    const decoded = decodeURIComponent(encoded)
    if (!decoded.startsWith('https://raw.githubusercontent.com/')) {
      throw new Error('expected github blob url to normalize to raw.githubusercontent.com')
    }
  } finally {
    g.window = prevWindow
  }
}

export const testGympgrphApplyMediaProxySkipsProxyWhenNotLocalhost = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'https://example.invalid' } }
  try {
    const blobLike = 'https://github.com/owner/repo/blob/main/doc.md'
    const out = applyGympgrphMediaProxySrc(blobLike)
    if (out.startsWith(`${GYMPGRPH_MEDIA_PROXY_ENDPOINT}?url=`)) throw new Error('expected direct URL (no proxy wrapper)')
    if (!out.startsWith('https://raw.githubusercontent.com/')) {
      throw new Error('expected github blob url to normalize to raw.githubusercontent.com')
    }
  } finally {
    g.window = prevWindow
  }
}

export const testGympgrphApplyMediaProxyProxiesOpenFreeMapOnLocalhost = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'http://localhost:5173' } }
  try {
    const src = 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'
    const out = applyGympgrphMediaProxySrc(src)
    if (!out.startsWith(`${GYMPGRPH_MEDIA_PROXY_ENDPOINT}?url=`)) throw new Error('expected OpenFreeMap assets to be proxied on localhost')
    const encoded = out.slice(`${GYMPGRPH_MEDIA_PROXY_ENDPOINT}?url=`.length)
    const decoded = decodeURIComponent(encoded)
    if (decoded !== src) throw new Error('expected OpenFreeMap URL to be preserved inside proxy parameter')
  } finally {
    g.window = prevWindow
  }
}

export const testGympgrphCoerceFetchUrlAcceptsAbsolutePath = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'http://localhost:5173' } }
  try {
    const out = coerceGympgrphFetchUrl('/data/demo.geojson')
    if (out !== 'http://localhost:5173/data/demo.geojson') throw new Error('expected path to resolve against origin')
    const kept = applyGympgrphMediaProxySrc('/data/demo.geojson')
    if (kept !== '/data/demo.geojson') throw new Error('expected same-origin paths to remain unproxied')
  } finally {
    g.window = prevWindow
  }
}

export const testGympgrphCoerceFetchUrlTreatsAbsoluteFsPathAsViteFs = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'http://localhost:5173' } }
  try {
    const out = coerceGympgrphFetchUrl('/Users/demo/agentic-graph/docs/trip demo.md')
    if (out !== 'http://localhost:5173/@fs/Users/demo/agentic-graph/docs/trip%20demo.md') {
      throw new Error(`expected vite /@fs rewrite, got ${String(out)}`)
    }
  } finally {
    g.window = prevWindow
  }
}

export const testGympgrphCoerceFetchUrlRejectsFileScheme = () => {
  const g = globalThis as unknown as Record<string, unknown>
  const prevWindow = g.window
  g.window = { location: { origin: 'http://localhost:5173' } }
  try {
    const out = coerceGympgrphFetchUrl('file:///etc/passwd')
    if (out !== null) throw new Error('expected file: URLs to be rejected')
  } finally {
    g.window = prevWindow
  }
}
