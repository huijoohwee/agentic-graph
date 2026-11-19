import { PanelTabHeader } from 'agentic-design-system/react/panels'
import React from 'react'

import Tooltip from 'agentic-design-system/react/hover'
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect'
import { parseIntegrationConfigsJson } from '@/features/integrations/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { getChatProviderLabel, getChatProviderRegionLabel } from '@/lib/chatEndpoint'
import { getUiSectionActionClassName, getUiSectionChipClassName } from '@/lib/ui/sectionChipChrome'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import {
  UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type StoryboardWidgetManagerTabKey = 'graph' | 'mapping'

export default function MainPanelStoryboardWidgetManagerHeader(props: {
  activeTab: StoryboardWidgetManagerTabKey
  workflowMode?: boolean
  onTabChange?: (tab: StoryboardWidgetManagerTabKey) => void
}) {
  const { workflowMode, activeTab, onTabChange } = props

  const uiPanelMicroLabelTextSizeClass = useGraphStore(
    s => s.uiPanelMicroLabelTextSizeClass || 'text-xs',
  )
  const chatProvider = useGraphStore(s => s.chatProvider)
  const chatEndpointUrl = useGraphStore(s => s.chatEndpointUrl)
  const chatModel = useGraphStore(s => s.chatModel)
  const integrationConfigsJson = useGraphStore(s => s.integrationConfigsJson)
  const aiChatEnabled = React.useMemo(
    () => parseIntegrationConfigsJson(integrationConfigsJson).aiChat.enabled,
    [integrationConfigsJson],
  )
  const chatProviderLabel = React.useMemo(
    () => getChatProviderLabel(chatProvider),
    [chatProvider],
  )
  const chatRegionLabel = React.useMemo(
    () => getChatProviderRegionLabel(chatProvider, chatEndpointUrl),
    [chatEndpointUrl, chatProvider],
  )
  const openChatSettings = React.useCallback(() => {
    emitMainPanelOpen({
      tab: 'settings' as const,
      searchQuery: 'chat',
    })
  }, [])

  const tabLabel = workflowMode
    ? 'Workflow'
    : activeTab === 'mapping'
      ? UI_LABELS.storyboardWidgetMapping
      : UI_LABELS.storyboardWidgetGraph
  const tabOptions = React.useMemo(
    () =>
      [
        { id: 'graph' as const, title: UI_LABELS.storyboardWidgetGraph },
        { id: 'mapping' as const, title: UI_LABELS.storyboardWidgetMapping },
      ] satisfies Array<{ id: StoryboardWidgetManagerTabKey; title: string }>,
    [],
  )

  return (
    <PanelTabHeader aria-label={UI_LABELS.workflowManager} title={(
        <Tooltip
          content={
            workflowMode
              ? 'Process frontmatter workflow sections from graph metadata with view-only toggles and upstream configuration updates.'
              : UI_COPY.storyboardWidgetManagerHeaderTooltip
          }
          maxWidthPx={320}
          contentClassName={UI_THEME_TOKENS.tooltip.bg}
        >
          <span>{UI_LABELS.workflowManager}</span>
        </Tooltip>
      )} actions={<>
        {!workflowMode ? (
          <button
            type="button"
            className={getUiSectionActionClassName('secondary', uiPanelMicroLabelTextSizeClass)}
            onClick={openChatSettings}
          >
            {aiChatEnabled ? 'AI on' : 'AI off'}
            {' · '}
            {chatProviderLabel}
            {' · '}
            {chatRegionLabel}
            {chatModel ? ` · ${chatModel}` : ''}
          </button>
        ) : null}
        {workflowMode ? (
          <section className={getUiSectionChipClassName('secondary', uiPanelMicroLabelTextSizeClass)}>
            {tabLabel}
          </section>
        ) : (
          <ToolbarDropdownSelect
            value={activeTab}
            options={tabOptions}
            title={`Workflow section: ${tabOptions.find(option => option.id === activeTab)?.title || UI_LABELS.storyboardWidgetGraph}`}
            showTooltip={false}
            isButtonActive={true}
            onSelect={id => onTabChange?.(id as StoryboardWidgetManagerTabKey)}
            renderButtonContent={activeOption => (
              <span className={uiPanelMicroLabelTextSizeClass}>{activeOption.title}</span>
            )}
            renderOptionContent={option => <span className="truncate">{option.title}</span>}
            menuWidthClass={UI_RESPONSIVE_SLIM_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
          />
        )}
      </>} />
  )
}
