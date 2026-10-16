import type { MermaidGanttTimelineTick } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { resolveVideoSequenceRulerInsetLeft } from './videoSequenceTimelineRulerGeometry'

export type VideoSequenceTimelineRulerTicksProps = {
  displayTicks: readonly MermaidGanttTimelineTick[]
  onSeek?: (minutes: number) => void
}

function formatVideoSequenceTimeAxisLabel(label: string): string {
  const match = String(label || '').trim().match(/^(\d+):(\d{2})$/)
  if (!match) return label
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function resolveVideoSequenceTickDateTime(tick: MermaidGanttTimelineTick): string {
  const match = String(tick.label || '').trim().match(/^(\d+):(\d{2})$/)
  if (match) return `PT${Math.max(0, Number(match[1]) * 60 + Number(match[2]))}S`
  return `PT${Math.max(0, Math.round(tick.minutes * 60))}S`
}

function resolveVideoSequenceTickMajor(tick: MermaidGanttTimelineTick): boolean {
  const match = String(tick.label || '').trim().match(/^(\d+):(\d{2})$/)
  if (/^\d+f$/i.test(String(tick.label || '').trim())) return true
  if (!match) return tick.percent <= 0 || tick.percent >= 100
  return true
}

export function VideoSequenceTimelineRulerTicks({ displayTicks, onSeek }: VideoSequenceTimelineRulerTicksProps) {
  return (
    <>
      {displayTicks.map(tick => (
        <button
          type="button"
          aria-label={`Seek to ${formatVideoSequenceTimeAxisLabel(tick.label)}`}
          disabled={!onSeek}
          onClick={() => onSeek?.(tick.minutes)}
          key={`${tick.minutes}:${tick.label}`}
          className="timeline-transport-ruler-tick"
          style={{ left: resolveVideoSequenceRulerInsetLeft(tick.percent) }}
          data-kg-gantt-timeline-tick="1"
          data-kg-video-sequence-major-tick={resolveVideoSequenceTickMajor(tick) ? '1' : undefined}
        >
          <time className="timeline-transport-ruler-tick-label" dateTime={resolveVideoSequenceTickDateTime(tick)}>
            {formatVideoSequenceTimeAxisLabel(tick.label)}
          </time>
        </button>
      ))}
    </>
  )
}
