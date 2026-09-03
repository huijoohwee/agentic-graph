import { exportPngSnapshot } from '@/lib/graph/file'
import { captureVisibleCanvasPngBlobFromDom } from '@/lib/graph/svgSnapshot'
import type { UiToastInput } from '@/hooks/store/types'
import { writeAgenticOsCompanionOutputBlob } from '@/features/chat/chatHistoryWorkspace.output'

export async function exportCanvasPng(args: {
  exportBaseName: string
  activeDocumentPath?: string | null
  pushUiToast: (toast: UiToastInput) => void
  getStore: () => {
    captureCanvasPngSnapshot: () => Promise<Blob | null>
    renderMediaAsNodes?: unknown
  }
}): Promise<void> {
  try {
    const suggested = `${args.exportBaseName}.png`
    const store = args.getStore()
    const preferDomCapture = store.renderMediaAsNodes !== true
    const rawPng =
      (preferDomCapture ? await captureVisibleCanvasPngBlobFromDom() : null)
      || (await store.captureCanvasPngSnapshot())
      || (await captureVisibleCanvasPngBlobFromDom())
    if (!rawPng) {
      args.pushUiToast({ id: 'export-png-missing-canvas', kind: 'warning', message: 'No canvas PNG snapshot available.' })
      return
    }
    const pngBlob = String(rawPng.type || '').trim() === 'image/png'
      ? rawPng
      : new Blob([await rawPng.arrayBuffer()], { type: 'image/png' })
    await exportPngSnapshot(pngBlob, suggested)
    await writeAgenticOsCompanionOutputBlob({
      workspacePath: args.activeDocumentPath,
      extension: 'png',
      blob: pngBlob,
    })
  } catch {
    void 0
  }
}
