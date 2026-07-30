const GENERATED_REDIRECTS_START = '# BEGIN knowgrph generated top-level file routes'
const GENERATED_REDIRECTS_END = '# END knowgrph generated top-level file routes'

const obsoleteRedirectLines = new Set([
  '/ /content/knowgrph/index.html 200',
  '/index.html /content/knowgrph/index.html 200',
  '/hackamap /hackamap/ 301',
  '/hackamap/ /content/hackamap/index.html 200',
  '/hackamap/* /content/hackamap/:splat 200',
  '/user-secrets*.json /404 404',
  '/content/singabldr/user-secrets*.json /404 404',
])

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const buildKnowgrphRedirects = ({ existing, rootFiles, redirectsPath }) => {
  const generatedLines = [
    GENERATED_REDIRECTS_START,
    '/knowgrph /knowgrph 200',
    '/knowgrph/ /knowgrph/ 200',
    '/knowgrph/share/* /knowgrph/share/:splat 200',
    '/knowgrph/doc/* /knowgrph/doc/:splat 200',
    '/knowgrph/doc-default/* /knowgrph/doc-default/:splat 200',
    '/knowgrph/mcp /knowgrph/mcp 200',
    '/knowgrph/robots.txt /knowgrph/robots.txt 200',
    '/knowgrph/sitemap.xml /knowgrph/sitemap.xml 200',
    '/knowgrph/.well-known/* /knowgrph/.well-known/:splat 200',
    ...rootFiles.map(rel => `/knowgrph/${rel} /content/knowgrph/${rel} 200`),
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
      /^\/knowgrph\/\*\.js .*?\n^\/knowgrph\/\*\.mjs .*?\n^\/knowgrph\/\*\.css .*?\n^\/knowgrph\/\*\.svg .*?\n^\/knowgrph\/\*\.ico .*?\n^\/knowgrph\/\*\.json .*?\n^\/knowgrph\/\*\.wasm .*?\n^\/knowgrph\/\*\.txt .*?\n^\/knowgrph\/\*\.webmanifest .*?\n^\/knowgrph\/\*\.map .*?\n/gm,
      '',
    )
  if (managedBlockRegex.test(next)) return next.replace(managedBlockRegex, nextBlock)

  const anchor = '/knowgrph/imports/* /content/knowgrph/imports/:splat 200'
  if (!next.includes(anchor)) {
    throw new Error(`Missing expected knowgrph redirects anchor in ${redirectsPath}`)
  }
  return next.replace(anchor, `${anchor}\n${nextBlock}`)
}
