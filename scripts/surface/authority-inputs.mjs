import path from 'node:path'

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
