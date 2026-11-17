import React from 'react';
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection';
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows';
import Tooltip from 'agentic-design-system/react/hover';
import { HELP_STEP_COPY, PIPELINE_STAGE_COPY, RENDER_PANEL_SECTION_COPY } from '@/features/panels/config';
import {
  loadMainPanelWorkflowLinkTexts,
  type MainPanelWorkflowLinkText,
} from '@/features/panels/mainPanelWorkflowLinks';
import {
  UI_ANCHORS,
  WORKFLOW_LINKS_TOOLTIP,
  GRAPHRAG_PATH_METADATA_TOOLTIP,
  AGENTIC_REASONING_LABELS_TOOLTIP,
  HELP_CODEBASE_INDEX_ENTRY_POINTS_TOOLTIP,
} from '@/lib/config';
import { useGraphStore } from '@/hooks/useGraphStore';
import { uiToolbarButtonMutedClassName } from '@/features/toolbar/ui/toolbarStyles';
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens';
import {
  HelpKtvActionGroup,
  HelpKtvInlineGroup,
  HelpKtvMutedText,
  HelpKtvPill,
  HelpKtvRow,
  HelpKtvRows,
  HelpKtvValueStack,
} from './HelpKtvLayout';

interface HelpWorkflowLinksSectionProps {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
  onOpenStoryboardWidgetManagerTab: () => void;
}

const PIPELINE_STAGE_HELP_ROWS = [
  {
    key: 'Ingest / Validate',
    textKey: 'pipeline.ingestValidate',
    badge: PIPELINE_STAGE_COPY.ingestValidate.badge,
    step: PIPELINE_STAGE_COPY.ingestValidate.workflowStepId,
  },
  {
    key: 'Render / Inspect',
    textKey: 'pipeline.renderInspect',
    badge: RENDER_PANEL_SECTION_COPY.presetsAndTuning.badge,
    step: PIPELINE_STAGE_COPY.renderInspect.workflowStepId,
  },
  {
    key: 'Agentic Reasoning',
    textKey: 'pipeline.agenticReasoning',
    badge: PIPELINE_STAGE_COPY.agenticReasoning.badge,
    step: PIPELINE_STAGE_COPY.agenticReasoning.workflowStepId,
  },
] as const

const WORKFLOW_ENTRY_ROWS = [
  {
    key: 'Main panel',
    textKey: 'workflow.entry.mainPanel',
    iconKey: 'mainPanel.workflowManager',
  },
  {
    key: 'Bottom panel',
    textKey: 'workflow.entry.bottomPanel',
    iconKey: 'floatingPanel.renderer',
  },
  {
    key: 'Workspace',
    textKey: 'workflow.entry.workspace',
    iconKey: 'mainPanel.dashboard',
  },
] as const

const GRAPHRAG_METADATA_ROWS = [
  {
    key: 'Canvas entry',
    textKey: 'graphrag.canvasEntry',
    iconKey: 'ktv.type.browser',
  },
  {
    key: 'Markdown pipeline',
    textKey: 'graphrag.markdownPipeline',
    iconKey: 'ktv.type.action',
  },
  {
    key: 'Stores / workflow',
    textKey: 'graphrag.storesWorkflow',
    iconKey: 'ktv.type.static',
  },
] as const

const EMPTY_WORKFLOW_LINK_TEXT: MainPanelWorkflowLinkText = {
  key: '',
  value: '',
  details: [],
}

export function HelpWorkflowLinksSection({
  collapsed,
  onToggle,
  onOpenStoryboardWidgetManagerTab,
}: HelpWorkflowLinksSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  );
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  );
  const [workflowLinkTextByKey, setWorkflowLinkTextByKey] = React.useState<Record<string, MainPanelWorkflowLinkText>>({})

  React.useEffect(() => {
    let alive = true
    loadMainPanelWorkflowLinkTexts().then(rows => {
      if (!alive) return
      setWorkflowLinkTextByKey(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const getWorkflowLinkText = React.useCallback(
    (key: string): MainPanelWorkflowLinkText => workflowLinkTextByKey[key] || EMPTY_WORKFLOW_LINK_TEXT,
    [workflowLinkTextByKey],
  )
  const workflowOpenText = getWorkflowLinkText('workflow.open')
  const clusterLayersText = getWorkflowLinkText('cluster.layers')
  const agenticLabelsText = getWorkflowLinkText('agentic.labels')
  const markdownEntryPointsText = getWorkflowLinkText('markdown.entryPoints')
  const graphRagMetadataText = getWorkflowLinkText('graphrag.metadata')

  return (
    <CollapsibleSection
      title={(
        <Tooltip
          content={WORKFLOW_LINKS_TOOLTIP}
          maxWidthPx={260}

        >
          <span>{HELP_STEP_COPY.workflowLinks.title}</span>
        </Tooltip>
      )}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {HELP_STEP_COPY.workflowLinks.descriptionShort && (
        <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
          {HELP_STEP_COPY.workflowLinks.descriptionShort}
        </section>
      )}
      <HelpKtvRows>
        <HelpKtvRow
          keyNode="Workflow Manager"
          iconKey="mainPanel.workflowManager"
          valueNode={(
            <HelpKtvValueStack>
              <HelpKtvActionGroup>
                <button
                  type="button"
                  className={`App-toolbar__btn ${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${uiToolbarButtonMutedClassName}`}
                  onClick={onOpenStoryboardWidgetManagerTab}
                  data-kg-anchor={UI_ANCHORS.graphFields}
                >
                  Open Workflow Manager
                </button>
              </HelpKtvActionGroup>
              {workflowOpenText.value ? <HelpKtvMutedText>{workflowOpenText.value}</HelpKtvMutedText> : null}
            </HelpKtvValueStack>
          )}
        />
        {PIPELINE_STAGE_HELP_ROWS.map(row => {
          const text = getWorkflowLinkText(row.textKey)
          return (
            <HelpKtvRow
              key={row.key}
              keyNode={row.key}
              iconKey="ktv.type.preset"
              valueNode={(
                <HelpKtvValueStack>
                  <HelpKtvInlineGroup>
                    <HelpKtvPill>{row.badge}</HelpKtvPill>
                    <HelpKtvMutedText>Step {row.step}</HelpKtvMutedText>
                  </HelpKtvInlineGroup>
                  {text.value ? <HelpKtvMutedText>{text.value}</HelpKtvMutedText> : null}
                </HelpKtvValueStack>
              )}
            />
          )
        })}
        <HelpKtvRow
          keyNode="Cluster Layers"
          iconKey="ktv.type.style"
          valueNode={(
            <HelpKtvValueStack>
              {clusterLayersText.value ? <HelpKtvMutedText>{clusterLayersText.value}</HelpKtvMutedText> : null}
            </HelpKtvValueStack>
          )}
        />
        <HelpKtvRow
          keyNode={(
            <Tooltip
              content={AGENTIC_REASONING_LABELS_TOOLTIP}
              maxWidthPx={260}
            >
              <span>Agentic Labels</span>
            </Tooltip>
          )}
          iconKey="ktv.type.static"
          valueNode={(
            <HelpKtvValueStack>
              {agenticLabelsText.value ? <HelpKtvMutedText>{agenticLabelsText.value}</HelpKtvMutedText> : null}
            </HelpKtvValueStack>
          )}
        />
        <HelpKtvRow
          keyNode={(
            <Tooltip
              content={HELP_CODEBASE_INDEX_ENTRY_POINTS_TOOLTIP}
              maxWidthPx={260}
            >
              <span>Markdown Entry Points</span>
            </Tooltip>
          )}
          iconKey="ktv.type.browser"
          valueNode={(
            <HelpKtvValueStack>
              {markdownEntryPointsText.value ? <HelpKtvMutedText>{markdownEntryPointsText.value}</HelpKtvMutedText> : null}
            </HelpKtvValueStack>
          )}
        />
        {WORKFLOW_ENTRY_ROWS.map(row => {
          const text = getWorkflowLinkText(row.textKey)
          return (
            <HelpKtvRow
              key={row.key}
              keyNode={row.key}
              iconKey={row.iconKey}
              valueNode={(
                <HelpKtvValueStack>
                  {text.value ? <HelpKtvMutedText>{text.value}</HelpKtvMutedText> : null}
                </HelpKtvValueStack>
              )}
            />
          )
        })}
        <HelpKtvRow
          keyNode={(
            <Tooltip content={GRAPHRAG_PATH_METADATA_TOOLTIP} maxWidthPx={260}>
              <span>graphRAGPath Metadata</span>
            </Tooltip>
          )}
          iconKey="ktv.type.browser"
          valueNode={(
            <HelpKtvValueStack>
              {graphRagMetadataText.value ? <HelpKtvMutedText>{graphRagMetadataText.value}</HelpKtvMutedText> : null}
            </HelpKtvValueStack>
          )}
        />
        {GRAPHRAG_METADATA_ROWS.map(row => {
          const text = getWorkflowLinkText(row.textKey)
          return (
            <HelpKtvRow
              key={row.key}
              keyNode={row.key}
              iconKey={row.iconKey}
              valueNode={(
                <HelpKtvValueStack>
                  {text.value ? <HelpKtvMutedText>{text.value}</HelpKtvMutedText> : null}
                </HelpKtvValueStack>
              )}
            />
          )
        })}
      </HelpKtvRows>
    </CollapsibleSection>
  );
}
