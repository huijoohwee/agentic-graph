import {
  XR_V2_CANONICAL_REDIRECT,
  XR_V2_ROOT_REDIRECT,
} from './xr-v2/production-publish-contract.mjs'

const GENERATED_REDIRECTS_START = '# BEGIN agentic-graph generated top-level file routes'
const GENERATED_REDIRECTS_END = '# END agentic-graph generated top-level file routes'

const obsoleteRedirectLines = new Set([
  '/ /content/agentic-graph/index.html 200',
  '/index.html /content/agentic-graph/index.html 200',
  '/hackamap /hackamap/ 301',
  '/hackamap/ /content/hackamap/index.html 200',
  '/hackamap/* /content/hackamap/:splat 200',
  '/user-secrets*.json /404 404',
  '/content/singabldr/user-secrets*.json /404 404',
])

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildAgenticGraphRedirects = ({ existing, rootFiles, redirectsPath }) => {
  const generatedLines = [
    GENERATED_REDIRECTS_START,
    XR_V2_ROOT_REDIRECT,
    XR_V2_CANONICAL_REDIRECT,
    '/agentic-graph /agentic-graph 200',
    '/agentic-graph/ /agentic-graph/ 200',
    '/agentic-graph/share/* /agentic-graph/share/:splat 200',
    '/agentic-graph/doc/* /agentic-graph/doc/:splat 200',
    '/agentic-graph/doc-default/* /agentic-graph/doc-default/:splat 200',
    '/agentic-graph/mcp /agentic-graph/mcp 200',
    '/agentic-graph/robots.txt /agentic-graph/robots.txt 200',
    '/agentic-graph/sitemap.xml /agentic-graph/sitemap.xml 200',
    '/agentic-graph/.well-known/* /agentic-graph/.well-known/:splat 200',
    ...rootFiles.map(rel => `/agentic-graph/${rel} /content/agentic-graph/${rel} 200`),
    GENERATED_REDIRECTS_END,
  ]
  const nextBlock = generatedLines.join('\n')
  const managedBlockRegex = new RegExp(
    `${escapeRegExp(GENERATED_REDIRECTS_START)}[\\s\\S]*?${escapeRegExp(GENERATED_REDIRECTS_END)}`,
  )
  let next = existing
    .split('\n')
    .filter(line => !obsoleteRedirectLines.has(line.trim()))
    .join('\n')
    .replace(
      /^\/agentic-graph\/\*\.js .*?\n^\/agentic-graph\/\*\.mjs .*?\n^\/agentic-graph\/\*\.css .*?\n^\/agentic-graph\/\*\.svg .*?\n^\/agentic-graph\/\*\.ico .*?\n^\/agentic-graph\/\*\.json .*?\n^\/agentic-graph\/\*\.wasm .*?\n^\/agentic-graph\/\*\.txt .*?\n^\/agentic-graph\/\*\.webmanifest .*?\n^\/agentic-graph\/\*\.map .*?\n/gm,
      '',
    )
  if (managedBlockRegex.test(next)) return next.replace(managedBlockRegex, nextBlock)

  const anchor = '/agentic-graph/imports/* /content/agentic-graph/imports/:splat 200'
  if (!next.includes(anchor)) {
    throw new Error(`Missing expected agentic-graph redirects anchor in ${redirectsPath}`)
  }
  return next.replace(anchor, `${anchor}\n${nextBlock}`)
}
