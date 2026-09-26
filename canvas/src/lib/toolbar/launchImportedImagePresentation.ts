import type { WorkspaceBridgeImportResult } from '@/features/markdown-explorer/workspaceActionBridge'

const rasterImagePath = /\.(?:png|jpe?g|webp|gif|avif)$/i

function importedImageUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return (url.protocol === 'https:' || url.protocol === 'http:') && rasterImagePath.test(url.pathname)
      ? url.href : null
  } catch {
    return null
  }
}

async function offerImportedImage(sourceUnit: import('@/features/queryable-corpus/corpusGraph').CorpusSourceUnit, mediaUrl: string): Promise<void> {
  const [{ useGraphStore }, { selectImportedImageChoice }] = await Promise.all([
    import('@/hooks/useGraphStore'),
    import('@/features/immersive-media/importedImageChoiceRuntime'),
  ])
  selectImportedImageChoice({ sourceUnit, mediaUrl })
  useGraphStore.getState().setFloatingPanelView('media')
  useGraphStore.getState().setFloatingPanelOpen(true)
}

/** One post-import image presentation owner for Launch local files, Image, and URL. */
export async function presentLaunchImportedImage(args: {
  result: void | WorkspaceBridgeImportResult
  files?: readonly File[]
  url?: string
}): Promise<void> {
  const paths = args.result && args.result.createdPaths || []
  if (args.result && args.result.error) return
  if (args.url) {
    if (paths.length === 0) return
    const url = importedImageUrl(args.url)
    if (url) {
      const { buildCorpusSourceUnit } = await import('@/features/queryable-corpus/sourceFilesCorpusManifest')
      await offerImportedImage(buildCorpusSourceUnit({ workspacePath: paths[0]!, relativePath: url,
        originalName: new URL(url).pathname.split('/').pop() || 'image', text: '', mimeHint: 'image/*',
        byteSize: 0, mediaKind: 'image', status: 'parsed', importMode: 'url' }), url)
    }
    return
  }
  const files = args.files || []
  if (files.length !== 1) return
  const file = files[0]!
  const [{ inferCorpusMediaKind }, { buildCorpusSourceUnit }, registry] = await Promise.all([
    import('@/features/queryable-corpus/corpusGraph'),
    import('@/features/queryable-corpus/sourceFilesCorpusManifest'),
    import('@/features/strybldr/strybldrImageFileRegistry'),
  ])
  if (inferCorpusMediaKind(file.name, file.type) !== 'image') return
  const retained = registry.listStrybldrImageFiles().find(item => item.file === file && !!item.objectUrl)
  if (retained && (paths.length === 0 || paths.some(path => path.replace(/^\/+/, '') === retained.workspacePath.replace(/^\/+/, '')))) {
    await offerImportedImage(buildCorpusSourceUnit({ workspacePath: retained.workspacePath,
      relativePath: file.name, originalName: file.name, text: '', mimeHint: file.type,
      byteSize: file.size, status: 'parsed', importMode: 'file' }), retained.objectUrl)
    return
  }
  if (paths.length === 0) return
  const name = file.name.toLowerCase()
  const stem = name.replace(/\.[^.]+$/, '')
  const exact = paths.find(path => path.toLowerCase().endsWith(`/${name}.source.md`))
  const stemMatches = paths.filter(path => path.toLowerCase().endsWith(`/${stem}.source.md`))
  const path = exact || (stemMatches.length === 1 ? stemMatches[0] : null)
  if (!path) return
  const unit = buildCorpusSourceUnit({ workspacePath: path, relativePath: file.name,
    originalName: file.name, text: '', mimeHint: file.type, byteSize: file.size,
    status: 'parsed', importMode: 'file' })
  const matching = registry.getStrybldrImageFile(unit.id)
  const imageUrl = matching?.file === file && matching.objectUrl
    ? matching.objectUrl
    : registry.registerStrybldrImageFiles({ sourceUnits: [unit], files: [file] })[unit.id]
  if (imageUrl) await offerImportedImage(unit, imageUrl)
}
