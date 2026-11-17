import React from 'react'
import { SettingsSectionHeader, type SettingsSectionHeaderProps } from 'agentic-design-system/react/panels'
import { panelFieldDecorationClassName } from 'grph-shared/ui/keyTypeValueRows'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

/** Graph supplies theme and content; Design System renders the centrally sized header. */
export default function MainPanelSectionHeader(props: SettingsSectionHeaderProps) {
  return <SettingsSectionHeader {...props}
    className={[UI_THEME_TOKENS.panel.bg, panelFieldDecorationClassName(props.className)].join(' ')}
    titleClassName={panelFieldDecorationClassName(props.titleClassName)}
    actionsClassName={panelFieldDecorationClassName(props.actionsClassName)} />
}
