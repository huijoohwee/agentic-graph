import { CANONICAL_MIRROR_NAMESPACE } from './mirror-namespace-contract.mjs'
import { XR_V2_CANONICAL_REDIRECT, XR_V2_ROOT_REDIRECT } from './xr-v2/production-publish-contract.mjs'

const GENERATED_NAMESPACE_START = '# BEGIN agentic-graph generated namespace routes'
const GENERATED_NAMESPACE_END = '# END agentic-graph generated namespace routes'
const GENERATED_REDIRECTS_START = '# BEGIN agentic-graph generated top-level file routes'
const GENERATED_REDIRECTS_END = '# END agentic-graph generated top-level file routes'
const obsoleteRedirectLines = new Set([
  '/ /content/agentic-graph/index.html 200', '/index.html /content/agentic-graph/index.html 200',
  '/hackamap /hackamap/ 301', '/hackamap/ /content/hackamap/index.html 200',
  '/hackamap/* /content/hackamap/:splat 200', '/user-secrets*.json /404 404',
  '/content/singabldr/user-secrets*.json /404 404',
])
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const blockRegex = (start, end) => new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, 'g')
const isManagedRoute = line => line.startsWith('/agentic-graph') || line.startsWith('/content/agentic-graph')

const stripManagedNamespaceRoutes = existing => existing
  .replace(blockRegex(GENERATED_NAMESPACE_START, GENERATED_NAMESPACE_END), '')
  .replace(blockRegex(GENERATED_REDIRECTS_START, GENERATED_REDIRECTS_END), '')
  .split('\n')
  .filter(line => !obsoleteRedirectLines.has(line.trim()))
  .filter(line => !isManagedRoute(line.trim()))
  .filter(line => !/^\/agentic-graph\/\*\.(?:js|mjs|css|svg|ico|json|wasm|txt|webmanifest|map)\s/.test(line.trim()))
  .join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()

export const buildAgenticGraphRedirects = ({ existing, rootFiles }) => {
  const canonicalBase = `/${CANONICAL_MIRROR_NAMESPACE}`
  const namespaceLines = [
    GENERATED_NAMESPACE_START,
    `${canonicalBase} /content/agentic-graph/index.html 200`,
    `${canonicalBase}/assets/* /content/agentic-graph/assets/:splat 200`,
    `${canonicalBase}/vendor/* /content/agentic-graph/vendor/:splat 200`,
    `${canonicalBase}/imports/* /content/agentic-graph/imports/:splat 200`,
    '/content/agentic-graph /agentic-graph 301', '/content/agentic-graph/ /agentic-graph/ 301',
    GENERATED_NAMESPACE_END,
  ]
  const generatedLines = [
    GENERATED_REDIRECTS_START, XR_V2_ROOT_REDIRECT, XR_V2_CANONICAL_REDIRECT,
    `${canonicalBase}/share/* ${canonicalBase}/share/:splat 200`,
    `${canonicalBase}/doc/* ${canonicalBase}/doc/:splat 200`,
    `${canonicalBase}/doc-default/* ${canonicalBase}/doc-default/:splat 200`,
    `${canonicalBase}/mcp ${canonicalBase}/mcp 200`, `${canonicalBase}/health ${canonicalBase}/health 200`,
    `${canonicalBase}/robots.txt ${canonicalBase}/robots.txt 200`, `${canonicalBase}/sitemap.xml ${canonicalBase}/sitemap.xml 200`,
    `${canonicalBase}/.well-known/* ${canonicalBase}/.well-known/:splat 200`,
    ...rootFiles.map(relativePath => `${canonicalBase}/${relativePath} /content/agentic-graph/${relativePath} 200`),
    `${canonicalBase}/ /content/agentic-graph/index.html 200`, `${canonicalBase}/* /content/agentic-graph/index.html 200`,
    GENERATED_REDIRECTS_END,
  ]
  const prefix = stripManagedNamespaceRoutes(existing)
  return `${prefix}${prefix ? '\n\n' : ''}${namespaceLines.join('\n')}\n${generatedLines.join('\n')}\n`
}
