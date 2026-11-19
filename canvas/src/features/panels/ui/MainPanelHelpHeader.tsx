import React from 'react'
import ExpandCollapseAllButton from '@/features/panels/ui/ExpandCollapseAllButton'
import { PanelTabHeader } from 'agentic-design-system/react/panels'
import Tooltip from 'agentic-design-system/react/hover'
import { HELP_TAB_HEADER_TOOLTIP, UI_LABELS } from '@/lib/config'

type MainPanelHelpHeaderProps = {
  allSectionsCollapsed: boolean
  onCollapseAll: () => void
  onExpandAll: () => void
}

export default function MainPanelHelpHeader({
  allSectionsCollapsed,
  onCollapseAll,
  onExpandAll,
}: MainPanelHelpHeaderProps) {
  return (
    <PanelTabHeader
      aria-label={UI_LABELS.help}
      title={(
        <Tooltip
          content={HELP_TAB_HEADER_TOOLTIP}
          maxWidthPx={280}
        >
          <span>{UI_LABELS.help}</span>
        </Tooltip>
      )}
      actions={(
        <ExpandCollapseAllButton
          allCollapsed={allSectionsCollapsed}
          onExpandAll={onExpandAll}
          onCollapseAll={onCollapseAll}
        />
      )}
    />
  )
}
