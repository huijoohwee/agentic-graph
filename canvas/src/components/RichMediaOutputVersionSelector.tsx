import { RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID } from '@/lib/render/richMediaOutputVersions'
import type { RichMediaPanelProps } from './RichMediaPanel.types'

export function RichMediaOutputVersionSelector(props: {
  panel: RichMediaPanelProps['panel']
  onPanelChange: RichMediaPanelProps['onPanelChange']
  placement: 'body' | 'header' | 'toolbar'
}) {
  const { panel, onPanelChange, placement } = props
  const outputVersions = panel?.outputVersions || []
  if (outputVersions.length <= 1) return null

  const selectedOutputVersionId = panel?.selectedOutputVersionId || outputVersions.at(-1)?.id || ''
  const inHeader = placement === 'header'
  const inToolbar = placement === 'toolbar'

  return (
    <label
      className={inHeader || inToolbar
        ? 'flex min-w-0 shrink-0 items-center gap-1 text-[10px]'
        : 'flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1 text-[11px]'}
      data-kg-rich-media-output-version-control="1"
      data-kg-rich-media-output-version-placement={placement}
      style={{
        ...(inHeader ? {} : { borderColor: 'var(--kg-border)' }),
        color: 'var(--kg-muted-foreground)',
      }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <span className={inHeader || inToolbar ? 'sr-only' : undefined}>Output version</span>
      <select
        aria-label="Output version"
        title="Select generated output version"
        value={selectedOutputVersionId}
        className={inHeader || inToolbar
          ? 'max-w-24 rounded border bg-transparent px-1 py-0 text-[10px] leading-4'
          : 'max-w-40 rounded border bg-transparent px-1 py-0.5 text-[11px]'}
        style={{ borderColor: 'var(--kg-border)', color: 'var(--kg-foreground)' }}
        onChange={event => onPanelChange?.({
          activeTab: 'text',
          freezeConnectedOutput: panel?.freezeConnectedOutput === true,
          selectedOutputVersionId: event.currentTarget.value,
        })}
      >
        {selectedOutputVersionId === RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID ? (
          <option value={RICH_MEDIA_OUTPUT_DRAFT_VERSION_ID}>Edited draft</option>
        ) : null}
        {[...outputVersions].reverse().map((version, reverseIndex) => {
          const versionNumber = outputVersions.length - reverseIndex
          return (
            <option key={version.id} value={version.id}>
              {`Version ${versionNumber}${reverseIndex === 0 ? ' (latest)' : ''}`}
            </option>
          )
        })}
      </select>
    </label>
  )
}
