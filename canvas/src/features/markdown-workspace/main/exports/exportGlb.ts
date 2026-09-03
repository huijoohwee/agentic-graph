import type { UiToastInput } from '@/hooks/store/types'
import { downloadBlob, saveBlobWithPicker } from '@/lib/graph/save'
import { writeAgenticOsCompanionOutputBlob } from '@/features/chat/chatHistoryWorkspace.output'
import { GLB_ASSET_MIME_TYPE, GLTF_ASSET_MIME_TYPE } from '@/lib/assets/glbAssetDocument'
import { normalizeCapturedModelAssetBlob, resolveModelAssetExportBlob } from '@/lib/assets/modelAssetExport'

export async function exportCanvasGltf(args: {
  exportBaseName: string
  activeDocumentPath?: string | null
  activeText?: string
  pushUiToast: (toast: UiToastInput) => void
  getStore: () => {
    captureThreeGltfSnapshot: () => Promise<Blob | null>
  }
}): Promise<void> {
  try {
    const baseName = String(args.exportBaseName || '').trim() || 'document'
    const activeAsset = await resolveModelAssetExportBlob({
      text: args.activeText,
      requestedFormat: 'gltf',
      fallbackBaseName: baseName,
    }).catch(() => null)
    const rawGltf = activeAsset?.blob || await args.getStore().captureThreeGltfSnapshot()
    if (!rawGltf) {
      args.pushUiToast({
        id: 'export-gltf-missing-canvas',
        kind: 'warning',
        message: 'No 3D GLTF snapshot available. Switch Canvas to a 3D surface and retry.',
      })
      return
    }

    const gltfBlob = activeAsset?.blob || await normalizeCapturedModelAssetBlob({ blob: rawGltf, format: 'gltf' })
    if (!gltfBlob) {
      args.pushUiToast({
        id: 'export-gltf-invalid',
        kind: 'error',
        message: 'GLTF export failed: invalid glTF JSON asset.',
      })
      return
    }
    const suggested = activeAsset?.name || `${baseName}.gltf`
    const saved = await saveBlobWithPicker(gltfBlob, suggested, {
      description: 'GLTF Files',
      accept: {
        [GLTF_ASSET_MIME_TYPE]: ['.gltf'],
        'application/json': ['.gltf'],
      },
    })
    if (saved === '') return
    if (!saved) downloadBlob(gltfBlob, suggested)
    await writeAgenticOsCompanionOutputBlob({
      workspacePath: args.activeDocumentPath,
      extension: 'gltf',
      blob: gltfBlob,
    })
    args.pushUiToast({
      id: 'export-gltf-ok',
      kind: 'success',
      message: 'Exported GLTF',
      ttlMs: 1800,
      dismissible: false,
    })
  } catch (e) {
    args.pushUiToast({
      id: 'export-gltf-failed',
      kind: 'error',
      message: `GLTF export failed: ${String((e as { message?: unknown })?.message ?? e)}`,
    })
  }
}

export async function exportCanvasGlb(args: {
  exportBaseName: string
  activeDocumentPath?: string | null
  activeText?: string
  pushUiToast: (toast: UiToastInput) => void
  getStore: () => {
    captureThreeGlbSnapshot: () => Promise<Blob | null>
  }
}): Promise<void> {
  try {
    const baseName = String(args.exportBaseName || '').trim() || 'document'
    const activeAsset = await resolveModelAssetExportBlob({
      text: args.activeText,
      requestedFormat: 'glb',
      fallbackBaseName: baseName,
    }).catch(() => null)
    const rawGlb = activeAsset?.blob || await args.getStore().captureThreeGlbSnapshot()
    if (!rawGlb) {
      args.pushUiToast({
        id: 'export-glb-missing-canvas',
        kind: 'warning',
        message: 'No 3D GLB snapshot available. Switch Canvas to a 3D surface and retry.',
      })
      return
    }

    const glbBlob = activeAsset?.blob || await normalizeCapturedModelAssetBlob({ blob: rawGlb, format: 'glb' })
    if (!glbBlob) {
      args.pushUiToast({
        id: 'export-glb-invalid',
        kind: 'error',
        message: 'GLB export failed: invalid binary glTF container.',
      })
      return
    }
    const suggested = activeAsset?.name || `${baseName}.glb`
    const saved = await saveBlobWithPicker(glbBlob, suggested, {
      description: 'GLB Files',
      accept: {
        [GLB_ASSET_MIME_TYPE]: ['.glb'],
        'application/octet-stream': ['.glb'],
      },
    })
    if (saved === '') return
    if (!saved) downloadBlob(glbBlob, suggested)
    await writeAgenticOsCompanionOutputBlob({
      workspacePath: args.activeDocumentPath,
      extension: 'glb',
      blob: glbBlob,
    })
    args.pushUiToast({
      id: 'export-glb-ok',
      kind: 'success',
      message: 'Exported GLB',
      ttlMs: 1800,
      dismissible: false,
    })
  } catch (e) {
    args.pushUiToast({
      id: 'export-glb-failed',
      kind: 'error',
      message: `GLB export failed: ${String((e as { message?: unknown })?.message ?? e)}`,
    })
  }
}
