import React from 'react'
import { FileCode, Film, Images, ListTree, Rows3 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { createHtmlVideoEngineRegistryFromRuntimeConfig, runHtmlVideoFlowNode } from '@/features/html-video-renderer'
import { buildDesignAgentVideoArtifact, type DesignAgentVideoArtifact } from '@/features/design/designAgentVideoSpec'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useActiveGraphData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { uiToolbarRowScrollClassName } from '@/features/toolbar/ui/toolbarStyles'

const DESIGN_AGENT_VIDEO_METRIC_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4'

const formatTimelineSeconds = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 100) / 10)
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`
}

export function DesignAgentVideoPanel({ active }: { active: boolean }) {
  const panelTypography = usePanelTypography()
  const graphData = useActiveGraphData()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    graphDataRevision,
    designRendererNodes,
    selectedNodeIds,
    markdownDocumentName,
    upsertUiToast,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      graphDataRevision: s.graphDataRevision || 0,
      designRendererNodes: s.designRendererNodes,
      selectedNodeIds: Array.isArray(s.selectedNodeIds) ? s.selectedNodeIds : [],
      markdownDocumentName: s.markdownDocumentName || null,
      upsertUiToast: s.upsertUiToast,
    })),
  )
  const previewUrlRef = React.useRef<string>('')
  const [artifact, setArtifact] = React.useState<DesignAgentVideoArtifact | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState('')
  const [rendering, setRendering] = React.useState(false)

  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      previewUrlRef.current = ''
    }
  }, [])

  const iconSizeClass = getIconSizeClass(uiIconScale)
  const layerCount = Array.isArray(designRendererNodes) ? designRendererNodes.length : 0
  const stagedArtifact = React.useMemo(
    () => artifact || buildDesignAgentVideoArtifact({
      graphData,
      graphRevision: graphDataRevision,
      selectedNodeIds,
      title: 'Design HTML Video Render',
    }),
    [artifact, graphData, graphDataRevision, selectedNodeIds],
  )

  const renderDesignVideo = React.useCallback(async () => {
    if (!active || rendering) return
    const nextArtifact = buildDesignAgentVideoArtifact({
      graphData,
      graphRevision: graphDataRevision,
      selectedNodeIds,
      title: 'Design HTML Video Render',
    })
    setArtifact(nextArtifact)
    setRendering(true)
    try {
      const result = await runHtmlVideoFlowNode({
        node: nextArtifact.flowNode,
        registry: createHtmlVideoEngineRegistryFromRuntimeConfig(),
        workspacePath: markdownDocumentName || null,
        fs: await getWorkspaceFs(),
      })
      if (result.ok === false) {
        upsertUiToast({
          id: 'design-agent-video-render',
          kind: 'warning',
          message: result.reason || 'Design video render failed.',
          ttlMs: 3200,
        })
        return
      }
      const nextPreviewUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(result.blob)
        : ''
      if (previewUrlRef.current && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrlRef.current)
      }
      previewUrlRef.current = nextPreviewUrl
      setPreviewUrl(nextPreviewUrl)
      upsertUiToast({
        id: 'design-agent-video-render',
        kind: 'neutral',
        message: `Rendered ${result.outputPath ? result.outputPath.split('/').pop() : 'design HTML video'}.`,
        ttlMs: 2600,
      })
    } finally {
      setRendering(false)
    }
  }, [active, graphData, graphDataRevision, markdownDocumentName, rendering, selectedNodeIds, upsertUiToast])

  return (
    <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)} aria-label="Design video render state">
      <header className={cn(uiToolbarRowScrollClassName, 'justify-between gap-2')}>
        <section className={cn('text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>Video</section>
        <button
          type="button"
          className={cn('App-toolbar__btn', UI_RESPONSIVE_INLINE_ELEMENT_ROW_CLASSNAME, 'gap-1', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg, panelTypography.microLabelClass)}
          onClick={renderDesignVideo}
          disabled={!active || rendering || layerCount <= 0}
          aria-label="Render design HTML video"
          title="Render design HTML video"
        >
          <Film className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
          <span>{rendering ? 'Rendering' : 'Render MP4'}</span>
        </button>
      </header>
      <dl className={`mt-2 ${DESIGN_AGENT_VIDEO_METRIC_GRID_CLASS_NAME}`}>
        {[
          ['Engine', stagedArtifact.renderSpec.engineHint || 'canvas-2d'],
          ['Frames', Math.ceil((stagedArtifact.renderSpec.durationMs / 1000) * stagedArtifact.renderSpec.fps)],
          ['Tracks', stagedArtifact.manifest.timelineTracks.length],
          ['Files', stagedArtifact.manifest.workspaceFiles.length],
          ['Assets', stagedArtifact.manifest.assets.length],
          ['Output', previewUrl ? 'video/mp4' : 'staged'],
        ].map(([label, value]) => (
          <section key={String(label)} className={cn('rounded border px-2 py-1', UI_THEME_TOKENS.panel.border)}>
            <dt className={cn(panelTypography.microLabelClass, UI_THEME_TOKENS.text.tertiary)}>{label}</dt>
            <dd className={cn('m-0 mt-0.5 truncate font-mono text-xs', UI_THEME_TOKENS.text.primary)}>{value}</dd>
          </section>
        ))}
      </dl>
      <section className="mt-2 grid min-w-0 gap-2 xl:grid-cols-2" aria-label="Agent video workspace">
        <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border)}>
          <header className={cn('mb-1 flex min-w-0 items-center gap-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
            <FileCode className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Workspace files</span>
          </header>
          <ol className="grid min-w-0 gap-1" aria-label="Design video workspace files">
            {stagedArtifact.manifest.workspaceFiles.map(file => (
              <li key={file.path} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <span className={cn('font-mono text-xs uppercase', UI_THEME_TOKENS.text.tertiary)}>{file.kind}</span>
                <span className={cn('truncate font-mono text-xs', UI_THEME_TOKENS.text.primary)}>{file.path}</span>
                <span className={cn('text-xs', UI_THEME_TOKENS.text.tertiary)}>{file.role}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border)}>
          <header className={cn('mb-1 flex min-w-0 items-center gap-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
            <ListTree className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Compositions</span>
          </header>
          <ol className="grid min-w-0 gap-1" aria-label="Design video compositions">
            {stagedArtifact.manifest.compositions.slice(0, 6).map(composition => (
              <li key={composition.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{composition.trackIndex}</span>
                <span className={cn('truncate text-xs', UI_THEME_TOKENS.text.primary)}>{composition.label}</span>
                <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>
                  {formatTimelineSeconds(composition.startMs)}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border)}>
          <header className={cn('mb-1 flex min-w-0 items-center gap-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
            <Images className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Assets</span>
          </header>
          <ol className="grid min-w-0 gap-1" aria-label="Design video assets">
            {stagedArtifact.manifest.assets.slice(0, 6).map(asset => (
              <li key={asset.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{asset.kind}</span>
                <span className={cn('truncate text-xs', UI_THEME_TOKENS.text.primary)}>{asset.label}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className={cn('rounded border p-2', UI_THEME_TOKENS.panel.border)}>
          <header className={cn('mb-1 flex min-w-0 items-center gap-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
            <Rows3 className={iconSizeClass} strokeWidth={uiIconStrokeWidth} aria-hidden={true} />
            <span>Timeline lanes</span>
          </header>
          <ol className="grid min-w-0 gap-1" aria-label="Design video timeline tracks">
            {stagedArtifact.manifest.timelineLanes.flatMap(lane => lane.tracks.slice(0, 6).map(track => (
              <li key={`${lane.id}:${track.id}`} className={cn('grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border px-2 py-1', UI_THEME_TOKENS.panel.border)}>
                <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>{track.trackIndex}</span>
                <span className={cn('truncate text-xs', UI_THEME_TOKENS.text.primary)}>{track.label}</span>
                <span className={cn('font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>
                  {formatTimelineSeconds(track.startMs)}
                </span>
              </li>
            )))}
          </ol>
        </section>
      </section>
      {previewUrl ? (
        <figure className="mt-2">
          <video className="block aspect-video w-full rounded border object-cover" src={previewUrl} controls={true} playsInline={true} />
          <figcaption className={cn('mt-1 truncate font-mono text-xs', UI_THEME_TOKENS.text.tertiary)}>
            {artifact?.semanticKey || 'design-agent-video'}
          </figcaption>
        </figure>
      ) : null}
    </section>
  )
}
