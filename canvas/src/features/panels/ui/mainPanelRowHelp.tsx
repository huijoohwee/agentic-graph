import React from 'react'
import Tooltip from './Tooltip'
import { buildRoleActionOutcomeTooltip, buildSettingsValueTooltip } from '@/lib/config-copy/tooltips'

export type MainPanelFieldHelp = {
  role: string
  actions: string[]
  outcome: string
  value: Parameters<typeof buildSettingsValueTooltip>[0]
}

export function buildMainPanelFieldHelp(help: MainPanelFieldHelp) {
  return {
    key: buildRoleActionOutcomeTooltip(help),
    value: buildSettingsValueTooltip(help.value),
  }
}

// Both editable and static rows share hover/focus help; metadata stays with the field owner.
export function MainPanelCellHelp({ content, children, className = '' }: { content: string; children: React.ReactNode; className?: string }) {
  return <Tooltip content={content} maxWidthPx={360} className={`min-w-0 max-w-full ${className}`}>
    <span tabIndex={0} aria-description={content} className="w-full min-w-0 max-w-full">{children}</span>
  </Tooltip>
}

export function renderMainPanelRowHelp(node: React.ReactNode, help: MainPanelFieldHelp | undefined, cell: 'key' | 'value') {
  return help ? <MainPanelCellHelp content={buildMainPanelFieldHelp(help)[cell]} className={cell === 'value' ? 'w-full justify-end' : ''}>{node}</MainPanelCellHelp> : node
}
