import { useSequenceDocument } from './useSequenceDocument'
import { SequenceBranches } from './SequenceTimeline'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { sequenceParticipantLabel } from './sequencePresentation'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import './SequenceFlow.css'

export function SequenceInspector() {
  const { model, current, events, selectEvent } = useSequenceDocument()
  const typography = usePanelTypography()
  return <section className={`sequence-flow sequence-inspector ${typography.panelTextClass}`} aria-label="Sequence inspector">
    <h2>Sequence Diagram</h2><p>Authored rehearsal · {model.participants.length} participants · {model.events.length} events · {events.length} playback steps</p>
    <SequenceBranches />
    {model.diagnostics.map((diagnostic, index) => <p key={index} role="alert">Line {diagnostic.line}: {diagnostic.message}</p>)}
    <ol>{model.events.map(event => <li key={event.id}><button aria-pressed={event.id === current?.id} onClick={() => selectEvent(event.id)}><strong>{event.ordinal}. {event.label}</strong><span>{sequenceParticipantLabel(model, event.from)} → {sequenceParticipantLabel(model, event.to)} · {event.kind}{event.protocol ? ` · ${event.protocol}` : ''}</span><small>Source line {event.line}{event.branches.length ? ` · ${event.branches.map(id => model.branches.find(branch => branch.id === id)!.label).join(' / ')}` : ''}</small></button></li>)}</ol>
    <p role="status">{current ? `Selected step ${current.ordinal}: ${current.label}` : 'No playable sequence'}</p>
    <LearningOfflineControls purpose="workspace" />
  </section>
}
