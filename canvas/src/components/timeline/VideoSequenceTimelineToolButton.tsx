import { Blend, Film, Filter, Gauge, GitCompareArrows, KeyRound, Layers, Palette, Scissors, SlidersHorizontal, Sparkles, SplitSquareVertical, Type, type LucideIcon } from 'lucide-react'
import type { VideoSequenceTimelineToolId } from './videoSequenceTimeline'

const VIDEO_SEQUENCE_TOOL_ICONS: Record<VideoSequenceTimelineToolId, LucideIcon> = {
  adjustment: Blend,
  cut: Scissors,
  detached: Layers,
  effect: Sparkles,
  fbf: Film,
  filter: Filter,
  grade: Palette,
  keyframe: KeyRound,
  mask: Layers,
  modifier: Sparkles,
  morph: GitCompareArrows,
  nested: GitCompareArrows,
  record: Gauge,
  speed: Gauge,
  splice: SplitSquareVertical,
  text: Type,
  transition: SlidersHorizontal,
}

export function TimelineVideoSequenceToolButton({
  active,
  disabled,
  id,
  title,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  id: VideoSequenceTimelineToolId
  label: string
  title: string
  onClick: () => void
}) {
  const Icon = VIDEO_SEQUENCE_TOOL_ICONS[id]
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      disabled={disabled}
      data-kg-video-sequence-tool={id}
      data-kg-video-sequence-tool-active={active ? '1' : undefined}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} role="img" aria-label={title} />
    </button>
  )
}
