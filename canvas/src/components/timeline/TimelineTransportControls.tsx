import React from 'react'
import { Pause, Play, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  TIMELINE_TRANSPORT_PLAYBACK_RATES,
  resolveTimelineTransportPlaybackRate,
  type TimelineTransportPlaybackRate,
} from './timelineTransport'
import './TimelineTransportControls.css'
import './TimelineTransportControlsMermaidGantt.css'

export type TimelineTransportControlsProps = {
  ariaLabel: string
  contextControls?: React.ReactNode
  currentLabel: string
  disabled?: boolean
  contextLabel?: React.ReactNode
  contextDetailsLabel?: string
  max: number
  min?: number
  playbackRate: TimelineTransportPlaybackRate
  playbackRates?: readonly TimelineTransportPlaybackRate[]
  playing: boolean
  rangeClassName?: string
  shellClassName?: string
  showInlineProgress?: boolean
  showRange?: boolean
  step: number
  totalLabel?: string
  toolbarControls?: React.ReactNode
  value: number
  onPlaybackRateChange: (rate: TimelineTransportPlaybackRate) => void
  onTogglePlayback: () => void
  onValueChange: (value: number) => void
}

export type TimelineTransportChromeProps = TimelineTransportControlsProps & {
  chromeClassName?: string
  headerAside?: React.ReactNode
  mediaPlayer?: React.ReactNode
  rootProps?: Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'>
  ruler?: React.ReactNode
  rulerClassName?: string
  rulerProps?: Omit<React.HTMLAttributes<HTMLElement>, 'children' | 'className'>
  supplementalLanes?: React.ReactNode
  subtitleLabel?: React.ReactNode
  titleLabel?: React.ReactNode
}

export type TimelineTransportInlineClipProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  children: React.ReactNode
  label: string
  laneStyle: 'video' | 'audio'
}

export type TimelineTransportTimeAxisClipProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  children: React.ReactNode
  laneStyle: 'video' | 'audio'
}

export type TimelineTransportTimeAxisMarkProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  children: React.ReactNode
  laneStyle: 'video' | 'audio'
}

export type TimelineTransportMiniAction = {
  ariaLabel: string
  dataAttributes?: Record<`data-${string}`, string | number | boolean | undefined>
  disabled?: boolean
  icon: LucideIcon
  id: string
  title?: string
  onClick: React.MouseEventHandler<HTMLButtonElement>
}

export type TimelineTransportMiniActionBarProps = Omit<React.HTMLAttributes<HTMLElement>, 'children'> & {
  actions: readonly TimelineTransportMiniAction[]
}

export function TimelineTransportInlineClip({
  children,
  className,
  label,
  laneStyle,
  ...rootProps
}: TimelineTransportInlineClipProps) {
  return (
    <article
      {...rootProps}
      className={cn(
        'timeline-transport-track-clip',
        `timeline-transport-track-clip--lane-${laneStyle}`,
        'timeline-transport-inline-clip',
        className,
      )}
      aria-label={rootProps['aria-label'] || `${label} timeline control bar`}
      data-kg-timeline-clip-compact="1"
      data-kg-timeline-inline-clip={laneStyle}
    >
      <span className="timeline-transport-track-clip-label timeline-transport-inline-clip-label">{label}</span>
      <section className="timeline-transport-inline-clip-content">{children}</section>
    </article>
  )
}

export function TimelineTransportTimeAxisClip({
  children,
  className,
  laneStyle,
  ...rootProps
}: TimelineTransportTimeAxisClipProps) {
  return (
    <article
      {...rootProps}
      className={cn(
        'timeline-transport-track-clip',
        `timeline-transport-track-clip--lane-${laneStyle}`,
        'timeline-transport-inline-clip',
        'timeline-transport-time-axis-clip',
        className,
      )}
      aria-label={rootProps['aria-label'] || 'Timeline time-axis control lane'}
      data-kg-timeline-clip-compact="1"
      data-kg-timeline-time-axis-clip={laneStyle}
    >
      <section className="timeline-transport-inline-clip-content timeline-transport-time-axis-clip-content">
        {children}
      </section>
    </article>
  )
}

export function TimelineTransportTimeAxisMark({
  children,
  className,
  laneStyle,
  ...rootProps
}: TimelineTransportTimeAxisMarkProps) {
  return (
    <article
      {...rootProps}
      className={cn(
        'timeline-transport-track-clip',
        `timeline-transport-track-clip--lane-${laneStyle}`,
        'timeline-transport-time-axis-mark',
        className,
      )}
      data-kg-timeline-clip-compact="1"
      data-kg-timeline-time-axis-mark={laneStyle}
    >
      {children}
    </article>
  )
}

export function TimelineTransportMiniActionBar({
  actions,
  className,
  ...rootProps
}: TimelineTransportMiniActionBarProps) {
  return (
    <section
      {...rootProps}
      className={cn('timeline-transport-mini-action-bar', className)}
      data-kg-timeline-mini-action-bar="1"
    >
      {actions.map(action => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            {...action.dataAttributes}
            type="button"
            className="App-toolbar__btn timeline-transport-mini-action"
            disabled={action.disabled}
            aria-label={action.ariaLabel}
            title={action.title || action.ariaLabel}
            onClick={action.onClick}
            data-kg-timeline-mini-action={action.id}
          >
            <Icon className="size-3" aria-hidden />
          </button>
        )
      })}
    </section>
  )
}

export function TimelineTransportControls(props: TimelineTransportControlsProps) {
  const {
    ariaLabel,
    currentLabel,
    disabled = false,
    max,
    min = 0,
    playbackRate,
    playbackRates = TIMELINE_TRANSPORT_PLAYBACK_RATES,
    playing,
    rangeClassName,
    shellClassName,
    showInlineProgress = true,
    showRange = true,
    step,
    totalLabel,
    toolbarControls,
    value,
    onPlaybackRateChange,
    onTogglePlayback,
    onValueChange,
  } = props
  const progressPercent = React.useMemo(() => {
    const span = Math.max(0, max - min)
    if (span <= 0) return 0
    const clampedValue = Math.min(max, Math.max(min, value))
    return ((clampedValue - min) / span) * 100
  }, [max, min, value])
  const nextPlaybackRate = React.useMemo(() => {
    const currentIndex = playbackRates.findIndex(rate => rate === playbackRate)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % playbackRates.length : 0
    return playbackRates[nextIndex] || playbackRate
  }, [playbackRate, playbackRates])
  return (
    <section
      className={cn('timeline-transport-shell', shellClassName)}
      data-kg-timeline-transport="shared"
      style={{ '--kg-timeline-progress': `${progressPercent}%` } as React.CSSProperties}
    >
      <section className="timeline-player">
        <button
          type="button"
          className="play-control"
          aria-label={playing ? 'Pause playback' : 'Start playback'}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
          disabled={disabled}
          onClick={onTogglePlayback}
        >
          {playing ? <Pause className="h-4 w-4" strokeWidth={2} aria-hidden={true} /> : <Play className="h-4 w-4" strokeWidth={2} aria-hidden={true} />}
        </button>
        <section className="time timeline-timecode" aria-live="polite">
          <time className="timeline-timecode-current">{currentLabel}</time>
          {totalLabel ? (
            <>
              <span className="timeline-timecode-divider" aria-hidden="true">
                /
              </span>
              <time className="timeline-timecode-total">{totalLabel}</time>
            </>
          ) : null}
        </section>
        {!showRange && showInlineProgress ? (
          <progress
            aria-label="Timeline playback progress"
            className="timeline-player-progress"
            data-kg-timeline-player-progress="inline"
            max={100}
            value={progressPercent}
          />
        ) : null}
        <section className="rate-control">
          <button
            type="button"
            className="timeline-rate-button"
            aria-label={`Playback rate ${playbackRate.toFixed(1)}x. Click for ${nextPlaybackRate.toFixed(1)}x.`}
            title={`Playback rate ${playbackRate.toFixed(1)}x. Click for ${nextPlaybackRate.toFixed(1)}x.`}
            disabled={disabled || playbackRates.length <= 1}
            onClick={() => {
              onPlaybackRateChange(resolveTimelineTransportPlaybackRate(String(nextPlaybackRate), playbackRate))
            }}
          >
            <span className="timeline-rate-button-value">
              {playbackRate.toFixed(1)}x
            </span>
          </button>
        </section>
        {toolbarControls ? (
          <section className="timeline-player-toolbar" aria-label="Timeline tools">
            {toolbarControls}
          </section>
        ) : null}
      </section>
      {showRange ? (
        <section className={cn('timeline-player-range', rangeClassName)}>
          <section className="timeline-player-range-rail" aria-hidden="true"></section>
          <input
            aria-label={ariaLabel}
            className="timeline-player-range-input"
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={event => onValueChange(Number(event.target.value || 0))}
          />
        </section>
      ) : null}
    </section>
  )
}

export function TimelineTransportChrome(props: TimelineTransportChromeProps) {
  const {
    chromeClassName,
    contextControls,
    contextDetailsLabel,
    contextLabel,
    headerAside,
    mediaPlayer,
    rootProps,
    ruler,
    rulerClassName,
    rulerProps,
    supplementalLanes,
    subtitleLabel,
    titleLabel,
    ...transportProps
  } = props
  const rootClassName = cn('timeline-transport-chrome', chromeClassName)
  const rulerRootClassName = cn('timeline-transport-ruler', rulerClassName)
  const inlineHeaderAside = !titleLabel && !subtitleLabel ? headerAside : null
  const headerAsideContent = inlineHeaderAside ? null : headerAside
  const statusDetails = contextDetailsLabel || contextLabel
  return (
    <section
      {...rootProps}
      className={rootClassName}
      data-kg-timeline-transport-chrome="shared"
    >
      {titleLabel || subtitleLabel || headerAsideContent ? (
        <header className="timeline-transport-chrome-header">
          {titleLabel || subtitleLabel ? (
            <section className="timeline-transport-chrome-title-block">
              {titleLabel ? <section className="timeline-transport-chrome-title">{titleLabel}</section> : null}
              {subtitleLabel ? <section className="timeline-transport-chrome-subtitle">{subtitleLabel}</section> : null}
            </section>
          ) : null}
          {headerAsideContent ? <section className="timeline-transport-chrome-header-aside">{headerAsideContent}</section> : null}
        </header>
      ) : null}
      <TimelineTransportControls {...transportProps} toolbarControls={inlineHeaderAside} />
      {supplementalLanes ? (
        <section className="timeline-transport-supplemental-lanes" aria-label="Timeline supplemental lanes">
          {supplementalLanes}
        </section>
      ) : null}
      {mediaPlayer ? (
        <section className="timeline-transport-media-player-slot" aria-label="Timeline media player slot">
          {mediaPlayer}
        </section>
      ) : null}
      {ruler ? (
        <section className="timeline-transport-ruler-layout" data-kg-timeline-transport-ruler-layout="shared">
          <section
            {...rulerProps}
            className={rulerRootClassName}
          >
            {ruler}
          </section>
        </section>
      ) : null}
      {statusDetails || contextControls ? (
        <section className="timeline-player-context timeline-transport-status-bar" aria-label="Timeline contextual controls">
          {statusDetails ? (
            <section className="timeline-transport-status-details" aria-label="Timeline context summary">
              {statusDetails}
            </section>
          ) : null}
          {contextControls ? (
            <section className="timeline-transport-status-actions" aria-label="Timeline contextual actions">
              {contextControls}
            </section>
          ) : null}
        </section>
      ) : null}
    </section>
  )
}
