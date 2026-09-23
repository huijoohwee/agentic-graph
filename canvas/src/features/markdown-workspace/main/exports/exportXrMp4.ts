import type { CanvasSnapshotFns, CanvasVideoCaptureResult } from '@/hooks/store/store-types/core'
import type { UiToastInput } from '@/hooks/store/types'
import { downloadBlob, openSaveFilePickerHandle, writeBlobToFileHandle } from '@/lib/graph/save'
import { writeAgenticOsCompanionOutputBlob } from '@/features/chat/chatHistoryWorkspace.output'

const unsupportedMessage = (reason: string) => ({
  'media-recorder-unavailable': 'This browser cannot record video.',
  'canvas-capture-unavailable': 'This browser cannot record the XR canvas.',
  'container-unavailable': 'This browser cannot encode MP4. GLB export remains available.',
}[reason] || reason)

export async function publishXrMp4Export(args: {
  result: Extract<CanvasVideoCaptureResult, { status: 'captured' }>
  filename: string
  current: () => boolean
  save: (blob: Blob, filename: string) => Promise<string | null | undefined>
  download: (blob: Blob, filename: string) => void
  companion: (blob: Blob) => Promise<unknown>
}): Promise<'saved' | 'cancelled'> {
  const assertCurrent = () => { if (!args.current()) throw new DOMException('MP4 export cancelled or its source changed.', 'AbortError') }
  assertCurrent()
  const saved = await args.save(args.result.blob, args.filename)
  if (saved === '') return 'cancelled'
  assertCurrent()
  if (!saved) args.download(args.result.blob, args.filename)
  assertCurrent()
  await args.companion(args.result.blob)
  assertCurrent()
  return 'saved'
}

export async function exportCanvasXrMp4(args: {
  exportBaseName: string
  activeDocumentPath: string
  signal: AbortSignal
  isCurrent: () => boolean
  pushUiToast: (toast: UiToastInput) => void
  getStore: () => { canvasSnapshotFns: { '3d'?: CanvasSnapshotFns } }
}): Promise<void> {
  const toastId = 'export-xr-mp4'
  const current = () => !args.signal.aborted && args.isCurrent()
  try {
    if (!current()) return
    const capture = args.getStore().canvasSnapshotFns['3d']?.captureVideo
    if (!capture) throw new Error('Open the authored scene in the XR surface before recording.')
    const result = await capture({ signal: args.signal, onProgress: fraction => {
      if (current()) args.pushUiToast({ id: toastId, kind: 'neutral', message: `Recording XR MP4 · ${Math.round(fraction * 100)}%`, busy: true, ttlMs: null })
    } })
    if (!current()) throw new DOMException('MP4 export cancelled.', 'AbortError')
    if (result.status === 'unsupported') {
      args.pushUiToast({ id: toastId, kind: 'warning', message: unsupportedMessage(result.reason), busy: false })
      return
    }
    const filename = `${args.exportBaseName || 'scene'}.mp4`
    const published = await publishXrMp4Export({ result, filename, current,
      save: async (blob, name) => {
        const handle = await openSaveFilePickerHandle(name, { description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } })
        if (!current()) throw new DOMException('MP4 source changed.', 'AbortError')
        if (handle === '') return ''
        if (!handle) return null
        if (!await writeBlobToFileHandle(handle, blob)) throw new Error('Could not save MP4 to the chosen file.')
        return handle.name || name
      },
      download: downloadBlob,
      companion: blob => writeAgenticOsCompanionOutputBlob({ workspacePath: args.activeDocumentPath, extension: 'mp4', blob }),
    })
    args.pushUiToast({ id: toastId, kind: published === 'saved' ? 'success' : 'neutral', busy: false,
      message: published === 'saved' ? `Exported MP4 · ${result.evidence.durationSeconds.toFixed(1)}s` : 'MP4 save cancelled.' })
  } catch (error) {
    const cancelled = args.signal.aborted || (error as Error)?.name === 'AbortError'
    args.pushUiToast({ id: toastId, kind: cancelled ? 'neutral' : 'error', busy: false,
      message: cancelled ? 'MP4 export cancelled.' : `MP4 export failed: ${(error as Error)?.message || String(error)}` })
  }
}
