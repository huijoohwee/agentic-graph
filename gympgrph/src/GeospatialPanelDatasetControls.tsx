import React from 'react'
import type { PanelTypography } from 'grph-shared/ui/panelTypography'
import {
  GeoPanelKtvRow,
  GeoPanelSection,
  GeoPanelValueCell,
} from './geospatialPanelUi.js'

export type GeospatialPanelDatasetControlsProps = {
  disabled: boolean
  enhancedLayerCatalog?: React.ReactNode
  maxBytesMbInput: string
  panelTypography: PanelTypography
  timeoutMsInput: string
  onCommitMaxBytes: () => void
  onCommitTimeoutMs: () => void
  onSetMaxBytesMbInput: (value: string) => void
  onSetTimeoutMsInput: (value: string) => void
}

export function GeospatialPanelDatasetControls(
  props: GeospatialPanelDatasetControlsProps,
): React.ReactElement {
  const compactInputClassName = `${props.panelTypography.keyValueInputClass} min-w-0 max-w-[7rem]`

  return (
    <GeoPanelSection title="Dataset" panelTypography={props.panelTypography}>
      {props.enhancedLayerCatalog}
      <GeoPanelKtvRow
        keyNode="Timeout"
        typeNode="ms"
        panelTypography={props.panelTypography}
        valueNode={(
          <GeoPanelValueCell>
            <input
              className={compactInputClassName}
              aria-label="Timeout (ms)"
              value={props.timeoutMsInput}
              onChange={event => props.onSetTimeoutMsInput(event.target.value)}
              onBlur={props.onCommitTimeoutMs}
              disabled={props.disabled}
            />
          </GeoPanelValueCell>
        )}
      />
      <GeoPanelKtvRow
        keyNode="Max bytes"
        typeNode="MB"
        panelTypography={props.panelTypography}
        valueNode={(
          <GeoPanelValueCell>
            <input
              className={compactInputClassName}
              aria-label="Max bytes (MB)"
              value={props.maxBytesMbInput}
              onChange={event => props.onSetMaxBytesMbInput(event.target.value)}
              onBlur={props.onCommitMaxBytes}
              disabled={props.disabled}
            />
          </GeoPanelValueCell>
        )}
      />
    </GeoPanelSection>
  )
}
