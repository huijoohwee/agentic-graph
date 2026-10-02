import { BookmarkPlus, ChevronsLeft, ChevronsRight, Copy, Download, FileAudio, Link2, LocateFixed, Magnet, Maximize2, MonitorPlay, MoreHorizontal, MoveHorizontal, MoveRight, RotateCcw, Scissors, SlidersHorizontal, StepBack, StepForward, Trash2, Unlink2, ZoomIn, ZoomOut } from 'lucide-react'
import type React from 'react'
import { TimelineVideoSequenceToolButton } from '@/components/timeline/VideoSequenceTimelineToolButton'
import { type GanttTimelineTransportChromeModel } from './useGanttTimelineTransportChromeModel'

export type GanttTimelineTransportHeaderToolsProps = {
  model: GanttTimelineTransportChromeModel['headerTools']
}

const PRIMARY_CLIP_EDIT_ACTIONS = new Set([
  'split-at-playhead',
  'split-left-at-playhead',
  'split-right-at-playhead',
  'extract-audio',
  'duplicate-element',
  'delete-element',
  'add-bookmark',
  'toggle-auto-snapping',
  'toggle-ripple-editing',
])

function renderUtilityActionIcon(icon: GanttTimelineTransportChromeModel['headerTools']['actionButtons'][number]['icon']) {
  if (icon === 'audio') return <FileAudio className="h-3.5 w-3.5" role="img" aria-label="File Audio" />
  if (icon === 'retry') return <RotateCcw className="h-3.5 w-3.5" role="img" aria-label="Rotate Ccw" />
  return <Download className="h-3.5 w-3.5" role="img" aria-label="Download" />
}

function renderZoomActionIcon(icon: GanttTimelineTransportChromeModel['headerTools']['zoomControls']['actionButtons'][number]['icon']) {
  if (icon === 'zoom-out') return <ZoomOut className="h-3.5 w-3.5" role="img" aria-label="Zoom Out" />
  if (icon === 'zoom-in') return <ZoomIn className="h-3.5 w-3.5" role="img" aria-label="Zoom In" />
  if (icon === 'fit') return <Maximize2 className="h-3.5 w-3.5" role="img" aria-label="Maximize2" />
  return <LocateFixed className="h-3.5 w-3.5" role="img" aria-label="Locate Fixed" />
}

function renderClipActionIcon(icon: GanttTimelineTransportChromeModel['headerTools']['clipActionButtons'][number]['icon']) {
  if (icon === 'bookmark') return <BookmarkPlus className="h-3.5 w-3.5" role="img" aria-label="Bookmark Plus" />
  if (icon === 'delete') return <Trash2 className="h-3.5 w-3.5" role="img" aria-label="Trash2" />
  if (icon === 'duplicate') return <Copy className="h-3.5 w-3.5" role="img" aria-label="Copy" />
  if (icon === 'extract-audio') return <FileAudio className="h-3.5 w-3.5" role="img" aria-label="File Audio" />
  if (icon === 'ripple') return <MoveRight className="h-3.5 w-3.5" role="img" aria-label="Move Right" />
  if (icon === 'snapping') return <Magnet className="h-3.5 w-3.5" role="img" aria-label="Magnet" />
  if (icon === 'split') return <Scissors className="h-3.5 w-3.5" role="img" aria-label="Scissors" />
  if (icon === 'split-left') return <StepBack className="h-3.5 w-3.5" role="img" aria-label="Step Back" />
  if (icon === 'split-right') return <StepForward className="h-3.5 w-3.5" role="img" aria-label="Step Forward" />
  if (icon === 'nudge-back') return <ChevronsLeft className="h-3.5 w-3.5" role="img" aria-label="Chevrons Left" />
  if (icon === 'nudge-forward') return <ChevronsRight className="h-3.5 w-3.5" role="img" aria-label="Chevrons Right" />
  if (icon === 'trim-start-back' || icon === 'trim-end-back') return <StepBack className="h-3.5 w-3.5" role="img" aria-label="Step Back" />
  if (icon === 'trim-start-forward' || icon === 'trim-end-forward') return <StepForward className="h-3.5 w-3.5" role="img" aria-label="Step Forward" />
  return <MoveHorizontal className="h-3.5 w-3.5" role="img" aria-label="Move Horizontal" />
}

export function GanttTimelineTransportHeaderTools(args: GanttTimelineTransportHeaderToolsProps) {
  const zoomButtonByKey = new Map(args.model.zoomControls.actionButtons.map(button => [button.key, button]))
  const primaryClipActionButtons = args.model.clipActionButtons.filter(button => PRIMARY_CLIP_EDIT_ACTIONS.has(button.action))
  const renderZoomButton = (key: GanttTimelineTransportChromeModel['headerTools']['zoomControls']['actionButtons'][number]['key']) => {
    const button = zoomButtonByKey.get(key)
    if (!button) return null
    return (
      <button
        key={button.key}
        type="button"
        aria-label={button.ariaLabel}
        title={button.title}
        disabled={button.disabled}
        data-kg-timeline-zoom-control={button.key}
        onClick={button.onClick}
      >
        {renderZoomActionIcon(button.icon)}
      </button>
    )
  }
  const renderClipActionButton = (
    button: GanttTimelineTransportChromeModel['headerTools']['clipActionButtons'][number],
    keyPrefix = '',
  ) => (
    <button
      key={`${keyPrefix}${button.key}`}
      type="button"
      aria-label={button.ariaLabel}
      aria-pressed={button.active ?? undefined}
      title={button.title}
      disabled={button.disabled}
      data-kg-video-sequence-clip-edit={button.action}
      data-kg-video-sequence-clip-edit-active={button.active ? '1' : undefined}
      data-kg-video-sequence-primary-clip-edit={keyPrefix === 'primary-' ? button.action : undefined}
      data-kg-video-sequence-tool-active={button.active ? '1' : undefined}
      onClick={button.onClick}
    >
      {renderClipActionIcon(button.icon)}
    </button>
  )
  const renderMediaPlayerButton = (keyPrefix = '') => (
    <button
      key={`${keyPrefix}media-player`}
      type="button"
      aria-label={args.model.mediaPlayerButton.ariaLabel}
      aria-pressed={args.model.mediaPlayerButton.active}
      title={args.model.mediaPlayerButton.title}
      disabled={args.model.mediaPlayerButton.disabled}
      data-kg-video-sequence-tool="media-player"
      data-kg-video-sequence-media-player-toggle="1"
      data-kg-video-sequence-tool-active={args.model.mediaPlayerButton.active ? '1' : undefined}
      onClick={args.model.mediaPlayerButton.onClick}
    >
      <MonitorPlay className="h-3.5 w-3.5" role="img" aria-label="Monitor Play" />
    </button>
  )
  const renderTimingSyncButton = (keyPrefix = '') => (
    <button
      key={`${keyPrefix}timing-sync`}
      type="button"
      aria-label={args.model.syncModeButton.ariaLabel}
      title={args.model.syncModeButton.title}
      disabled={args.model.syncModeButton.disabled}
      data-kg-video-sequence-tool="timing-sync"
      data-kg-video-sequence-timing-sync={args.model.syncModeButton.mode}
      data-kg-video-sequence-tool-active={args.model.syncModeButton.active ? '1' : undefined}
      onClick={args.model.syncModeButton.onClick}
    >
      {args.model.syncModeButton.mode === 'grouped'
        ? <Link2 className="h-3.5 w-3.5" role="img" aria-label="Link2" />
        : <Unlink2 className="h-3.5 w-3.5" role="img" aria-label="Unlink2" />}
    </button>
  )

  return (
    <section className="timeline-transport-header-tools" aria-label="Timeline tools">
      {!args.model.runtimeOnly ? <nav className="timeline-video-sequence-tool-strip" aria-label="Video sequence editing tools">
        {renderMediaPlayerButton()}
        {renderTimingSyncButton()}
        <details className="timeline-tool-menu timeline-tool-menu--edit">
          <summary aria-label="Video sequence edit tools" title="Video sequence edit tools">
            <SlidersHorizontal className="h-3.5 w-3.5" role="img" aria-label="Sliders Horizontal" />
          </summary>
          <nav className="timeline-tool-menu-panel" aria-label="Video sequence edit tools">
            {args.model.toolButtons.map(tool => (
              <TimelineVideoSequenceToolButton
                key={tool.id}
                id={tool.id}
                label={tool.label}
                title={tool.title}
                active={tool.active}
                disabled={tool.disabled}
                onClick={tool.onClick}
              />
            ))}
          </nav>
        </details>
        <section className="timeline-video-sequence-primary-clip-actions" aria-label="Primary clip edit tools">
          {primaryClipActionButtons.map(button => renderClipActionButton(button, 'primary-'))}
        </section>
        <details className="timeline-tool-menu timeline-tool-menu--clip">
          <summary aria-label="Clip nudge and trim tools" title="Clip nudge and trim tools">
            <MoveHorizontal className="h-3.5 w-3.5" role="img" aria-label="Move Horizontal" />
          </summary>
          <nav className="timeline-tool-menu-panel" aria-label="Clip nudge and trim tools">
            {args.model.clipActionButtons.map(button => renderClipActionButton(button))}
          </nav>
        </details>
      </nav> : null}
      <nav
        className="timeline-transport-zoom-controls"
        aria-label="Timeline zoom controls"
        style={{ '--kg-timeline-zoom-progress': `${args.model.zoomControls.percent}%` } as React.CSSProperties}
      >
        {renderZoomButton('zoom-out')}
        <output className="timeline-transport-zoom-label" aria-label={`Timeline zoom ${args.model.zoomControls.label}`}>
          {args.model.zoomControls.label}
        </output>
        {renderZoomButton('zoom-in')}
        <details className="timeline-tool-menu timeline-tool-menu--zoom">
          <summary aria-label="Timeline fit and center tools" title="Timeline fit and center tools">
            <Maximize2 className="h-3.5 w-3.5" role="img" aria-label="Maximize2" />
          </summary>
          <nav className="timeline-tool-menu-panel" aria-label="Timeline fit and center tools">
            {renderZoomButton('fit')}
            {renderZoomButton('center')}
          </nav>
        </details>
      </nav>
      {!args.model.runtimeOnly ? <details className="timeline-tool-menu timeline-tool-menu--utilities">
        <summary aria-label="Timeline utility tools" title="Timeline utility tools">
          <MoreHorizontal className="h-3.5 w-3.5" role="img" aria-label="More Horizontal" />
        </summary>
        <nav className="timeline-transport-chrome-actions timeline-tool-menu-panel" aria-label="Gantt timeline tools">
          <section className="timeline-overflow-action-group timeline-overflow-action-group--transport" aria-label="Collapsed transport tools">
            {renderMediaPlayerButton('overflow-')}
            {renderTimingSyncButton('overflow-')}
          </section>
          <section className="timeline-overflow-action-group timeline-overflow-action-group--edit" aria-label="Collapsed edit tools">
            {args.model.toolButtons.map(tool => (
              <TimelineVideoSequenceToolButton
                key={`overflow-tool-${tool.id}`}
                id={tool.id}
                label={tool.label}
                title={tool.title}
                active={tool.active}
                disabled={tool.disabled}
                onClick={tool.onClick}
              />
            ))}
          </section>
          <section className="timeline-overflow-action-group timeline-overflow-action-group--clip-primary" aria-label="Collapsed primary clip tools">
            {primaryClipActionButtons.map(button => renderClipActionButton(button, 'overflow-primary-'))}
          </section>
          <section className="timeline-overflow-action-group timeline-overflow-action-group--clip" aria-label="Collapsed clip tools">
            {args.model.clipActionButtons.map(button => renderClipActionButton(button, 'overflow-'))}
          </section>
          <section className="timeline-overflow-action-group timeline-overflow-action-group--zoom" aria-label="Collapsed zoom tools">
            {args.model.zoomControls.actionButtons.map(button => renderZoomButton(button.key))}
          </section>
          {args.model.actionButtons.map(button => (
            <button
              key={button.key}
              type="button"
              aria-label={button.ariaLabel}
              title={button.title}
              disabled={button.disabled}
              data-kg-video-sequence-export={button.dataValue}
              onClick={button.onClick}
            >
              {renderUtilityActionIcon(button.icon)}
            </button>
          ))}
        </nav>
      </details> : null}
    </section>
  )
}
