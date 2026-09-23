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
import { selectXrMotionReferenceCastMark, selectXrMotionReferenceCameraMark, type XrMotionReferenceRuntimeSnapshot } from './xrMotionReferenceRuntime'
import { PanelSelect } from '@/lib/ui/panelFormControls'
import { evaluateXrStudioExercises } from './xrSceneExercises'
import { projectXrStudioScene, queryXrStudioScene } from './xrSceneSemantic'

function ChoreographyCard({
  Icon,
  controls,
  description,
  footer,
  invocation,
  metadata,
  target,
  title,
}: {
  Icon: LucideIcon
  controls?: React.ReactNode
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
        {controls || <span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Edit parameters in BottomPanel Timeline</span>}
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
  children,
  castInvocation,
  controlTool,
  invocationReady,
  runtime,
  selectedActorId,
}: {
  cameraInvocation: string
  children?: React.ReactNode
  castInvocation: string
  controlTool: string
  invocationReady: boolean
  runtime: XrMotionReferenceRuntimeSnapshot
  selectedActorId: string
}) {
  const warnings = React.useMemo(() => resolveXrChoreographySpeedWarnings(runtime.plan), [runtime.plan])
  const studioScene = React.useMemo(() => projectXrStudioScene(runtime), [runtime])
  const exercises = React.useMemo(() => evaluateXrStudioExercises(runtime), [runtime])
  const [sceneCategory, setSceneCategory] = React.useState('all')
  const [areaRadiusMeters, setAreaRadiusMeters] = React.useState(2)
  const visibleEntities = sceneCategory === 'all'
    ? studioScene.entities
    : queryXrStudioScene(studioScene, { kind: 'category', category: sceneCategory }).matches
  const selectedSubject = studioScene.entities.find(entity => entity.kind === 'subject' && entity.id === selectedActorId)
  const nearest = selectedSubject
    ? queryXrStudioScene(studioScene, { kind: 'nearest', subjectId: selectedActorId }).matches[0]
    : undefined
  const nearby = selectedSubject
    ? queryXrStudioScene(studioScene, { kind: 'within', center: selectedSubject.position, radiusMeters: areaRadiusMeters })
      .matches.filter(entity => entity.id !== selectedActorId)
    : []
  const track = runtime.plan.cast.find(candidate => candidate.actorId === selectedActorId) || null
  const castMark = track?.marks.find(mark => runtime.selectedMark?.kind === 'cast'
    && runtime.selectedMark.actorId === track.actorId
    && runtime.selectedMark.markId === mark.id) || track?.marks.filter(mark => mark.timeSeconds <= runtime.playheadSeconds).at(-1) || track?.marks[0]
  const cameraMark = runtime.plan.camera.find(mark => runtime.selectedMark?.kind === 'camera'
    && runtime.selectedMark.markId === mark.id) || runtime.plan.camera.filter(mark => mark.timeSeconds <= runtime.playheadSeconds).at(-1) || runtime.plan.camera[0]
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
          <p className={cn('m-0 text-[9px]', UI_THEME_TOKENS.text.tertiary)}>One mark model · Configure selected marks in Timeline</p>
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
          description="Configure easing, gait and position in BottomPanel Timeline. Drag numbered stage marks or use WASD or arrow keys with Shift for 0.05 m precision."
          invocation={projectedCastInvocation}
          metadata={`${track.animation ? `${resolveXrAnimationPreset(track.animation.presetId).label} · ` : 'Authored path · '}${track.marks.length} mark${track.marks.length === 1 ? '' : 's'} · mark ${castMarkIndex + 1} · ${castMark.timeSeconds}s`}
          footer={<PanelSelect aria-label="Cast choreography mark" value={castMark.id} onChange={event => selectXrMotionReferenceCastMark(track.actorId, event.target.value)}>{track.marks.map((mark, index) => <option key={mark.id} value={mark.id}>Mark {index + 1} · {mark.timeSeconds}s</option>)}</PanelSelect>}
        />
      ) : (
        <ChoreographyCard Icon={Footprints} target="cast" title="Cast path" description="Select a cast actor to edit its path choreography." invocation={castInvocation || controlTool} metadata="No cast target selected" footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>Choose a cast target above.</span>} />
      )}
      {cameraMark ? (
        <ChoreographyCard
          Icon={Camera}
          target="camera"
          title="Camera path"
          description="Configure easing and timing in BottomPanel Timeline. Frame in Camera → SHOOT."
          invocation={projectedCameraInvocation}
          metadata={`${runtime.plan.camera.length} mark${runtime.plan.camera.length === 1 ? '' : 's'} · ${cameraMark.rig} · mark ${cameraMarkIndex + 1} · ${cameraMark.timeSeconds}s`}
          footer={<PanelSelect aria-label="Camera choreography mark" value={cameraMark.id} onChange={event => selectXrMotionReferenceCameraMark(event.target.value)}>{runtime.plan.camera.map((mark, index) => <option key={mark.id} value={mark.id}>Mark {index + 1} · {mark.timeSeconds}s</option>)}</PanelSelect>}
        />
      ) : (
        <ChoreographyCard Icon={Camera} target="camera" title="Camera path" description="Add camera marks in Camera → SHOOT; edit them in BottomPanel Timeline." invocation={cameraInvocation || controlTool} metadata="0 marks · Timeline owns time" footer={<span className={cn('text-[10px]', UI_THEME_TOKENS.text.tertiary)}>No camera marks yet.</span>} />
      )}
      <details className={cn('rounded border p-2 text-[11px]', UI_THEME_TOKENS.panel.border)} data-kg-xr-studio="authored-scene">
        <summary className="cursor-pointer font-semibold">Scene and rehearsal exercises</summary>
        <p className={cn('m-0 mt-1', UI_THEME_TOKENS.text.tertiary)}>
          Authored stage · {studioScene.timeSeconds.toFixed(2)} s · revision {studioScene.revision}
        </p>
        <label className="mt-2 grid gap-1">
          Find scene objects
          <PanelSelect aria-label="Find scene objects" value={sceneCategory} onChange={event => setSceneCategory(event.target.value)}>
            <option value="all">All</option>
            <option value="people">People</option>
            <option value="animals">Animals</option>
            <option value="vehicles">Vehicles</option>
            <option value="furniture">Furniture</option>
            <option value="props">Props</option>
            <option value="structure">Stage structures</option>
            <option value="poi">Stage landmarks</option>
          </PanelSelect>
        </label>
        <output aria-live="polite" data-kg-xr-studio-results>
          {studioScene.complete ? `${visibleEntities.length} result${visibleEntities.length === 1 ? '' : 's'}` : 'Scene inventory exceeds the local query limit'}
          {visibleEntities.length > 0 && studioScene.complete ? ` · ${visibleEntities.slice(0, 8).map(entity => entity.label).join(', ')}` : ''}
        </output>
        {selectedSubject && nearest && studioScene.complete ? (
          <p className="m-0">Nearest to {selectedSubject.label}: {nearest.label}</p>
        ) : null}
        {selectedSubject && studioScene.complete ? (
          <section className="grid gap-1">
            <label>Area around {selectedSubject.label}
              <PanelSelect aria-label="Area radius" value={areaRadiusMeters} onChange={event => setAreaRadiusMeters(Number(event.target.value))}>
                <option value={1}>1 m</option><option value={2}>2 m</option><option value={5}>5 m</option>
              </PanelSelect>
            </label>
            <output aria-live="polite" data-kg-xr-studio-area>
              {nearby.length} other authored object{nearby.length === 1 ? '' : 's'} within {areaRadiusMeters} m
            </output>
          </section>
        ) : null}
        <ul className="m-0 mt-2 grid gap-1 pl-4" aria-label="Rehearsal exercises">
          {exercises.exercises.map(item => (
            <li key={item.id} data-kg-xr-studio-exercise={item.id} data-state={item.state}>
              <strong>{item.title}: {item.state}</strong> · {item.feedback}
            </li>
          ))}
        </ul>
      </details>
      {children}
    </section>
  )
}
