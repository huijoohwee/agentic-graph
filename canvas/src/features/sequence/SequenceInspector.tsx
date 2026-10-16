import { useSequenceDocument } from './useSequenceDocument'
import { SequenceBranches } from './SequenceTimeline'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { sequenceParticipantLabel } from './sequencePresentation'
import { LearningOfflineControls } from '@/features/python-learning/LearningOfflineControls'
import { SequenceInspectorView } from './SequenceInspectorView'
import './SequenceFlow.css'

export function SequenceInspector() {
  const { model, current, events, selectEvent } = useSequenceDocument()
  const typography = usePanelTypography()
  return <SequenceInspectorView title="Sequence Diagram" textClassName={typography.panelTextClass}
    summary={`Authored rehearsal · ${model.participants.length} participants · ${model.events.length} events · ${events.length} playback steps`}
    status={current ? `Selected step ${current.ordinal}: ${current.label}` : 'No playable sequence'}
    selectedId={current?.id} onSelect={selectEvent}
    items={model.events.map(event => ({
      id: event.id, ordinal: event.ordinal, label: event.label,
      detail: `${sequenceParticipantLabel(model, event.from)} → ${sequenceParticipantLabel(model, event.to)} · ${event.kind}${event.protocol ? ` · ${event.protocol}` : ''}`,
      meta: `Source line ${event.line}${event.branches.length ? ` · ${event.branches.map(id => model.branches.find(branch => branch.id === id)!.label).join(' / ')}` : ''}`,
    }))}
    beforeItems={<><SequenceBranches />{model.diagnostics.map((diagnostic, index) => <p key={index} role="alert">Line {diagnostic.line}: {diagnostic.message}</p>)}</>}
    footer={<LearningOfflineControls purpose="workspace" />} />
}
