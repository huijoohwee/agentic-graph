import type { UiToastInput } from '@/hooks/store/types'
import { getMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { loadLaunchDropdownFallbackModule } from '@/features/toolbar/launchDropdownFallbackModule'
import { runLaunchImportLocalFiles } from './launchImportDispatch'

/** Image selection uses the same workspace importer and fallback as local files. */
export async function importLocalImagesWithWorkspaceBridgeRetry(args: {
  files: readonly File[]
  pushUiToast: (toast: UiToastInput) => void
}): Promise<void> {
  if (args.files.length === 0) return
  const { inferCorpusMediaKind } = await import('@/features/queryable-corpus/corpusGraph')
  const images = args.files.filter(file => inferCorpusMediaKind(file.name, file.type) === 'image')
  if (images.length === 0) {
    args.pushUiToast({ id: 'launch:import:localImages', kind: 'warning', message: 'Choose a supported image.' })
    return
  }
  try {
    await runLaunchImportLocalFiles({
      files: images,
      bridge: getMarkdownWorkspaceActionBridge(),
      fallback: async files => {
        const fallback = await loadLaunchDropdownFallbackModule()
        return fallback.importLocalFilesFallback({ files, pushUiToast: args.pushUiToast })
      },
    })
  } catch (error) {
    args.pushUiToast({
      id: 'launch:import:localImages', kind: 'error',
      message: `Image import failed: ${String((error as Error).message || error)}`, dismissible: true,
    })
  }
}
