import React from 'react'
import { Camera, Footprints, type LucideIcon } from 'lucide-react'
import { renderAgenticOsInvocationKeywordChip } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT,
  floatingPanelCatalogThreeRowClassName,
  floatingPanelCatalogThreeRowThumbnailFrameClassName,
} from '@/lib/ui/floatingPanelCatalogLayout'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_INLINE_CHIP_GROUP_CLASSNAME } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { resolveXrAnimationPreset } from './xrAnimationCatalog'
import { resolveXrChoreographySpeedWarnings } from './xrChoreographyDiagnostics'
import { type XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntime'

function ChoreographyCard({
  Icon,
  description,
  footer,
  invocation,
  metadata,
  target,
  title,
}: {
  Icon: LucideIcon
  description: string
  footer: React.ReactNode
  invocation: string
  metadata: string
  target: 'cast' | 'camera'
  title: string
}) {
  return (
    <article
      className={floatingPanelCatalogThreeRowClassName('cursor-default')}
      data-kg-xr-choreography-card={target}
      data-kg-xr-choreography-card-layout={FLOATING_PANEL_CATALOG_THREE_ROW_LAYOUT}
    >
      <span
        className={floatingPanelCatalogThreeRowThumbnailFrameClassName('items-center justify-center')}
        role="img"
        aria-label={`${title} choreography path`}
      >
        <Icon className={cn('size-8', UI_THEME_TOKENS.text.tertiary)} strokeWidth={1.45} aria-hidden />
      </span>
      <section className="grid min-w-0 grid-rows-[auto_auto_auto] gap-1">
        <header className="flex min-w-0 items-center justify-between gap-2" data-kg-xr-choreography-card-row="title">
          <h3 className="truncate text-xs font-semibold" title={title}>{title}</h3>
        </header>
        <section className="grid min-w-0 gap-0.5" data-kg-xr-choreography-card-row="meta">
          <p className={cn('m-0 line-clamp-2 text-[11px]', UI_THEME_TOKENS.text.secondary)}>{description}</p>
          <p className={cn('m-0 truncate text-[10px] uppercase tracking-wide', UI_THEME_TOKENS.text.tertiary)}>{metadata}</p>
        </section>
        <footer className="flex min-w-0 items-center gap-1 overflow-x-auto" data-kg-xr-choreography-card-row="action">{footer}</footer>
      </section>
      <section className={cn('col-span-2 grid gap-1 border-t pt-2', UI_THEME_TOKENS.panel.border)} data-kg-xr-choreography-card-row="controls">
        <span className={cn('text-[9px]', UI_THEME_TOKENS.text.tertiary)}>Edit parameters in BottomPanel Timeline</span>
        <output
          className={cn(UI_INLINE_CHIP_GROUP_CLASSNAME, 'font-mono text-[9px]', UI_THEME_TOKENS.text.tertiary)}
          title={invocation}
          aria-label={`${title} invocation parameters`}
          data-kg-xr-choreography-card-row="invocation"
          data-kg-xr-choreography-invocation={target}
          data-kg-xr-mark-parameter-chips={target}
          data-kg-xr-mark-parameter-chip-renderer="shared-markdown-sigil"
        >
          {renderMarkdownSigilInlineText(invocation, {
            renderKeywordChip: ({ value, className }) => renderAgenticOsInvocationKeywordChip({ value, className, sourceLink: false }),
          })}
        </output>
      </section>
    </article>
  )
}

export function XrChoreographyInspector({
  cameraInvocation,
  castInvocation,
  controlTool,
  invocationReady,
  runtime,
  selectedActorId,
}: {
  cameraInvocation: string
  castInvocation: string
  controlTool: string
  invocationReady: boolean
  runtime: XrMotionReferenceRuntimeSnapshot
  selectedActorId: string
}) {
  const warnings = React.useMemo(() => resolveXrChoreographySpeedWarnings(runtime.plan), [runtime.plan])
  const track = runtime.plan.cast.find(candidate => candidate.actorId === selectedActorId) || null
  const castMark = track?.marks.find(mark => runtime.selectedMark?.kind === 'cast'
    && runtime.selectedMark.actorId === track.actorId
    && runtime.selectedMark.markId === mark.id) || track?.marks[0]
  const cameraMark = runtime.plan.camera.find(mark => runtime.selectedMark?.kind === 'camera'
    && runtime.selectedMark.markId === mark.id) || runtime.plan.camera[0]
  const castMarkIndex = castMark ? track?.marks.findIndex(mark => mark.id === castMark.id) ?? -1 : -1
  const cameraMarkIndex = cameraMark ? runtime.plan.camera.findIndex(mark => mark.id === cameraMark.id) : -1
  const projectedCastInvocation = castMark
    ? castInvocation
      .replace('<typed-id>', castMark.id)
      .replace('<typed-easing>', castMark.transition)
      .replace('<typed-gait>', castMark.gait)
      .replace('<x,y,z>', castMark.position.join(','))
    : castInvocation
  const projectedCameraInvocation = cameraMark
    ? cameraInvocation
      .replace('<typed-id>', cameraMark.id)
      .replace('<typed-easing>', cameraMark.easing)
    : cameraInvocation

  return (
    <section className="grid gap-2" aria-label="Choreography" data-kg-xr-choreography-inspector="shared-runtime">
      <header className="flex items-center justify-between gap-2">
        <section className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase">Choreography</h2>
          <p className={cn('m-0 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>One mark model for cast and camera · Timeline owns time</p>
        </section>
        <section className="grid shrink-0 justify-items-end gap-0.5">
          <output className={cn('text-[9px]', warnings.length ? 'text-amber-700 dark:text-amber-300' : UI_THEME_TOKENS.text.tertiary)} data-kg-xr-speed-warning-count={warnings.length}>{warnings.length ? `${warnings.length} speed warning${warnings.length === 1 ? '' : 's'}` : 'Speed sane'}</output>
          <output
            className={cn('text-[9px]', invocationReady ? 'text-emerald-700 dark:text-emerald-300' : UI_THEME_TOKENS.text.tertiary)}
            title={controlTool}
            data-kg-xr-choreography-runtime-ready={invocationReady ? '1' : '0'}
            data-kg-xr-choreography-mcp={controlTool}
          >
            {invocationReady ? 'MCP · / @ # ready' : 'Invocation catalog hydrating'}
          </output>
        </section>
      </header>
      {track && castMark ? (
        <ChoreographyCard
          Icon={Footprints}
          target="cast"
          title={track.label}
          description="Drag its numbered stage mark; tap WASD or arrow keys for 0.25 m, hold for smooth motion, and use Shift for 0.05 m precision. Edit XYZ in its Timeline lane."
          invocation={projectedCastInvocation}
          metadata={`${track.animation ? `${resolveXrAnimationPreset(track.animation.presetId).label} · ` : 'Authored path · '}${track.marks.length} mark${track.marks.length === 1 ? '' : 's'} · mark ${castMarkIndex + 1} · ${castMark.timeSeconds}s`}
          footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-choreography-selection-owner="timeline-cast">Select marks in the {track.label} Timeline lane.</span>}
        />
      ) : (
        <ChoreographyCard Icon={Footprints} target="cast" title="Cast path" description="Select a cast actor to edit its path choreography." invocation={castInvocation || controlTool} metadata="No cast target selected" footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Choose a cast target above.</span>} />
      )}
      {cameraMark ? (
        <ChoreographyCard
          Icon={Camera}
          target="camera"
          title="Camera path"
          description="The selected Timeline mark is reflected here; edit time and easing in its camera lane. Frame in Camera → SHOOT."
          invocation={projectedCameraInvocation}
          metadata={`${runtime.plan.camera.length} mark${runtime.plan.camera.length === 1 ? '' : 's'} · ${cameraMark.rig} · mark ${cameraMarkIndex + 1} · ${cameraMark.timeSeconds}s`}
          footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)} data-kg-xr-choreography-selection-owner="timeline-camera">Select marks in the Camera Timeline lane.</span>}
        />
      ) : (
        <ChoreographyCard Icon={Camera} target="camera" title="Camera path" description="Add camera marks in Camera → SHOOT; edit them in BottomPanel Timeline." invocation={cameraInvocation || controlTool} metadata="0 marks · Timeline owns time" footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>No camera marks yet.</span>} />
      )}
    </section>
  )
}
