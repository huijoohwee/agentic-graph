import React from 'react'
import { PanelLabeledRangeField, type PanelLabeledRangeFieldProps } from './PanelLabeledRangeField'

// Preserve callers' props while retiring the separate card typography/layout.
export function PanelLabeledRangeCard({ headerClassName, ...props }: PanelLabeledRangeFieldProps & { headerClassName?: string }) {
  return <PanelLabeledRangeField {...props} labelClassName={headerClassName} />
}
