
import type { StoreApi } from 'zustand'
import type { GraphState } from '@/hooks/store/types'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage, lsSetBool, lsSetFloat, lsSetInt, lsSetJson } from '@/lib/persistence'
import { persistLaunchSpotlightEnabled } from '@/features/spotlight/storage'
import { writeGrabMapsByokApiKeyToBrowser } from 'grph-shared/geospatial/grabMapsAuth'

type SetGraph = StoreApi<GraphState>['setState']

export const createUiIntegrationActions = (set: SetGraph)=> ({
    setGrabMapsAuthMode: (mode: 'serverManaged' | 'byok') =>
      set(state => {
        const next = mode === 'serverManaged' ? 'serverManaged' : 'byok'
        const patch: Partial<GraphState> = {}
        let changed = false
        if (state.grabMapsAuthMode !== next) {
          patch.grabMapsAuthMode = lsSetJson(LS_KEYS.grabMapsAuthMode, next)
          changed = true
        }
        if (next === 'serverManaged' && state.grabMapsApiKey) {
          writeGrabMapsByokApiKeyToBrowser('')
          patch.grabMapsApiKey = ''
          changed = true
        }
        return changed ? patch : {}
      }),
    setGrabMapsApiKey: (v: string | null) =>
      set(state => {
        const sanitized = String(v || '')
          .replace(/[\r\n]/g, '')
          .trim()
          .slice(0, 512)
        if (state.grabMapsAuthMode === 'serverManaged' && sanitized) {
          writeGrabMapsByokApiKeyToBrowser(sanitized)
          return {
            grabMapsAuthMode: lsSetJson(LS_KEYS.grabMapsAuthMode, 'byok'),
            grabMapsApiKey: sanitized,
          }
        }
        if (state.grabMapsApiKey === sanitized) return {}
        writeGrabMapsByokApiKeyToBrowser(sanitized)
        return { grabMapsApiKey: sanitized }
      }),
    setGrabMapsDirectionsEndpointUrl: (v: string) =>
      set({ grabMapsDirectionsEndpointUrl: lsSetJson(LS_KEYS.grabMapsDirectionsEndpointUrl, String(v || '').trim()) }),
    setGrabMapsDirectionsOverview: (v: string) =>
      set({ grabMapsDirectionsOverview: lsSetJson(LS_KEYS.grabMapsDirectionsOverview, String(v || '').trim()) }),
    setGrabMapsDirectionsLatFirst: (v: boolean) =>
      set({ grabMapsDirectionsLatFirst: lsSetBool(LS_KEYS.grabMapsDirectionsLatFirst, v === true) }),
    setGrabMapsDirectionsAlternatives: (v: boolean) =>
      set({ grabMapsDirectionsAlternatives: lsSetBool(LS_KEYS.grabMapsDirectionsAlternatives, v === true) }),
    setGrabMapsDirectionsSteps: (v: boolean) =>
      set({ grabMapsDirectionsSteps: lsSetBool(LS_KEYS.grabMapsDirectionsSteps, v === true) }),
    setGrabMapsDirectionsLanguage: (v: string) =>
      set({ grabMapsDirectionsLanguage: lsSetJson(LS_KEYS.grabMapsDirectionsLanguage, String(v || '').trim()) }),
    setGrabMapsDirectionsUnits: (v: string) => {
      const raw = String(v || '').trim().toLowerCase()
      const next = raw === 'imperial' ? 'imperial' : 'metric'
      set({ grabMapsDirectionsUnits: lsSetJson(LS_KEYS.grabMapsDirectionsUnits, next) })
    },
    setGrabMapsDirectionsOriginLng: (v: number) =>
      set({ grabMapsDirectionsOriginLng: lsSetFloat(LS_KEYS.grabMapsDirectionsOriginLng, Number(v), { min: -180, max: 180 }) }),
    setGrabMapsDirectionsOriginLat: (v: number) =>
      set({ grabMapsDirectionsOriginLat: lsSetFloat(LS_KEYS.grabMapsDirectionsOriginLat, Number(v), { min: -90, max: 90 }) }),
    setGrabMapsDirectionsDestinationLng: (v: number) =>
      set({ grabMapsDirectionsDestinationLng: lsSetFloat(LS_KEYS.grabMapsDirectionsDestinationLng, Number(v), { min: -180, max: 180 }) }),
    setGrabMapsDirectionsDestinationLat: (v: number) =>
      set({ grabMapsDirectionsDestinationLat: lsSetFloat(LS_KEYS.grabMapsDirectionsDestinationLat, Number(v), { min: -90, max: 90 }) }),
    setGrabMapsDirectionsWaypointsJson: (v: string) =>
      set({ grabMapsDirectionsWaypointsJson: lsSetJson(LS_KEYS.grabMapsDirectionsWaypointsJson, String(v ?? '')) }),
    setGrabMapsDirectionsAnnotationsJson: (v: string) =>
      set({ grabMapsDirectionsAnnotationsJson: lsSetJson(LS_KEYS.grabMapsDirectionsAnnotationsJson, String(v ?? '')) }),
    setGrabMapsDirectionsExtraParamsJson: (v: string) =>
      set({ grabMapsDirectionsExtraParamsJson: lsSetJson(LS_KEYS.grabMapsDirectionsExtraParamsJson, String(v ?? '')) }),
    setGrabMapsBasemapStyleUrl: (v: string) =>
      set({ grabMapsBasemapStyleUrl: lsSetJson(LS_KEYS.grabMapsBasemapStyleUrl, String(v || '').trim()) }),

    setAutoEnableGeospatialOnGeoImport: (v: boolean) =>
      set({ autoEnableGeospatialOnGeoImport: lsSetBool(LS_KEYS.geospatialAutoEnableOnGeoImport, v === true) }),

    setPdfImportIncludeImages: (v: boolean) => set({ pdfImportIncludeImages: lsSetBool(LS_KEYS.pdfImportIncludeImages, !!v) }),
    setPdfImportMaxPages: (v: number) =>
      set({ pdfImportMaxPages: lsSetInt(LS_KEYS.pdfImportMaxPages, v, { min: 0, max: 10_000 }) }),
    setPdfImportMaxPdfBytes: (v: number) =>
      set({ pdfImportMaxPdfBytes: lsSetInt(LS_KEYS.pdfImportMaxPdfBytes, v, { min: 1_000_000, max: 2_000_000_000 }) }),
    setPdfImportFetchTimeoutMs: (v: number) =>
      set({ pdfImportFetchTimeoutMs: lsSetInt(LS_KEYS.pdfImportFetchTimeoutMs, v, { min: 1_000, max: 10 * 60_000 }) }),
    setPdfImportUploadTimeoutMs: (v: number) =>
      set({ pdfImportUploadTimeoutMs: lsSetInt(LS_KEYS.pdfImportUploadTimeoutMs, v, { min: 1_000, max: 10 * 60_000 }) }),
    setPdfImportConvertTimeoutMs: (v: number) =>
      set({ pdfImportConvertTimeoutMs: lsSetInt(LS_KEYS.pdfImportConvertTimeoutMs, v, { min: 1_000, max: 30 * 60_000 }) }),
    setPdfImportStreamDecodeCacheMaxBytes: (v: number) =>
      set({ pdfImportStreamDecodeCacheMaxBytes: lsSetInt(LS_KEYS.pdfImportStreamDecodeCacheMaxBytes, v, { min: 1_000_000, max: 2_000_000_000 }) }),
    setPdfImportContentStreamMaxDecodeBytes: (v: number) =>
      set({ pdfImportContentStreamMaxDecodeBytes: lsSetInt(LS_KEYS.pdfImportContentStreamMaxDecodeBytes, v, { min: 64 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportPageContentMaxBytes: (v: number) =>
      set({ pdfImportPageContentMaxBytes: lsSetInt(LS_KEYS.pdfImportPageContentMaxBytes, v, { min: 64 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportCmapMaxBytes: (v: number) =>
      set({ pdfImportCmapMaxBytes: lsSetInt(LS_KEYS.pdfImportCmapMaxBytes, v, { min: 8 * 1024, max: 32 * 1024 * 1024 }) }),
    setPdfImportMaxToUnicodeStreamBytes: (v: number) =>
      set({ pdfImportMaxToUnicodeStreamBytes: lsSetInt(LS_KEYS.pdfImportMaxToUnicodeStreamBytes, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportToUnicodeMaxDecodeBytes: (v: number) =>
      set({ pdfImportToUnicodeMaxDecodeBytes: lsSetInt(LS_KEYS.pdfImportToUnicodeMaxDecodeBytes, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportImageStreamMaxDecodeBytes: (v: number) =>
      set({ pdfImportImageStreamMaxDecodeBytes: lsSetInt(LS_KEYS.pdfImportImageStreamMaxDecodeBytes, v, { min: 64 * 1024, max: 2_000_000_000 }) }),
    setPdfImportMaxTextContentBytesPerPage: (v: number) =>
      set({ pdfImportMaxTextContentBytesPerPage: lsSetInt(LS_KEYS.pdfImportMaxTextContentBytesPerPage, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportMaxTextStreamBytes: (v: number) =>
      set({ pdfImportMaxTextStreamBytes: lsSetInt(LS_KEYS.pdfImportMaxTextStreamBytes, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportMaxFormXObjectBytes: (v: number) =>
      set({ pdfImportMaxFormXObjectBytes: lsSetInt(LS_KEYS.pdfImportMaxFormXObjectBytes, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportMaxFormXObjectStreamBytes: (v: number) =>
      set({ pdfImportMaxFormXObjectStreamBytes: lsSetInt(LS_KEYS.pdfImportMaxFormXObjectStreamBytes, v, { min: 8 * 1024, max: 256 * 1024 * 1024 }) }),
    setPdfImportMaxFormXObjectCount: (v: number) =>
      set({ pdfImportMaxFormXObjectCount: lsSetInt(LS_KEYS.pdfImportMaxFormXObjectCount, v, { min: 0, max: 10_000 }) }),
    setPdfImportEmbedImages: (v: boolean) => set({ pdfImportEmbedImages: lsSetBool(LS_KEYS.pdfImportEmbedImages, !!v) }),
    setPdfImportMaxExtractedImagesPerPage: (v: number) =>
      set({ pdfImportMaxExtractedImagesPerPage: lsSetInt(LS_KEYS.pdfImportMaxExtractedImagesPerPage, v, { min: 0, max: 50 }) }),
    setPdfImportMaxEmbeddedImagesPerPage: (v: number) =>
      set({ pdfImportMaxEmbeddedImagesPerPage: lsSetInt(LS_KEYS.pdfImportMaxEmbeddedImagesPerPage, v, { min: 0, max: 50 }) }),
    setPdfImportMaxEmbeddedTotalBytes: (v: number) =>
      set({ pdfImportMaxEmbeddedTotalBytes: lsSetInt(LS_KEYS.pdfImportMaxEmbeddedTotalBytes, v, { min: 0, max: 50 * 1024 * 1024 }) }),
    setPdfImportMaxEmbeddedAssetBytes: (v: number) =>
      set({ pdfImportMaxEmbeddedAssetBytes: lsSetInt(LS_KEYS.pdfImportMaxEmbeddedAssetBytes, v, { min: 0, max: 20 * 1024 * 1024 }) }),
    setPdfImportReconstructTables: (v: boolean) => set({ pdfImportReconstructTables: lsSetBool(LS_KEYS.pdfImportReconstructTables, !!v) }),
    setPdfImportTableMinColumns: (v: number) =>
      set({ pdfImportTableMinColumns: lsSetInt(LS_KEYS.pdfImportTableMinColumns, v, { min: 2, max: 12 }) }),
    setPdfImportTableMinRows: (v: number) =>
      set({ pdfImportTableMinRows: lsSetInt(LS_KEYS.pdfImportTableMinRows, v, { min: 2, max: 20 }) }),
    setPdfImportTableMaxRows: (v: number) =>
      set({ pdfImportTableMaxRows: lsSetInt(LS_KEYS.pdfImportTableMaxRows, v, { min: 5, max: 200 }) }),
    setPdfImportProvider: (v: 'native' | 'docling-remote') =>
      set({ pdfImportProvider: lsSetJson(LS_KEYS.pdfImportProvider, v === 'docling-remote' ? 'docling-remote' : 'native') }),
    setPdfImportDoclingEndpoint: (v: string | null) =>
      set({ pdfImportDoclingEndpoint: lsSetJson(LS_KEYS.pdfImportDoclingEndpoint, typeof v === 'string' ? v : null) }),
    setPdfImportProviderFallbackToNative: (v: boolean) =>
      set({ pdfImportProviderFallbackToNative: lsSetBool(LS_KEYS.pdfImportProviderFallbackToNative, !!v) }),
    setPdfImportOcrEnabled: (v: boolean) =>
      set({ pdfImportOcrEnabled: lsSetBool(LS_KEYS.pdfImportOcrEnabled, !!v) }),
    setPdfImportOcrMode: (v: 'fallback' | 'always') =>
      set({ pdfImportOcrMode: lsSetJson(LS_KEYS.pdfImportOcrMode, v === 'always' ? 'always' : 'fallback') }),
    setLaunchSpotlightMode: (mode: 'tour' | 'stats') => set({ launchSpotlightMode: mode === 'stats' ? 'stats' : 'tour' }),
    setEnableLaunchSpotlight: (v: boolean) => {
      const storage = getLocalStorage();
      const next = persistLaunchSpotlightEnabled(storage, v);
      set({ enableLaunchSpotlight: next });
    },
    setStatusPanelPinned: (v: boolean) => set({ statusPanelPinned: lsSetBool(LS_KEYS.statusPanelPinned, v) }),
    setWorkspaceAutosaveEnabled: (v: boolean) => set({ workspaceAutosaveEnabled: lsSetBool(LS_KEYS.workspaceAutosaveEnabled, v) }),
})
