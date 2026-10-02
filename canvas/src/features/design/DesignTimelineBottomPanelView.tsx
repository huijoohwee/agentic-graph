import React from 'react'
import { Film, Rows3 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { buildDesignAgentVideoArtifact } from '@/features/design/designAgentVideoSpec'
import { useActiveGraphData } from '@/hooks/useActiveGraphData'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

export function DesignTimelineBottomPanelView({ compact = false }: { compact?: boolean }) {
  const graphData = useActiveGraphData()
  const { graphDataRevision, selectedNodeIds } = useGraphStore(
    useShallow(state => ({
      graphDataRevision: state.graphDataRevision || 0,
      selectedNodeIds: Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [],
    })),
  )
  const artifact = React.useMemo(
    () => buildDesignAgentVideoArtifact({
      graphData,
      graphRevision: graphDataRevision,
      selectedNodeIds,
      title: 'Design HTML Video Render',
    }),
    [graphData, graphDataRevision, selectedNodeIds],
  )
  const durationMs = Math.max(1, artifact.renderSpec.durationMs || 1)
  const tracks = artifact.manifest.timelineTracks
  const minHeight = compact ? 160 : 188

  return (
    <section
      className={cn('grid h-full min-h-0 gap-2 rounded border p-2', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.panel.bg)}
      aria-label="Design video timeline bottom panel"
      data-kg-design-timeline-bottom-panel="1"
    >
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <section className={cn('flex min-w-0 items-center gap-2 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
          <Film className="h-4 w-4" aria-hidden={true} />
          <span>Design Video Timeline</span>
        </section>
        <dl className="flex min-w-0 flex-wrap items-center gap-1">
          {[
            ['tracks', tracks.length],
            ['files', artifact.manifest.workspaceFiles.length],
            ['assets', artifact.manifest.assets.length],
            ['duration', `${durationMs}ms`],
          ].map(([label, value]) => (
            <section key={String(label)} className={cn('rounded border px-2 py-1', UI_THEME_TOKENS.panel.border)}>
              <dt className={cn('text-xs uppercase', UI_THEME_TOKENS.text.tertiary)}>{label}</dt>
              <dd className={cn('m-0 font-mono text-xs', UI_THEME_TOKENS.text.primary)}>{value}</dd>
            </section>
          ))}
        </dl>
      </header>
      <section className="grid min-h-0 grid-cols-[7rem_minmax(0,1fr)] overflow-hidden rounded border" style={{ minHeight }} aria-label="Design video timeline lanes">
        <aside className={cn('grid border-r p-2', UI_THEME_TOKENS.panel.border)} aria-label="Design timeline lane labels">
          {artifact.manifest.timelineLanes.map(lane => (
            <section key={lane.id} className={cn('flex min-w-0 items-center gap-1 text-xs font-semibold', UI_THEME_TOKENS.text.primary)}>
              <Rows3 className="h-3.5 w-3.5" aria-hidden={true} />
              <span className="truncate">{lane.label}</span>
            </section>
          ))}
        </aside>
        <section className="relative min-h-0 overflow-hidden" aria-label="Design video timeline ruler">
          <section className={cn('absolute inset-0 opacity-70', UI_THEME_TOKENS.panel.bg)} aria-hidden={true} />
          {artifact.manifest.timelineTicks.map(tick => (
            <section
              key={`${tick.timeMs}:${tick.label}`}
              className={cn('absolute inset-y-0 border-l text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.tertiary)}
              style={{ left: `clamp(0.75rem, ${tick.percent}%, calc(100% - 0.75rem))` }}
              aria-label={`Timeline tick ${tick.label}`}
            >
              <span className="ml-1 font-mono">{tick.label}</span>
            </section>
          ))}
          {tracks.length > 0 ? (
            tracks.map(track => {
              const leftPercent = (track.startMs / durationMs) * 100
              const widthPercent = Math.max(3, (track.durationMs / durationMs) * 100)
              return (
                <article
                  key={track.id}
                  className="absolute top-12 flex min-w-0 items-center rounded border border-[var(--kg-accent)] bg-[var(--kg-accent-soft-bg)] px-2 py-1 text-xs text-[var(--kg-text-primary)] shadow-[var(--kg-shadow-raised)]"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${Math.min(100 - leftPercent, widthPercent)}%`,
                    transform: `translateY(${track.trackIndex * 22}px)`,
                  }}
                  aria-label={`${track.label} design video track`}
                  data-kg-design-video-timeline-track={track.id}
                  data-start={String(track.startMs)}
                  data-duration={String(track.durationMs)}
                  data-track-index={String(track.trackIndex)}
                  title={`${track.label} ${track.startMs}ms`}
                >
                  <span className="truncate">{track.label}</span>
                </article>
              )
            })
          ) : (
            <section className={cn('absolute inset-x-8 top-1/2 -translate-y-1/2 rounded border border-dashed px-3 py-2 text-center text-xs', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.text.secondary)}>
              Select or add Design layers to stage HTML-video tracks.
            </section>
          )}
        </section>
      </section>
    </section>
  )
}
