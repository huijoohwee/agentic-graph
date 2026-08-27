const GENERATED_REDIRECTS_START = '# BEGIN agenticgraph generated top-level file routes'
const GENERATED_REDIRECTS_END = '# END agenticgraph generated top-level file routes'

const obsoleteRedirectLines = new Set([
  '/ /content/agenticgraph/index.html 200',
  '/index.html /content/agenticgraph/index.html 200',
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
    '/agenticgraph /agenticgraph 200',
    '/agenticgraph/ /agenticgraph/ 200',
    '/agenticgraph/share/* /agenticgraph/share/:splat 200',
    '/agenticgraph/doc/* /agenticgraph/doc/:splat 200',
    '/agenticgraph/doc-default/* /agenticgraph/doc-default/:splat 200',
    '/agenticgraph/mcp /agenticgraph/mcp 200',
    '/agenticgraph/robots.txt /agenticgraph/robots.txt 200',
    '/agenticgraph/sitemap.xml /agenticgraph/sitemap.xml 200',
    '/agenticgraph/.well-known/* /agenticgraph/.well-known/:splat 200',
    ...rootFiles.map(rel => `/agenticgraph/${rel} /content/agenticgraph/${rel} 200`),
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
      /^\/agenticgraph\/\*\.js .*?\n^\/agenticgraph\/\*\.mjs .*?\n^\/agenticgraph\/\*\.css .*?\n^\/agenticgraph\/\*\.svg .*?\n^\/agenticgraph\/\*\.ico .*?\n^\/agenticgraph\/\*\.json .*?\n^\/agenticgraph\/\*\.wasm .*?\n^\/agenticgraph\/\*\.txt .*?\n^\/agenticgraph\/\*\.webmanifest .*?\n^\/agenticgraph\/\*\.map .*?\n/gm,
      '',
    )
  if (managedBlockRegex.test(next)) return next.replace(managedBlockRegex, nextBlock)

  const anchor = '/agenticgraph/imports/* /content/agenticgraph/imports/:splat 200'
  if (!next.includes(anchor)) {
    throw new Error(`Missing expected agenticgraph redirects anchor in ${redirectsPath}`)
  }
  return next.replace(anchor, `${anchor}\n${nextBlock}`)
}
