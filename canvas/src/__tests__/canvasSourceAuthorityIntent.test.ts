import {
  buildDocDeepLinkIntentKey,
  resolveCanvasSourceAuthorityIntent,
} from '@/features/canvas/canvasDocDeepLink'
import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'

export function testCanvasSourceAuthorityCanonicalizesLocalIntentKeys(): void {
  const relativeKey = buildDocDeepLinkIntentKey('?kgDoc=docs%2Fscene.md&kgPreview=1')
  const absoluteKey = buildDocDeepLinkIntentKey('?kgDoc=%2Fdocs%2Fscene.md&kgPreview=1')
  const collapsedKey = buildDocDeepLinkIntentKey('?kgDoc=%2Fdocs%2F.%2Fscene.md&kgPreview=1')
  if (!relativeKey || relativeKey !== absoluteKey || relativeKey !== collapsedKey) {
    throw new Error('local document intent keys must use the canonical workspace path')
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
    pathname: `/agenticgraph/share/${shareToken}`,
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
    { pathname: '/agenticgraph/doc/workspace-only', search: '' },
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

  const ordinaryRoute = resolveCanvasSourceAuthorityIntent({ pathname: '/', search: '?kgPath=%2Fagenticgraph%2F' })
  if (ordinaryRoute.key || ordinaryRoute.error) {
    throw new Error('an ordinary Canvas route must not manufacture a document authority intent')
  }
}
