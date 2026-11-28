import {
  buildDocDeepLinkIntentKey,
  resolveCanvasSourceAuthorityIntent,
  setLocalDocDeepLinkPath,
} from '@/features/canvas/canvasDocDeepLink'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'

export function testCanvasSourceAuthorityCanonicalizesLocalIntentKeys(): void {
  const relativeKey = buildDocDeepLinkIntentKey('?kgDoc=docs%2Fscene.md&kgPreview=1')
  const absoluteKey = buildDocDeepLinkIntentKey('?kgDoc=%2Fdocs%2Fscene.md&kgPreview=1')
  const collapsedKey = buildDocDeepLinkIntentKey('?kgDoc=%2Fdocs%2F.%2Fscene.md&kgPreview=1')
  if (!relativeKey || relativeKey !== absoluteKey || relativeKey !== collapsedKey) {
    throw new Error('local document intent keys must use the canonical workspace path')
  }

  const { restore } = initJsdomHarness()
  try {
    setLocalDocDeepLinkPath('/docs/scene.md')
    const search = window.location.search
    if (buildDocDeepLinkIntentKey(search) || resolveCanvasSourceAuthorityIntent({ pathname: '/', search }).key) {
      throw new Error('Mirroring the active Explorer selection must leave source readiness with the workspace')
    }
    if (buildDocDeepLinkIntentKey(search + '&kgPreview=1') !== relativeKey) {
      throw new Error('An explicit preview must still acquire its own document intent')
    }
    window.history.replaceState({ ...window.history.state }, '', search)
    if (!buildDocDeepLinkIntentKey(search)) throw new Error('A new history entry must resolve the local link')
  } finally {
    restore()
  }
}

export function testCanvasSourceAuthorityRecognizesSharePathBeforeNormalization(): void {
  const shareToken = encodePublishedDocShareToken({
    workspaceId: 'workspace-xr',
    canonicalPath: 'docs/xr-scene.md',
  })
  const normalized = resolveCanvasSourceAuthorityIntent({
    pathname: '/',
    search: `?kgShare=${encodeURIComponent(shareToken)}&kgPreview=1`,
  })
  const direct = resolveCanvasSourceAuthorityIntent({
    pathname: `/share/${shareToken}`,
    search: '?kgPreview=1',
  })
  const basePrefixed = resolveCanvasSourceAuthorityIntent({
    pathname: `/agentic-graph/share/${shareToken}`,
    search: '?kgPreview=1',
  })
  const runtimeKey = buildDocDeepLinkIntentKey(`?kgShare=${encodeURIComponent(shareToken)}&kgPreview=1`)
  if (!normalized.key || normalized.error || direct.error || basePrefixed.error) {
    throw new Error('valid published source routes must resolve without an authority error')
  }
  if (direct.key !== runtimeKey || basePrefixed.key !== runtimeKey || normalized.key !== runtimeKey) {
    throw new Error('share pathname authority must be stable across root and base-prefixed normalization')
  }
}

export function testCanvasSourceAuthorityRejectsMalformedExplicitSources(): void {
  const malformedLocations = [
    { pathname: '/share/not-a-share-token', search: '' },
    { pathname: '/agentic-graph/doc/workspace-only', search: '' },
    { pathname: '/', search: '?kgShare=not-a-share-token' },
    { pathname: '/', search: '?kgWorkspaceId=workspace-without-path' },
    { pathname: '/', search: '?kgDoc=' },
    { pathname: '/', search: '?kgCanonicalPath=%E0%A4%A' },
  ]
  for (const location of malformedLocations) {
    const intent = resolveCanvasSourceAuthorityIntent(location)
    if (!intent.key || !intent.error) {
      throw new Error(`explicit malformed source must fail closed: ${JSON.stringify(location)}`)
    }
    if (location.search && buildDocDeepLinkIntentKey(location.search)) {
      throw new Error(`malformed source must not create an executable deep-link runtime key: ${location.search}`)
    }
  }

  const ordinaryRoute = resolveCanvasSourceAuthorityIntent({ pathname: '/', search: '?kgPath=%2Fagentic-graph%2F' })
  if (ordinaryRoute.key || ordinaryRoute.error) {
    throw new Error('an ordinary Canvas route must not manufacture a document authority intent')
  }
}
