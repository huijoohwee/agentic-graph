import React from 'react'
import { X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { closeAgentRunInspection, useAgentRunWorkspace } from './agentRunInspectionStore'

export function AgentRunCloseButton({ iconSizeClass, iconStrokeWidth }: { iconSizeClass: string; iconStrokeWidth: number }) {
  const workspace = useAgentRunWorkspace()
  return workspace ? <IconButton className="App-toolbar__btn" title="Close run inspection" onClick={closeAgentRunInspection} showTooltip>
    <X className={iconSizeClass} strokeWidth={iconStrokeWidth} aria-hidden="true" />
  </IconButton> : null
}
