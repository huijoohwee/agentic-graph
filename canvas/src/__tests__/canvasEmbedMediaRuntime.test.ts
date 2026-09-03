import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildRuntimeStorageMediaAccessUrl,
  normalizeRuntimeStorageMediaAccessUrlsInText,
  normalizeRuntimeStorageMediaUrl,
} from '@/lib/storage/runtimeMediaUrl'
import { buildRichMediaPanelOverlayState, buildRichMediaPanelPreviewSpec } from '@/lib/render/richMediaSsot'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/storyboardWidget/richMediaPanelConfig'
import { readWorkspaceActiveDocumentResolvedText } from '@/features/source-files/sourceFilesRuntimeActive'

export function testCanvasEmbedMediaRebindsAndExposesSelectableSurfaces(): void {
  const staleLocalUrl = 'http://localhost:5181/api/storage/media/airvio/runs/upload-demo/image/example.jpg?agentic_os_media_token=stale'
  const rebound = normalizeRuntimeStorageMediaUrl(staleLocalUrl, 'https://airvio.co')
  if (!rebound.startsWith('https://airvio.co/api/storage/media/airvio/runs/upload-demo/image/example.jpg')) {
    throw new Error(`expected published embed media to rebind to the active runtime origin, got ${rebound}`)
  }
  const accessUrl = buildRuntimeStorageMediaAccessUrl({ publicUrl: rebound, runtimeOrigin: 'https://airvio.co' })
  if (!accessUrl.includes('agentic_os_media_token=') || accessUrl.includes('agentic_os_media_token=stale')) {
    throw new Error(`expected published embed media to receive a fresh runtime access token, got ${accessUrl}`)
  }

  const previousWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost:5173' } }
  try {
    const staleLocalMediaPanelNode = {
      id: 'rendered-local-media-artifact',
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label: 'Rendered local media artifact',
      properties: {
        imageUrl: 'http://localhost:5174/api/storage/media/airvio/runs/upload-demo/image/runtime-demo.jpg?agentic_os_media_token=stale-token',
      },
    }
    const staleLocalMediaPanel = buildRichMediaPanelOverlayState({ node: staleLocalMediaPanelNode as never })
    const staleLocalMediaPreview = staleLocalMediaPanel
      ? buildRichMediaPanelPreviewSpec({ node: staleLocalMediaPanelNode as never, panel: staleLocalMediaPanel })
      : null
    const expectedRuntimePrefix = 'http://localhost:5173/api/storage/media/airvio/runs/upload-demo/image/runtime-demo.jpg?agentic_os_media_token='
    if (!staleLocalMediaPreview || staleLocalMediaPreview.kind !== 'image' || !staleLocalMediaPreview.url.startsWith(expectedRuntimePrefix)) {
      throw new Error(`expected stale local Rich Media preview URL to remap to the current runtime origin, got ${JSON.stringify(staleLocalMediaPreview)}`)
    }
    if (staleLocalMediaPreview.url.includes('localhost:5174') || staleLocalMediaPreview.url.includes('stale-token')) {
      throw new Error(`expected stale local Rich Media preview URL to replace the prior dev origin and token, got ${JSON.stringify(staleLocalMediaPreview)}`)
    }
  } finally {
    ;(globalThis as { window?: unknown }).window = previousWindow
  }

  const richMediaState = readFileSync(resolve(process.cwd(), 'src/components/useRichMediaPanelSurfaceState.ts'), 'utf8')
  const directMedia = readFileSync(resolve(process.cwd(), 'src/components/RichMediaPanelDirectMediaSurface.tsx'), 'utf8')
  const cardMediaSlot = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/StoryboardCardMediaDropSlot2d.tsx'), 'utf8')
  for (const contract of [
    "mediaState.kind === 'video' || mediaState.kind === 'audio'",
    "'data-kg-rich-media-selectable-surface': '1'",
    "role: 'group'",
  ]) {
    if (!richMediaState.includes(contract)) throw new Error(`expected Rich Media selection contract ${contract}`)
  }
  if (!directMedia.includes('{...model.directMediaPreviewCardProps}')) {
    throw new Error('expected audio to inherit the shared selectable media surface contract')
  }
  if (!cardMediaSlot.includes('mediaSelectableSurfaceDataAttr')) {
    throw new Error('expected Storyboard card media wrappers to remain visible to selection tooling')
  }
}

export async function testWorkspaceMarkdownTextRebindsStaleLocalStorageMediaUrls(): Promise<void> {
  const previousWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'https://airvio.co' } }
  try {
    const staleMarkdown = [
      'Runtime gate',
      '![buddydrone.jpg](http://localhost:5181/api/storage/media/airvio/runs/upload-730fe6850f0fc26f/image/buddydrone-730fe6850f0fc26f.jpg?agentic_os_media_token=stale-token)',
      'thumbnailUrl: {key: thumbnailUrl, type: string, value: "http://localhost:5177/api/storage/media/airvio/runs/upload-170a76238422bb27/image/1920s_singapore_malaya_202606190937-170a76238422bb27.jpeg?agentic_os_media_token=old-token"}',
    ].join('\n')
    const normalizedText = normalizeRuntimeStorageMediaAccessUrlsInText({ text: staleMarkdown, runtimeOrigin: 'https://airvio.co' })
    if (!normalizedText.includes('https://airvio.co/api/storage/media/airvio/runs/upload-730fe6850f0fc26f/image/buddydrone-730fe6850f0fc26f.jpg?agentic_os_media_token=')) {
      throw new Error(`expected markdown text media urls to rebind to the active runtime origin, got ${normalizedText}`)
    }
    if (normalizedText.includes('localhost:5181') || normalizedText.includes('localhost:5177') || normalizedText.includes('agentic_os_media_token=stale-token') || normalizedText.includes('agentic_os_media_token=old-token')) {
      throw new Error(`expected markdown text media urls to replace stale local origins and tokens, got ${normalizedText}`)
    }

    const resolvedText = await readWorkspaceActiveDocumentResolvedText({
      activePath: '/docs/workspace-readme.md',
      currentText: staleMarkdown,
    })
    if (!resolvedText.includes('https://airvio.co/api/storage/media/airvio/runs/upload-730fe6850f0fc26f/image/buddydrone-730fe6850f0fc26f.jpg?agentic_os_media_token=')) {
      throw new Error(`expected active workspace markdown text to rebind stale storage media urls, got ${resolvedText}`)
    }
    if (resolvedText.includes('localhost:5181') || resolvedText.includes('localhost:5177') || resolvedText.includes('agentic_os_media_token=stale-token') || resolvedText.includes('agentic_os_media_token=old-token')) {
      throw new Error(`expected active workspace markdown text to strip stale local origins and tokens, got ${resolvedText}`)
    }
  } finally {
    ;(globalThis as { window?: unknown }).window = previousWindow
  }
}
