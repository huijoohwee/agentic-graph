import type { CollectionLayout as MediaCatalogLayout } from 'agentic-design-system/collection-layout'
import React from 'react'
import { INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID, type InlineCommandMenuActionSpec } from '@/lib/command-menu/inlineCommandMenuCatalog'
import type { TimelineMediaReaderSummary } from '@/components/timeline/timelineMediaReader'

export type { MediaCatalogLayout }
export type MediaPanelActionSpec = InlineCommandMenuActionSpec
export type MediaCatalogSourceMetadataItem = {
  byteSize: number | null
  id: string
  importMode: string
  mimeHint: string
  name: string
  sourceUrl: string
  summary: TimelineMediaReaderSummary
}
export type UploadedMediaDescriptionDrafts = Record<string, string>
export type UploadedMediaFieldDrafts = Record<string, string>

export const MEDIA_CATALOG_LAYOUT_STORAGE_KEY = 'kg.media.catalog.layout'
export const MEDIA_DESCRIPTION_STORAGE_KEY = 'kg.media.descriptions'
export const MEDIA_FIELDS_STORAGE_KEY = 'kg.media.fields'
export const MEDIA_GENERATE_MEDIA_ACTION_ID = 'generate-media' as const
export const MEDIA_IMPORT_URL_ACTION_ID = 'import-media-url' as const
export const LOW_PRIORITY_MEDIA_THUMBNAIL_IMAGE_PROPS = {
  fetchpriority: 'low',
} as unknown as React.ImgHTMLAttributes<HTMLImageElement>

export const MEDIA_NEW_ACTIONS: readonly MediaPanelActionSpec[] = [
  {
    id: INLINE_UPLOAD_MEDIA_VARIABLE_ACTION_ID,
    kind: 'variable',
    label: 'Upload Media',
    group: 'New Media',
    description: 'Upload image, audio, or video into the shared Media storage flow',
    keywords: ['new', 'upload', 'media', 'image', 'audio', 'video', 'r2', 'storage'],
  },
  {
    id: MEDIA_IMPORT_URL_ACTION_ID,
    kind: 'variable',
    label: 'Import URL',
    group: 'New Media',
    description: 'Import image, audio, or video from an http(s) URL into shared Media storage',
    keywords: ['new', 'import', 'url', 'media', 'image', 'audio', 'video', 'r2', 'storage'],
  },
  {
    id: MEDIA_GENERATE_MEDIA_ACTION_ID,
    kind: 'variable',
    label: 'Generate Media',
    group: 'New Media',
    description: 'Open the prompt panel to generate image, audio, or video media',
    keywords: ['new', 'generate', 'media', 'prompt', 'image', 'audio', 'video'],
  },
]

export function readStoredMediaCatalogLayout(): MediaCatalogLayout {
  try {
    const raw = globalThis.localStorage?.getItem(MEDIA_CATALOG_LAYOUT_STORAGE_KEY)
    if (raw === 'card' || raw === 'grid' || raw === 'list') return raw
    return 'grid'
  } catch {
    return 'grid'
  }
}

export function writeStoredMediaCatalogLayout(layout: MediaCatalogLayout): void {
  try {
    globalThis.localStorage?.setItem(MEDIA_CATALOG_LAYOUT_STORAGE_KEY, layout)
  } catch {
    void 0
  }
}

export function readStoredMediaDescriptionDrafts(): UploadedMediaDescriptionDrafts {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(MEDIA_DESCRIPTION_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value || '')]))
  } catch {
    return {}
  }
}

export function writeStoredMediaDescriptionDrafts(drafts: UploadedMediaDescriptionDrafts): void {
  try {
    globalThis.localStorage?.setItem(MEDIA_DESCRIPTION_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    void 0
  }
}

export function readStoredMediaFieldDrafts(): UploadedMediaFieldDrafts {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(MEDIA_FIELDS_STORAGE_KEY) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value || '')]))
  } catch {
    return {}
  }
}

export function writeStoredMediaFieldDrafts(drafts: UploadedMediaFieldDrafts): void {
  try {
    globalThis.localStorage?.setItem(MEDIA_FIELDS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    void 0
  }
}
