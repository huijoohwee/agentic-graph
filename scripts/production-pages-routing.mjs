import {
  CANONICAL_MIRROR_NAMESPACE,
  LEGACY_PRODUCT_NAMESPACES,
} from './mirror-namespace-contract.mjs'
import {
  XR_V2_CANONICAL_REDIRECT,
  XR_V2_ROOT_REDIRECT,
} from './xr-v2/production-publish-contract.mjs'

const GENERATED_NAMESPACE_START = '# BEGIN agentic-graph generated namespace routes'
const GENERATED_NAMESPACE_END = '# END agentic-graph generated namespace routes'
const GENERATED_REDIRECTS_START = '# BEGIN agentic-graph generated top-level file routes'
const GENERATED_REDIRECTS_END = '# END agentic-graph generated top-level file routes'
const legacyGeneratedRedirectsStart = '# BEGIN agenticgraph generated top-level file routes'
const legacyGeneratedRedirectsEnd = '# END agenticgraph generated top-level file routes'

const obsoleteRedirectLines = new Set([
  '/ /content/agentic-graph/index.html 200',
  '/index.html /content/agentic-graph/index.html 200',
  '/hackamap /hackamap/ 301',
  '/hackamap/ /content/hackamap/index.html 200',
  '/hackamap/* /content/hackamap/:splat 200',
  '/user-secrets*.json /404 404',
  '/content/singabldr/user-secrets*.json /404 404',
])

const legacyRoutePrefixes = [
  '/agenticgraph',
  '/knowgrph',
  '/content/agenticgraph',
  '/content/knowgrph',
  '/image/agenticgraph',
  '/image/knowgrph',
]

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const blockRegex = (start, end) => new RegExp(
  `${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`,
  'g',
)

const isLegacyRoute = line => legacyRoutePrefixes.some(prefix => (
  line === prefix || line.startsWith(`${prefix}/`) || line.startsWith(`${prefix} `)
))

const isManagedCanonicalRoute = line => (
  line === '/agentic-graph'
  || line.startsWith('/agentic-graph/')
  || line.startsWith('/agentic-graph ')
  || line === '/content/agentic-graph'
  || line.startsWith('/content/agentic-graph/')
  || line.startsWith('/content/agentic-graph ')
)

const isLegacyComment = line => /^# Legacy (?:knowgrph|agenticgraph)\b/i.test(line.trim())

const legacyRootFileName = (relativePath, legacyNamespace) => relativePath.replace(
  /^agentic-graph(?=[.-])/, legacyNamespace,
)

const legacyCompatibilityLines = rootFiles => {
  const routeLines = []
  for (const legacyNamespace of LEGACY_PRODUCT_NAMESPACES) {
    const legacyBase = `/${legacyNamespace}`
    const canonicalBase = `/${CANONICAL_MIRROR_NAMESPACE}`
    routeLines.push(
      `${legacyBase} ${canonicalBase} 301`,
      `${legacyBase}/ ${canonicalBase}/ 301`,
      `${legacyBase}/share/* ${canonicalBase}/share/:splat 301`,
      `${legacyBase}/doc/* ${canonicalBase}/doc/:splat 301`,
      `${legacyBase}/doc-default/* ${canonicalBase}/doc-default/:splat 301`,
      `${legacyBase}/mcp ${canonicalBase}/mcp 301`,
      `${legacyBase}/health ${canonicalBase}/health 301`,
      `${legacyBase}/robots.txt ${canonicalBase}/robots.txt 301`,
      `${legacyBase}/sitemap.xml ${canonicalBase}/sitemap.xml 301`,
      `${legacyBase}/.well-known/* ${canonicalBase}/.well-known/:splat 301`,
      `${legacyBase}/imports/hackamap/* ${canonicalBase}/imports/hackamap/:splat 301`,
      ...rootFiles.map(relativePath => (
        `${legacyBase}/${legacyRootFileName(relativePath, legacyNamespace)} ${canonicalBase}/${relativePath} 301`
      )),
    )
  }
  routeLines.push(
    '/content/agenticgraph /agentic-graph 301',
    '/content/agenticgraph/ /agentic-graph/ 301',
    '/content/knowgrph /agentic-graph 301',
    '/content/knowgrph/ /agentic-graph/ 301',
    '/image/agenticgraph/video-frame/* /image/agentic-graph/video-frame/:splat 301',
    '/image/agenticgraph/xr/* /image/agentic-graph/xr/:splat 301',
    '/image/knowgrph/video-frame/* /image/agentic-graph/video-frame/:splat 301',
    '/image/knowgrph/xr/* /image/agentic-graph/xr/:splat 301',
  )
  return routeLines
}

const stripManagedNamespaceRoutes = existing => existing
  .replace(blockRegex(GENERATED_NAMESPACE_START, GENERATED_NAMESPACE_END), '')
  .replace(blockRegex(GENERATED_REDIRECTS_START, GENERATED_REDIRECTS_END), '')
  .replace(blockRegex(legacyGeneratedRedirectsStart, legacyGeneratedRedirectsEnd), '')
  .split('\n')
  .filter(line => !obsoleteRedirectLines.has(line.trim()))
  .filter(line => !isLegacyRoute(line.trim()))
  .filter(line => !isManagedCanonicalRoute(line.trim()))
  .filter(line => !isLegacyComment(line))
  .filter(line => !/^\/agentic-graph\/\*\.(?:js|mjs|css|svg|ico|json|wasm|txt|webmanifest|map)\s/.test(line.trim()))
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trimEnd()

export const buildAgenticGraphRedirects = ({ existing, rootFiles }) => {
  const namespaceLines = [
    GENERATED_NAMESPACE_START,
    ...legacyCompatibilityLines(rootFiles),
    '/agentic-graph /content/agentic-graph/index.html 200',
    '/agentic-graph/assets/* /content/agentic-graph/assets/:splat 200',
    '/agentic-graph/vendor/* /content/agentic-graph/vendor/:splat 200',
    '/agentic-graph/imports/* /content/agentic-graph/imports/:splat 200',
    '/content/agentic-graph /agentic-graph 301',
    '/content/agentic-graph/ /agentic-graph/ 301',
    GENERATED_NAMESPACE_END,
  ]
  const generatedLines = [
    GENERATED_REDIRECTS_START,
    XR_V2_ROOT_REDIRECT,
    XR_V2_CANONICAL_REDIRECT,
    '/agentic-graph/share/* /agentic-graph/share/:splat 200',
    '/agentic-graph/doc/* /agentic-graph/doc/:splat 200',
    '/agentic-graph/doc-default/* /agentic-graph/doc-default/:splat 200',
    '/agentic-graph/mcp /agentic-graph/mcp 200',
    '/agentic-graph/health /agentic-graph/health 200',
    '/agentic-graph/robots.txt /agentic-graph/robots.txt 200',
    '/agentic-graph/sitemap.xml /agentic-graph/sitemap.xml 200',
    '/agentic-graph/.well-known/* /agentic-graph/.well-known/:splat 200',
    ...rootFiles.map(relativePath => `/agentic-graph/${relativePath} /content/agentic-graph/${relativePath} 200`),
    '/agentic-graph/ /content/agentic-graph/index.html 200',
    '/agentic-graph/* /content/agentic-graph/index.html 200',
    GENERATED_REDIRECTS_END,
  ]
  const prefix = stripManagedNamespaceRoutes(existing)
  return `${prefix}${prefix ? '\n\n' : ''}${namespaceLines.join('\n')}\n${generatedLines.join('\n')}\n`
}
