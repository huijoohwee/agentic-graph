import React from 'react'
import { UI_COPY } from '@/lib/config'
import IconButton from '@/components/IconButton'
import { FilePlus, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { MarkdownSidebarSection } from './MarkdownSidebarSection'
import { MarkdownSourceFilesPanel } from './MarkdownSourceFilesPanel'
import type {
  MarkdownSourceFileListItem,
  MarkdownSourceFilesPanelIntegration,
} from './markdownSourceFilesPanelTypes'

export function MarkdownSourceFilesSidebarSection(props: {
  uiPanelTextFontClass: string
  uiPanelMicroLabelTextSizeClass?: string
  uiPanelKeyValueTextSizeClass?: string
  sourceFiles: MarkdownSourceFileListItem[] | undefined
  onSourceFileSelect?: (id: string) => void
  integration: MarkdownSourceFilesPanelIntegration
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const {
    uiPanelTextFontClass,
    uiPanelMicroLabelTextSizeClass,
    uiPanelKeyValueTextSizeClass,
    sourceFiles,
    onSourceFileSelect,
    integration,
    collapsed,
    onToggleCollapsed,
  } = props

  return (
    <MarkdownSidebarSection
      ariaLabel={UI_COPY.markdownPreviewSourceFilesLabel}
      title={integration.folderName || UI_COPY.markdownPreviewSourceFilesLabel}
      uiPanelTextFontClass={uiPanelTextFontClass}
      uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
      uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      menuAriaLabel="Source files actions"
      menuItems={
        <>
          <li className="list-none">
            <IconButton
              title="Open folder"
              tooltipContent="Open folder"
              showTooltip
              onClick={() => void integration.onOpenFolder()}
            >
              <FolderOpen className={integration.iconClassName} aria-hidden="true" />
            </IconButton>
          </li>
          {integration.onRefreshFiles ? (
            <li className="list-none">
              <IconButton
                title="Refresh"
                tooltipContent="Refresh"
                showTooltip
                onClick={() => void integration.onRefreshFiles?.()}
              >
                <RefreshCw className={integration.iconClassName} aria-hidden="true" />
              </IconButton>
            </li>
          ) : null}
          {integration.onCreateFolder && integration.canWrite ? (
            <li className="list-none">
              <IconButton
                title="New folder"
                tooltipContent="New folder"
                showTooltip
                onClick={() => void integration.onCreateFolder?.(null)}
              >
                <FolderPlus className={integration.iconClassName} aria-hidden="true" />
              </IconButton>
            </li>
          ) : null}
          {integration.onCreateFile && integration.canWrite ? (
            <li className="list-none">
              <IconButton
                title="New file"
                tooltipContent="New file"
                showTooltip
                onClick={() => integration.onCreateFile?.(null)}
              >
                <FilePlus className={integration.iconClassName} aria-hidden="true" />
              </IconButton>
            </li>
          ) : null}
        </>
      }
    >
      <section
        className={[
          'px-2 py-1 border-t',
          UI_THEME_TOKENS.panel.divider,
          UI_THEME_TOKENS.text.tertiary,
          uiPanelTextFontClass,
          'text-xs flex items-center justify-between gap-2',
        ].join(' ')}
        aria-label="Source files status"
      >
        <span className="truncate overflow-hidden whitespace-nowrap">
          {integration.folderName
            ? integration.canWrite
              ? 'Writable'
              : 'Read-only'
            : 'No folder open'}
        </span>
        {integration.accessMode ? (
          <span className="truncate overflow-hidden whitespace-nowrap">{integration.accessMode}</span>
        ) : null}
      </section>
      <MarkdownSourceFilesPanel
        uiPanelTextFontClass={uiPanelTextFontClass}
        sourceFiles={sourceFiles}
        onSourceFileSelect={onSourceFileSelect}
        integration={integration}
      />
    </MarkdownSidebarSection>
  )
}
