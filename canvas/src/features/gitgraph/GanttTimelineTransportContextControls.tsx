import { RotateCcw } from 'lucide-react'
import { type GanttTimelineTransportChromeModel } from './useGanttTimelineTransportChromeModel'
import './GanttTimelineTransportClipContext.css'

export type GanttTimelineTransportContextControlsProps = {
  model: GanttTimelineTransportChromeModel['contextControls']
}

export function GanttTimelineTransportContextControls(args: GanttTimelineTransportContextControlsProps) {
  const selectedSpan = args.model.clipEdit.selectedSpan
  if (!selectedSpan && !args.model.exportSessions.items.length) return null

  const selectedSpanLabel = selectedSpan ? args.model.clipEdit.detailsLabel : args.model.exportSessions.emptyLabel
  const selectedSpanDuration = selectedSpan
    ? `${selectedSpan.startMinutes.toFixed(2)}-${selectedSpan.endMinutes.toFixed(2)}m`
    : 'No clip selected'

  return (
    <section className="timeline-transport-context-stack" aria-label="Video sequence timeline context">
      <article
        className="timeline-transport-clip-context"
        aria-label="Selected video sequence clip"
        title={selectedSpanLabel}
        data-kg-video-sequence-clip-context={selectedSpan ? 'selected' : 'empty'}
      >
        <span className="timeline-transport-clip-context-title">{selectedSpan?.label || 'Clip context'}</span>
        <span className="timeline-transport-clip-context-detail">{selectedSpanLabel}</span>
        <time className="timeline-transport-clip-context-time" dateTime={`PT${Math.max(0, Math.round(selectedSpan?.durationMinutes || 0))}M`}>
          {selectedSpanDuration}
        </time>
      </article>
      {args.model.exportSessions.items.length ? (
        <section className="timeline-transport-export-sessions" aria-label="Recent edited media exports">
          {args.model.exportSessions.items.map(session => (
            <article
              key={session.runId}
              className="timeline-transport-export-session"
              data-kg-video-sequence-export-session-mode={session.styleMode}
              data-kg-video-sequence-export-session={session.status}
              data-kg-video-sequence-export-session-tone={session.styleTone}
            >
              <span className="timeline-transport-export-session-detail">{session.detailLabel}</span>
              <span className="timeline-transport-export-session-message">{session.message}</span>
              <button
                type="button"
                aria-label={session.retryButtonLabel}
                title={session.retryButtonTitle}
                disabled={!session.retryable}
                data-kg-video-sequence-export-session-retry={session.retryState}
                onClick={session.onRetry}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden={true} />
              </button>
            </article>
          ))}
        </section>
      ) : null}
    </section>
  )
}
