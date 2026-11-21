import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { scopeImportedTranscriptPanel } from '@/features/video-agent/videoAgentTranscriptProjection'
import type { RichMediaPanelMediaState } from './useRichMediaPanelMediaState'
import { useRichMediaPanelMediaState } from './useRichMediaPanelMediaState'
import type { RichMediaPanelSurfaceState } from './useRichMediaPanelSurfaceState'
import { useRichMediaPanelSurfaceState } from './useRichMediaPanelSurfaceState'
import type { RichMediaPanelProps } from './RichMediaPanel.types'

export type RichMediaPanelModel = RichMediaPanelMediaState & RichMediaPanelSurfaceState

export function useRichMediaPanelModel(
  props: RichMediaPanelProps,
  ref: React.ForwardedRef<HTMLElement>,
): RichMediaPanelModel {
  const imported = useGraphStore(state => /(?:\.video-agent\.md|\/video-sequence\.timeline\.md)$/i.test(state.markdownDocumentName || ''))
  const srcDoc = React.useMemo(() => imported && props.srcDoc ? scopeImportedTranscriptPanel(props.srcDoc) : props.srcDoc, [imported, props.srcDoc])
  const mediaState = useRichMediaPanelMediaState({ ...props, srcDoc })
  const surfaceState = useRichMediaPanelSurfaceState(props, ref, mediaState)
  return {
    ...mediaState,
    ...surfaceState,
  }
}
