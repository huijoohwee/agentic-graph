import { MainPanelTypeIcon } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { uiToolbarSettingsPanelBodyClassName } from '@/features/toolbar/ui/toolbarStyles'
import { CanvasKeyTypeValueStaticRow as KeyTypeValueStaticRow } from '@/features/panels/ui/canvasKeyTypeValueStaticRow'
import { PanelColorPicker } from '@/lib/ui/PanelColorPicker'
import React from 'react';
import {
  RightAlignedValueCell,
} from 'grph-shared/react/keyTypeValueRow';
import Tooltip from '@/features/panels/ui/Tooltip';
import { useGraphStore } from '@/hooks/useGraphStore';
import { MVP_COLOR_PALETTE } from '@/lib/graph/schema';
import { useRendererPalette } from '@/features/toolbar/hooks/useRendererPalette';
import {
  RENDERER_PALETTE_LIFECYCLE_TOOLTIP,
  RENDERER_PALETTE_ENTRY_KEY_TOOLTIP,
  RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP,
} from '@/lib/config';
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens';
import { PlainTextInputEditor } from '@/components/ui/PlainTextInputEditor';
import { PANEL_TYPOGRAPHY_DEFAULTS } from 'grph-shared/ui/panelTypography';
import {
  UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME,
  UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses';

export function RendererPaletteSettings() {
  const uiPanelKeyValueInputClass = useGraphStore(
    (s) =>
      s.uiPanelKeyValueInputClass ||
      PANEL_TYPOGRAPHY_DEFAULTS.keyValueInputClass
  );
  const { palette, handleUpdatePaletteColor } = useRendererPalette();

  const nodeTypes = [
    { key: 'idea', label: 'Idea nodes' },
    { key: 'hypothesis', label: 'Hypothesis nodes' },
    { key: 'execution', label: 'Execution nodes' },
    { key: 'pivot', label: 'Pivot nodes' },
    { key: 'alert', label: 'Alert nodes' },
  ] as const;
  const edgeTypes = [
    { key: 'critical', label: 'Critical edges' },
    { key: 'neutral', label: 'Neutral edges' },
  ] as const;

  return (
    <section className={uiToolbarSettingsPanelBodyClassName}>
      <section className={`text-xs ${UI_THEME_TOKENS.text.secondary} leading-snug`}>
        <Tooltip
          content={RENDERER_PALETTE_LIFECYCLE_TOOLTIP}
          maxWidthPx={260}
          contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
          className="break-words"
        >
          <span>
            Lifecycle palette: Blue core ideas, Yellow hypotheses, Green execution, Orange pivots, Red alerts.
          </span>
        </Tooltip>
      </section>
      <section>
      {nodeTypes.map(({ key: type, label }) => (
        <KeyTypeValueStaticRow
          key={`node-${type}`}
          layout="keyIconValue"
          keyNode={
            <Tooltip
              content={`${label} · renderer:palette.nodes.${type}. ${RENDERER_PALETTE_ENTRY_KEY_TOOLTIP}`}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className="break-words"
            >
              <span className={`${UI_THEME_TOKENS.text.primary} break-words`}>
                {label}
              </span>
            </Tooltip>
          }
          typeNode={<MainPanelTypeIcon iconKey="ktv.type.color" />}
          valueNode={
            <RightAlignedValueCell>
              <Tooltip
                content={RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP}
                maxWidthPx={260}
                contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
                className="w-full"
              >
                <section className={UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME}>
                  <PanelColorPicker

                    value={palette.nodes[type] || MVP_COLOR_PALETTE.nodes[type as keyof typeof MVP_COLOR_PALETTE.nodes]} aria-label={`${type} colour`}
                    onValueChange={nextColor => handleUpdatePaletteColor('node', type, nextColor)}
                  />
                  <PlainTextInputEditor
                    ariaLabel={`${label} colour value`}
                    className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${uiPanelKeyValueInputClass} ${UI_THEME_TOKENS.text.primary}`}
                    value={String(palette.nodes[type] || '')}
                    onChange={(next) => handleUpdatePaletteColor('node', type, next)}
                    placeholder={MVP_COLOR_PALETTE.nodes[type as keyof typeof MVP_COLOR_PALETTE.nodes]}
                  />
                </section>
              </Tooltip>
            </RightAlignedValueCell>
          }
        />
      ))}

      {edgeTypes.map(({ key: type, label }) => (
        <KeyTypeValueStaticRow
          key={`edge-${type}`}
          layout="keyIconValue"
          keyNode={
            <Tooltip
              content={`${label} · renderer:palette.edges.${type}. ${RENDERER_PALETTE_ENTRY_KEY_TOOLTIP}`}
              maxWidthPx={260}
              contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
              className="break-words"
            >
              <span className={`${UI_THEME_TOKENS.text.primary} break-words`}>
                {label}
              </span>
            </Tooltip>
          }
          typeNode={<MainPanelTypeIcon iconKey="ktv.type.color" />}
          valueNode={
            <RightAlignedValueCell>
              <Tooltip
                content={RENDERER_PALETTE_ENTRY_VALUE_TOOLTIP}
                maxWidthPx={260}
                contentClassName={`${UI_THEME_TOKENS.tooltip.bg} ${UI_THEME_TOKENS.tooltip.text}`}
                className="w-full"
              >
                <section className={UI_RESPONSIVE_CONTROL_VALUE_ROW_CLASSNAME}>
                  <PanelColorPicker

                    value={palette.edges[type] || MVP_COLOR_PALETTE.edges[type as keyof typeof MVP_COLOR_PALETTE.edges]} aria-label={`${type} colour`}
                    onValueChange={nextColor => handleUpdatePaletteColor('edge', type, nextColor)}
                  />
                  <PlainTextInputEditor
                    ariaLabel={`${label} colour value`}
                    className={`${UI_RESPONSIVE_CONTROL_INLINE_FILL_CLASSNAME} ${uiPanelKeyValueInputClass} ${UI_THEME_TOKENS.text.primary}`}
                    value={String(palette.edges[type] || '')}
                    onChange={(next) => handleUpdatePaletteColor('edge', type, next)}
                    placeholder={MVP_COLOR_PALETTE.edges[type as keyof typeof MVP_COLOR_PALETTE.edges]}
                  />
                </section>
              </Tooltip>
            </RightAlignedValueCell>
          }
        />
      ))}
      </section>
    </section>
  );
}
