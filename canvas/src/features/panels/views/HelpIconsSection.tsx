import { MainPanelIconButton } from '../ui/MainPanelIconButton'
import React from 'react';
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection';
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows';
import Tooltip from '@/features/panels/ui/Tooltip';
import { HELP_STEP_COPY } from '@/features/panels/config';
import {
  UI_ANCHORS,
  GRAPH_FIELDS_ICON_LEGEND_TOOLTIP,
  GRAPH_FIELDS_GRAPH_DATA_TABLE_MAPPING_TOOLTIP,
  UI_COPY,
} from '@/lib/config';
import {
  loadMainPanelHelpIconTexts,
  type MainPanelHelpIconText,
} from '@/features/panels/mainPanelHelpIconTexts';
import { useGraphStore } from '@/hooks/useGraphStore';
import { uiToolbarButtonMutedClassName } from '@/features/toolbar/ui/toolbarStyles';
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens';
import {
  MAIN_PANEL_TYPE_ICON_KEYS,
  getMainPanelTypeIconMeta,
  type MainPanelTypeIconKey,
} from '@/features/panels/ui/mainPanelHelpIconLibrary';
import { MARKDOWN_DATA_VIEW_COPY } from '@/lib/config-copy/markdownDataViewCopy';
import {
  HelpKtvActionGroup,
  HelpKtvMutedText,
  HelpKtvRow,
  HelpKtvRows,
  HelpKtvValueStack,
} from './HelpKtvLayout';

interface IconRow {
  iconKey: MainPanelTypeIconKey;
  name: string;
  textKey: string;
}

interface HelpIconsSectionProps {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
  onOpenSettingsTab: () => void;
}

const EMPTY_HELP_ICON_TEXT: MainPanelHelpIconText = {
  key: '',
  type: '',
  value: '',
  details: [],
};

export function HelpIconsSection({ collapsed, onToggle, onOpenSettingsTab }: HelpIconsSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  );
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  );
  const [helpIconTextByKey, setHelpIconTextByKey] = React.useState<Record<string, MainPanelHelpIconText>>({});

  React.useEffect(() => {
    let alive = true;
    loadMainPanelHelpIconTexts().then(rows => {
      if (!alive) return;
      setHelpIconTextByKey(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const getHelpIconText = React.useCallback(
    (key: string): MainPanelHelpIconText => helpIconTextByKey[key] || EMPTY_HELP_ICON_TEXT,
    [helpIconTextByKey],
  );

  const iconRows = React.useMemo<IconRow[]>(
    () => MAIN_PANEL_TYPE_ICON_KEYS.map((iconKey): IconRow => {
      const meta = getMainPanelTypeIconMeta(iconKey);
      return {
        iconKey,
        name: meta.label,
        textKey: iconKey,
      };
    }),
    [],
  );

  const renderHelpIconValue = React.useCallback(
    (textKey: string, beforeNode?: React.ReactNode): React.ReactNode => {
      const text = getHelpIconText(textKey);
      return (
        <HelpKtvValueStack>
          {beforeNode}
          {text.value ? <HelpKtvMutedText>{text.value}</HelpKtvMutedText> : null}
        </HelpKtvValueStack>
      );
    },
    [getHelpIconText],
  );

  return (
    <section data-kg-anchor={UI_ANCHORS.graphFieldsIcons}>
      <CollapsibleSection
        title={HELP_STEP_COPY.icons.title}
        collapsed={collapsed}
        onToggle={onToggle}
        id={UI_ANCHORS.graphFieldsIcons}
      >
        {HELP_STEP_COPY.icons.descriptionShort && (
          <section className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
            {HELP_STEP_COPY.icons.descriptionShort}
          </section>
        )}
        <HelpKtvRows className="mb-2">
          <HelpKtvRow
            keyNode={(
              <Tooltip
                content={GRAPH_FIELDS_ICON_LEGEND_TOOLTIP}
                maxWidthPx={260}
              >
                <span>Icon Legend</span>
              </Tooltip>
            )}
            iconKey="mainPanel.help"
            valueNode={renderHelpIconValue('iconLegend.header')}
          />
          <HelpKtvRow
            keyNode="Icon Density"
            iconKey="mainPanel.settings"
            dataKgAnchor={UI_ANCHORS.settingsUiIconScale}
            valueNode={renderHelpIconValue('iconDensity.settings', (
              <HelpKtvActionGroup>
                <MainPanelIconButton iconKey="mainPanel.settings" label={UI_COPY.openSettingsUiDensityIconsButton}
                  className={`App-toolbar__btn ${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${uiToolbarButtonMutedClassName}`}
                  onClick={onOpenSettingsTab} />
              </HelpKtvActionGroup>
            ))}
          />
          <HelpKtvRow
            keyNode="Reuse Contract"
            iconKey="ktv.type.static"
            valueNode={renderHelpIconValue('reuse.contract')}
          />
          <HelpKtvRow
            keyNode={(
              <Tooltip
                content={GRAPH_FIELDS_GRAPH_DATA_TABLE_MAPPING_TOOLTIP}
                maxWidthPx={260}
              >
                <span>{MARKDOWN_DATA_VIEW_COPY.titleDefault}</span>
              </Tooltip>
            )}
            iconKey="mainPanel.workflowManager"
            valueNode={renderHelpIconValue('graphDataTable.mapping')}
          />
        </HelpKtvRows>
        <HelpKtvRows>
          {iconRows.map(row => (
            <HelpKtvRow
              key={row.textKey}
              keyNode={row.name}
              iconKey={row.iconKey}
              valueNode={renderHelpIconValue(row.textKey)}
            />
          ))}
        </HelpKtvRows>
      </CollapsibleSection>
    </section>
  );
}
