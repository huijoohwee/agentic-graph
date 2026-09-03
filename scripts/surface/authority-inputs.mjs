import path from 'node:path'

export function declaredRouteManifest(registry) {
  const include = [...new Set((registry?.entries ?? [])
    .map(entry => entry?.path)
    .filter(candidatePath => (
      typeof candidatePath === 'string'
      && candidatePath.startsWith('/')
    )))].sort()
  return { include }
}

export function declaredPublishedPathEvidence(registry) {
  return [...new Set((registry?.entries ?? [])
    .filter(entry => (
      entry?.surfaceTier === 'public-discoverable'
      && typeof entry.path === 'string'
      && !/[?*]/u.test(entry.path)
    ))
    .map(entry => (
      entry.path.startsWith('/') ? entry.path : `/${entry.path}`
    )))].sort()
}

export function buildCatalogDescriptors(registry, paths) {
  const inlineCatalog = registry?.invocationRegistry
    ? [{
        catalogId: registry.invocationRegistry.catalogId,
        content: registry.invocationRegistry,
      }]
    : []
  const fileCatalogs = (registry?.catalogSources ?? []).map(source => {
    const root = source.repository === 'worker'
      ? paths.agenticCanvasOsRoot
      : paths.repositoryRoot
    const resolvedPath = path.resolve(root, source.path)
    const relativePath = path.relative(root, resolvedPath)
    if (
      !relativePath
      || relativePath === '..'
      || relativePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativePath)
    ) {
      throw new Error(
        `catalog source escapes its repository root: ${source.catalogId}`,
      )
    }
    return {
      catalogId: source.catalogId,
      path: resolvedPath,
    }
  })
  return [...inlineCatalog, ...fileCatalogs]
}

export function publishedPathEvidence(trackedPaths) {
  return [...new Set(trackedPaths.flatMap(candidatePath => {
    const publicPath = `/${candidatePath.replaceAll(path.sep, '/')}`
    if (publicPath === '/index.html') return [publicPath, '/']
    if (publicPath.endsWith('/index.html')) {
      return [publicPath, publicPath.slice(0, -'index.html'.length)]
    }
    return publicPath.endsWith('.html')
      ? [publicPath, publicPath.slice(0, -'.html'.length)]
      : [publicPath]
  }))].sort()
}
