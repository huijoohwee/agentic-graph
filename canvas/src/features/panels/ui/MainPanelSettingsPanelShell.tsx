import React from 'react'
import { SettingsPanelShell } from '@agentic-base/views-react/settings'

/** Map Graph's field settings labels to the shared settings tab. */
export function MainPanelSettingsPanelShell({ ariaLabel, titleNode, secondaryNode, children }: {
  ariaLabel: string
  titleNode: React.ReactNode
  secondaryNode?: React.ReactNode
  children: React.ReactNode
}) {
  return <SettingsPanelShell ariaLabel={ariaLabel} title={titleNode} summary={secondaryNode}>
    {children}
  </SettingsPanelShell>
}
