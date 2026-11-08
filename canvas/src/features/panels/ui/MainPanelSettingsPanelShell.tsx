import React from 'react'
import { SettingsPanelShell } from '@agentic-base/views-react/settings'
import { panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

/** Contract adapter: frame, header and field insets belong to Base/Design System. */
export function MainPanelSettingsPanelShell(props: {
  ariaLabel: string
  titleNode: React.ReactNode
  secondaryNode?: React.ReactNode
  secondaryNodeClassName?: string
  uiPanelKeyValueTextSizeClass: string
  children: React.ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
}) {
  return <SettingsPanelShell ariaLabel={props.ariaLabel} title={props.titleNode}
    summary={props.secondaryNode == null ? undefined : <span className={panelFieldDecorationClassName(props.secondaryNodeClassName)}>{props.secondaryNode}</span>}
    className={panelFieldDecorationClassName(props.className)}
    headerClassName={panelFieldDecorationClassName(props.headerClassName)}
    bodyClassName={[UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME, props.bodyClassName].filter(Boolean).join(' ')}>
    {props.children}
  </SettingsPanelShell>
}
