import React from 'react'
import type { TimelineMediaReaderThumbnail } from './timelineMediaReader'
import type { MermaidGanttTimelineTaskSpan } from '@/lib/mermaid/mermaidGanttBarInteraction'

export function VideoSequenceSourceAnnotationLayer({ samples, onSelect, selectedTimeSeconds }: {
  samples: readonly { timestampSeconds: number; url: string }[]
  onSelect: (sample: { timestampSeconds: number; url: string }) => void
  selectedTimeSeconds?: number
}) {
  return (
    <details className="timeline-video-sequence-source-annotations" data-kg-source-annotation-layer="1">
      <summary>Annotations ({samples.length})</summary>
      <ol aria-label="Source frame annotations">
        {samples.map(sample => (
          <li key={`${sample.timestampSeconds}:${sample.url}`}>
            <button type="button" aria-label={`Inspect source frame at ${sample.timestampSeconds.toFixed(3)} seconds`}
              aria-pressed={selectedTimeSeconds === sample.timestampSeconds}
              data-kg-source-annotation-time={sample.timestampSeconds}
              data-kg-source-annotation-url={sample.url}
              onClick={() => onSelect(sample)}>
              <time dateTime={`PT${sample.timestampSeconds.toFixed(3)}S`}>
                {sample.timestampSeconds.toFixed(3)}s
              </time>
            </button>
          </li>
        ))}
      </ol>
    </details>
  )
}

export function VideoSequenceFrameSampleRail({
  samples,
  span,
}: {
  samples: readonly TimelineMediaReaderThumbnail[]
  span: MermaidGanttTimelineTaskSpan
}) {
  if (!samples.length) return null
  return (
    <ol
      className="timeline-video-sequence-frame-sample-rail"
      aria-label={`${span.label} semantic frame samples`}
      data-kg-video-sequence-frame-sample-rail="semantic"
      data-kg-video-sequence-frame-sample-count={samples.length}
      style={{ '--kg-video-sequence-frame-sample-count': samples.length } as React.CSSProperties}
    >
      {samples.map((sample, index) => (
        <li
          key={`frame-sample:${span.rowKey}:${sample.timestampSeconds}:${index}`}
          className="timeline-video-sequence-frame-sample"
          data-kg-video-sequence-frame-sample="1"
          data-kg-video-sequence-frame-sample-format={sample.format}
          data-kg-video-sequence-frame-sample-raster-format={sample.rasterFormat}
          data-kg-video-sequence-frame-sample-time={sample.timestampSeconds}
          data-kg-video-sequence-frame-sample-url={sample.dataUrl}
          style={{ '--kg-video-sequence-frame-sample-index': index } as React.CSSProperties}
        >
          <time dateTime={`PT${sample.timestampSeconds.toFixed(3)}S`}>
            {sample.timestampSeconds.toFixed(3)}s
          </time>
        </li>
      ))}
    </ol>
  )
}
