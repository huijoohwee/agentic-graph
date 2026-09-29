import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui/icons'
import { CanvasEditableKeyTypeValueRow } from './CanvasEditableKeyTypeValueRow'
import { RightAlignedValueCell } from './canvasKeyTypeValueValueCell'
import { MainPanelTypeIcon, resolveMainPanelKtvTypeIconKey, type MainPanelTypeIconKey } from './mainPanelHelpIconLibrary'
import type { MainPanelFieldHelp } from './mainPanelRowHelp'

export function MainPanelField({ label, type = 'string', iconKey, help, children }: { label: string; type?: string; iconKey?: MainPanelTypeIconKey; help: MainPanelFieldHelp; children: React.ReactNode }) {
  const scale = useGraphStore(s => s.uiIconScale)
  const strokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  return <CanvasEditableKeyTypeValueRow
    keyNode={label} help={help}
    typeNode={<MainPanelTypeIcon iconKey={iconKey || resolveMainPanelKtvTypeIconKey(type)} className={getIconSizeClass(scale)} strokeWidth={strokeWidth} />}
    valueNode={<RightAlignedValueCell>{children}</RightAlignedValueCell>}
  />
}

export function observedFieldHelp(role: string, label: string, outcome: string): MainPanelFieldHelp {
  return { role, actions: [`inspect ${label}`], outcome, value: { key: label, type: 'string', defaultValue: 'N/A (observed)', impact: 'Read-only observation; unavailable values remain unknown.' } }
}
