import {
  createPublishedDocIdentityResolver,
  encodePublishedDocShareToken,
  PUBLISHED_DOC_IDENTITY_RESOLVER_BROWSER_SOURCE,
  resolvePublishedDocIdentity,
} from '@/features/canvas/canvasDocShareToken.mjs'
import { buildDocDeepLinkIntentKey, parseDocDeepLink } from '@/features/canvas/canvasDocDeepLink'

type PublishedIdentity = { workspaceId: string | null; canonicalPath: string } | null
type PublishedIdentityResolver = (args: {
  shareUrl: string
  baseUrl?: string
  appBasePath?: string
}) => PublishedIdentity

const assertIdentity = (
  identity: PublishedIdentity,
  expected: { workspaceId: string | null; canonicalPath: string },
  label: string,
) => {
  if (
    identity?.workspaceId !== expected.workspaceId
    || identity?.canonicalPath !== expected.canonicalPath
  ) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(identity)}`)
  }
}

export const testPublishedDocIdentityResolverScopesKgPathOnce = () => {
  const expected = { workspaceId: 'workspace-route', canonicalPath: 'docs/xr-scene.md' }
  const shareToken = encodePublishedDocShareToken(expected)
  const baseRelativeUrl = `/?kgPath=${encodeURIComponent(`/share/${shareToken}`)}`
  const basePrefixedUrl = `/?kgPath=${encodeURIComponent(`/agentic-graph/share/${shareToken}`)}`
  const resolvers: Array<[string, PublishedIdentityResolver]> = [
    ['module resolver', resolvePublishedDocIdentity],
    ['created resolver', createPublishedDocIdentityResolver({ defaultAppBasePath: '/agentic-graph' })],
  ]
  const browserResolverFactory = new Function(`return (${PUBLISHED_DOC_IDENTITY_RESOLVER_BROWSER_SOURCE})`)() as (
    args: { defaultAppBasePath: string },
  ) => PublishedIdentityResolver
  resolvers.push(['browser-source resolver', browserResolverFactory({ defaultAppBasePath: '/agentic-graph' })])

  for (const [label, resolver] of resolvers) {
    for (const shareUrl of [baseRelativeUrl, basePrefixedUrl]) {
      assertIdentity(
        resolver({ shareUrl, baseUrl: 'https://airvio.co', appBasePath: '/agentic-graph' }),
        expected,
        `${label} ${shareUrl}`,
      )
    }
    for (const shareUrl of [baseRelativeUrl, `/share/${shareToken}`]) {
      assertIdentity(
        resolver({ shareUrl, baseUrl: 'https://airvio.co', appBasePath: '/' }),
        expected,
        `${label} root app base ${shareUrl}`,
      )
    }
  }
}

export const testCanvasDocDeepLinkReusesPublishedIdentityAndPreservesLegacyRoutes = () => {
  const expected = { workspaceId: 'workspace-route', canonicalPath: 'docs/xr-scene.md' }
  const shareToken = encodePublishedDocShareToken(expected)
  const sharePaths = [
    `/share/${shareToken}`,
    `/agentic-graph/share/${shareToken}`,
  ]
  for (const sharePath of sharePaths) {
    const parsed = parseDocDeepLink(`?kgPath=${encodeURIComponent(sharePath)}`)
    if (
      parsed?.kind !== 'remote'
      || parsed.workspaceId !== expected.workspaceId
      || parsed.canonicalPath !== expected.canonicalPath
    ) {
      throw new Error(`expected ${sharePath} to resolve through the shared remote identity, got ${JSON.stringify(parsed)}`)
    }
  }

  const local = parseDocDeepLink(`?kgDoc=docs%2Flocal.md&kgShare=${shareToken}`)
  if (local?.kind !== 'local' || local.relativePath !== 'docs/local.md') {
    throw new Error(`expected local document intent to retain priority, got ${JSON.stringify(local)}`)
  }

  const legacyWorkspace = parseDocDeepLink('?kgPath=%2Fdoc%2Flegacy-workspace%2Fdocs%252Flegacy.md')
  if (
    legacyWorkspace?.kind !== 'remote'
    || legacyWorkspace.workspaceId !== 'legacy-workspace'
    || legacyWorkspace.canonicalPath !== 'docs/legacy.md'
  ) {
    throw new Error(`expected legacy workspace route parity, got ${JSON.stringify(legacyWorkspace)}`)
  }

  const legacyDefault = parseDocDeepLink('?kgPath=%2Fdoc-default%2Fdocs%252Flegacy-default.md')
  if (legacyDefault?.kind !== 'default-remote' || legacyDefault.canonicalPath !== 'docs/legacy-default.md') {
    throw new Error(`expected legacy default route parity, got ${JSON.stringify(legacyDefault)}`)
  }

  const intentWithCommand = buildDocDeepLinkIntentKey(`?kgPath=${encodeURIComponent(sharePaths[0])}&kgPreview=1&kgWorkspaceCommand=first`)
  const intentAfterCommandConsumption = buildDocDeepLinkIntentKey(`?kgPath=${encodeURIComponent(sharePaths[0])}&kgPreview=1`)
  const nonPreviewIntent = buildDocDeepLinkIntentKey(`?kgPath=${encodeURIComponent(sharePaths[0])}`)
  if (!intentWithCommand || intentWithCommand !== intentAfterCommandConsumption || intentWithCommand === nonPreviewIntent) {
    throw new Error('expected document intent identity to ignore unrelated query consumption and retain preview semantics')
  }
}
