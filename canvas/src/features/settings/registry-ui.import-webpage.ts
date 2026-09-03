import { useGraphStore } from '@/hooks/useGraphStore'
import type { SettingMeta } from './types'

const s = () => useGraphStore.getState()

export const uiImportWebpageSettingsRegistry: SettingMeta[] = [
  {
    key: 'webpageImportIncludeImages',
    type: 'boolean',
    source: 'store',
    read: () => s().webpageImportIncludeImages,
    write: v => s().setWebpageImportIncludeImages(!!v),
    docKey: 'webpageImportIncludeImages',
    default: () => true,
  },
  {
    key: 'webpageImportView',
    type: 'string',
    source: 'store',
    read: () => s().webpageImportView,
    write: v =>
      s().setWebpageImportView(
        String(v) === 'html' ? 'html' : String(v) === 'json' ? 'json' : 'markdown',
      ),
    docKey: 'webpageImportView',
    default: () => 'html',
    options: ['markdown', 'html', 'json'],
  },
  {
    key: 'webpageViewerScriptPolicy',
    type: 'string',
    source: 'store',
    read: () => s().webpageViewerScriptPolicy,
    write: v => s().setWebpageViewerScriptPolicy(String(v) === 'allow' ? 'allow' : 'strip'),
    docKey: 'webpageViewerScriptPolicy',
    default: () => 'allow',
    options: ['strip', 'allow'],
  },
  {
    key: 'webpageArtifactFidelityMaxLevel',
    type: 'number',
    source: 'store',
    read: () => s().webpageArtifactFidelityMaxLevel,
    write: v => s().setWebpageArtifactFidelityMaxLevel(Number(v)),
    docKey: 'webpageArtifactFidelityMaxLevel',
    default: () => 4,
  },
  {
    key: 'websiteImportDiscoverSitemap',
    type: 'boolean',
    source: 'store',
    read: () => s().websiteImportDiscoverSitemap,
    write: v => s().setWebsiteImportDiscoverSitemap(!!v),
    docKey: 'websiteImportDiscoverSitemap',
    default: () => true,
  },
  {
    key: 'websiteImportGenerateWebpageArtifactDocs',
    type: 'boolean',
    source: 'store',
    read: () => s().websiteImportGenerateWebpageArtifactDocs,
    write: v => s().setWebsiteImportGenerateWebpageArtifactDocs(!!v),
    docKey: 'websiteImportGenerateWebpageArtifactDocs',
    default: () => true,
  },
  {
    key: 'websiteImportMaxPages',
    type: 'number',
    source: 'store',
    read: () => s().websiteImportMaxPages,
    write: v => s().setWebsiteImportMaxPages(Number(v)),
    docKey: 'websiteImportMaxPages',
    default: () => 100,
  },
  {
    key: 'websiteImportConcurrency',
    type: 'number',
    source: 'store',
    read: () => s().websiteImportConcurrency,
    write: v => s().setWebsiteImportConcurrency(Number(v)),
    docKey: 'websiteImportConcurrency',
    default: () => 4,
  },
  {
    key: 'websiteImportOutputDirRel',
    type: 'string',
    source: 'store',
    read: () => s().websiteImportOutputDirRel,
    write: v => s().setWebsiteImportOutputDirRel(String(v)),
    docKey: 'websiteImportOutputDirRel',
    default: () => 'agentic-graph-workspace/website-imports',
  },
]
