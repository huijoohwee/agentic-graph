import React from 'react'
import RichMediaIframe from '@/components/RichMediaIframe'
import { SharedWebpageSurface } from '@/components/SharedWebpageSurface'
import { CardMediaPreview } from '@/lib/cards/CardMediaPreview'
import { CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME } from '@/lib/cards/cardMarkdownPreviewUtils'
import { shouldUseDirectRichMediaPanelSrcDocSandbox } from '@/lib/render/richMediaPanelSrcDoc'
import { resolveIframeSandbox } from 'grph-shared/rich-media/iframe'
import type { RichMediaPanelModel } from './useRichMediaPanelModel'

const WorkspaceSourceTranscript = React.lazy(() => import('@/features/video-agent/WorkspaceSourceTranscript'))

export function RichMediaPanelIframeSurface(args: {
  model: RichMediaPanelModel
}) {
  const { model } = args
  if (model.workspaceTranscriptTimeMs != null) {
    return <section className="h-full overflow-auto p-2" aria-label="Timeline-synchronized source transcript">
      <React.Suspense fallback={<p>Loading transcript…</p>}>
        <WorkspaceSourceTranscript key={model.markdownDocumentName} documentPath={model.markdownDocumentName}
          timeMs={model.workspaceTranscriptTimeMs} onReady={model.setReady} />
      </React.Suspense>
    </section>
  }
  if (model.effectiveInlineSrcDoc) {
    return (
      <section
        aria-label="Rich media embedded preview"
        data-kg-rich-media-embedded-preview="1"
        className={CARD_MARKDOWN_PREVIEW_MEDIA_SHELL_CLASS_NAME}
        style={model.inlineSrcDocEmbeddedSurfaceStyle}
      >
        <SharedWebpageSurface
          renderMode="iframe"
          webpageUrl={model.proxiedUrl}
          title={model.title}
          iframeSrc="about:blank"
          iframeSrcDoc={model.normalizedInlineSrcDoc}
          iframeAllow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          iframeSandbox={shouldUseDirectRichMediaPanelSrcDocSandbox(model.normalizedInlineSrcDoc) ? resolveIframeSandbox('direct') : undefined}
          iframeLoading="eager"
          iframeRef={model.inlineSrcDocFrameRef}
          iframeScrolling={model.panelOwnsInlineSrcDocScroll ? 'no' : 'auto'}
          iframeReferrerPolicy="no-referrer"
          style={model.inlineSrcDocSurfaceStyle}
          onLoad={() => {
            model.setReady(true)
            model.syncInlineSrcDocTheme()
            model.scheduleInlineSrcDocTimelineFrameBurst()
          }}
        />
      </section>
    )
  }
  if (model.iframeEmbed?.direct) {
    return (
      <CardMediaPreview
        kind="iframe"
        url={model.rawUrl}
        title={model.title}
        interactive={model.contentInteractive}
        fit="contain"
        mediaStyle={model.iframeSurfaceStyle}
        onReady={() => model.setReady(true)}
      />
    )
  }
  if (
    model.iframeEmbed
    && !model.iframeEmbed.direct
    && (model.shouldHideSurfaceUntilReady || model.isSnapshotIframe)
    && (!model.preferEmbed || model.isSnapshotIframe)
  ) {
    return (
      <SharedWebpageSurface
        renderMode="snapshot"
        webpageUrl={model.proxiedUrl}
        title={model.title}
        className="w-full h-full"
        style={{ ...model.iframeSurfaceStyle, overflow: 'hidden', touchAction: undefined }}
      />
    )
  }
  return (
    <SharedWebpageSurface
      renderMode="iframe"
      webpageUrl={model.proxiedUrl}
      title={model.title}
      style={model.iframeSurfaceStyle}
      iframeRenderer={frameProps => (
        <RichMediaIframe
          title={frameProps.title}
          url={model.proxiedUrl}
          className={frameProps.className}
          style={frameProps.style}
          onLoad={frameProps.onLoad}
        />
      )}
      onLoad={() => model.setReady(true)}
    />
  )
}
