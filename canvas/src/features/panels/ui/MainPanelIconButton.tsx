import React from 'react'
import IconButton from '@/components/IconButton'
import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui/icons'
import { MainPanelTypeIcon, type MainPanelTypeIconKey } from './mainPanelHelpIconLibrary'

export function MainPanelIconButton({ iconKey, label, ariaLabel, ...props }: Omit<React.ComponentProps<typeof IconButton>, 'title' | 'children'> & { iconKey: MainPanelTypeIconKey; label: string }) {
  const scale = useGraphStore(s => s.uiIconScale)
  const strokeWidth = useGraphStore(s => s.uiIconStrokeWidth)
  return <IconButton {...props} title={label} ariaLabel={ariaLabel || label} showTooltip>
    <MainPanelTypeIcon iconKey={iconKey} className={getIconSizeClass(scale)} strokeWidth={strokeWidth} />
    <span className="sr-only">{label}</span>
  </IconButton>
}
