import React from 'react'
import { PanelCode } from '@/features/panels/ui/PanelText';
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection';
import { KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME } from 'grph-shared/ui/keyTypeValueRows'
import { HELP_STEP_COPY } from '@/features/panels/config';
import {
  loadMainPanelHelpShortcutTexts,
  type MainPanelHelpShortcutText,
} from '@/features/panels/mainPanelHelpShortcuts'
import { UI_COPY } from '@/lib/config';
import { useGraphStore } from '@/hooks/useGraphStore';
import {
  uiPrimaryPillActiveClassName,
  uiToolbarButtonMutedClassName,
} from '@/features/toolbar/ui/toolbarStyles'
import {
  CANVAS_PRECEDENCE_RULES,
  CANVAS_SHORTCUTS,
  CANVAS_SHORTCUT_CATEGORIES,
  CANVAS_SHORTCUT_COPY_LINES,
  type CanvasShortcutCategory,
  getCanvasShortcutSearchText,
} from '@/lib/canvas/interaction-ssot'
import { normalized as normalizeText } from '@/features/panels/utils/json'
import {
  getThreeKeyboardShortcutSearchText,
  type ThreeKeyboardShortcut,
} from '@/features/three/threeKeyboardShortcutCatalog'
import { renderMarkdownSigilInlineText } from '@/lib/ui/MarkdownSigilText'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import {
  HelpKtvActionGroup,
  HelpKtvCode,
  HelpKtvInlineGroup,
  HelpKtvMutedText,
  HelpKtvPill,
  HelpKtvRow,
  HelpKtvRows,
  HelpKtvValueStack,
} from './HelpKtvLayout'

interface HelpShortcutsSectionProps {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
  searchQuery: string;
  shortcuts: string[];
  threeKeyboardShortcuts: readonly ThreeKeyboardShortcut[];
  onCopyAllShortcuts: () => void;
  onLaunchSpotlight: () => void;
  flushTop?: boolean;
}

const EMPTY_SHORTCUT_TEXT: MainPanelHelpShortcutText = {
  key: '',
  value: '',
}

export function HelpShortcutsSection({
  collapsed,
  onToggle,
  searchQuery,
  shortcuts,
  threeKeyboardShortcuts,
  onCopyAllShortcuts,
  onLaunchSpotlight,
  flushTop = false,
}: HelpShortcutsSectionProps) {
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  );
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  );

  const shortcutsText = React.useMemo(() => shortcuts.join('\n'), [shortcuts]);
  const normalizedQuery = React.useMemo(() => normalizeText(searchQuery).trim(), [searchQuery])
  const [category, setCategory] = React.useState<CanvasShortcutCategory | 'All'>('All')
  const [shortcutTextByKey, setShortcutTextByKey] = React.useState<Record<string, MainPanelHelpShortcutText>>({})

  React.useEffect(() => {
    setCategory('All')
  }, [searchQuery])

  React.useEffect(() => {
    let alive = true
    loadMainPanelHelpShortcutTexts().then(rows => {
      if (!alive) return
      setShortcutTextByKey(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  const getShortcutText = React.useCallback(
    (key: string): MainPanelHelpShortcutText => shortcutTextByKey[key] || EMPTY_SHORTCUT_TEXT,
    [shortcutTextByKey],
  )

  const filteredCanvasShortcuts = React.useMemo(() => {
    const base = category === 'All' ? CANVAS_SHORTCUTS : CANVAS_SHORTCUTS.filter(s => s.category === category)
    if (!normalizedQuery) return base
    return base.filter(s => normalizeText(getCanvasShortcutSearchText(s)).includes(normalizedQuery))
  }, [category, normalizedQuery])

  const otherShortcuts = React.useMemo(() => {
    const canvasSet = new Set(CANVAS_SHORTCUT_COPY_LINES)
    return shortcuts.filter(s => !canvasSet.has(s))
  }, [shortcuts])

  const filteredThreeKeyboardShortcuts = React.useMemo(() => {
    if (!normalizedQuery) return threeKeyboardShortcuts
    return threeKeyboardShortcuts.filter(shortcut => (
      normalizeText(getThreeKeyboardShortcutSearchText(shortcut)).includes(normalizedQuery)
    ))
  }, [normalizedQuery, threeKeyboardShortcuts])

  return (
    <CollapsibleSection
      title={HELP_STEP_COPY.shortcuts.title}
      collapsed={collapsed}
      onToggle={onToggle}
      flushTop={flushTop}
    >
      {HELP_STEP_COPY.shortcuts.descriptionShort && (
        <p className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-2`}>
          {HELP_STEP_COPY.shortcuts.descriptionShort}
        </p>
      )}

      <section className="mb-3" aria-label="Shortcut precedence rules">
        <p className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-1`}>
          Precedence rules
        </p>
        <HelpKtvRows>
          {CANVAS_PRECEDENCE_RULES.map(r => (
            <HelpKtvRow
              key={r.id}
              keyNode={r.rule}
              iconKey="ktv.type.static"
              valueNode={(
                <HelpKtvValueStack>
                  {getShortcutText(`precedence.${r.id}`).value ? (
                    <HelpKtvMutedText>{getShortcutText(`precedence.${r.id}`).value}</HelpKtvMutedText>
                  ) : null}
                </HelpKtvValueStack>
              )}
            />
          ))}
        </HelpKtvRows>
      </section>

      <section aria-label="Canvas shortcuts" className="mb-3">
        <header className="flex items-center justify-between gap-2 mb-2">
          <p className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary}`}>
            Canvas shortcuts
          </p>
          <nav aria-label="Shortcut categories" className="flex flex-wrap gap-1">
            <button
              type="button"
              className={[
                'App-toolbar__btn text-xs',
                category === 'All' ? uiPrimaryPillActiveClassName : uiToolbarButtonMutedClassName,
              ].join(' ')}
              onClick={() => setCategory('All')}
              aria-pressed={category === 'All'}
            >
              All
            </button>
            {CANVAS_SHORTCUT_CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                className={[
                  'App-toolbar__btn text-xs',
                  category === c ? uiPrimaryPillActiveClassName : uiToolbarButtonMutedClassName,
                ].join(' ')}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
              >
                {c}
              </button>
            ))}
          </nav>
        </header>

        <HelpKtvRows aria-label="Canvas shortcut rows">
          {filteredCanvasShortcuts.map(s => (
            <HelpKtvRow
              key={s.id}
              keyNode={s.action}
              iconKey="ktv.type.action"
              valueNode={(
                <HelpKtvValueStack>
                  <HelpKtvInlineGroup>
                    <HelpKtvCode>{s.input}</HelpKtvCode>
                    <HelpKtvPill>{s.category}</HelpKtvPill>
                  </HelpKtvInlineGroup>
                  <HelpKtvMutedText>{s.modes.join(', ')}</HelpKtvMutedText>
                </HelpKtvValueStack>
              )}
            />
          ))}
          {filteredCanvasShortcuts.length === 0 && (
            <HelpKtvRow
              keyNode="No shortcuts matched"
              iconKey="mainPanel.help"
              valueNode={(
                <HelpKtvValueStack>
                  <HelpKtvMutedText>{UI_COPY.helpNoShortcutsMatched}</HelpKtvMutedText>
                </HelpKtvValueStack>
              )}
            />
          )}
        </HelpKtvRows>
      </section>

      <section aria-label="3D and XR shortcuts" className="mb-3" data-kg-help-xr-shortcuts="1">
        <header className="mb-2">
          <p className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary}`}>
            3D / XR shortcuts
          </p>
        </header>
        <HelpKtvRows aria-label="3D and XR shortcut rows">
          {filteredThreeKeyboardShortcuts.map(shortcut => (
            <HelpKtvRow
              key={shortcut.id}
              keyNode={shortcut.action}
              iconKey={shortcut.category === '3D animation' ? 'floatingPanel.animation' : 'floatingPanel.camera'}
              valueNode={(
                <HelpKtvValueStack>
                  <HelpKtvInlineGroup>
                    <HelpKtvCode>{shortcut.input}</HelpKtvCode>
                    <HelpKtvPill>{shortcut.category}</HelpKtvPill>
                  </HelpKtvInlineGroup>
                  {getShortcutText(shortcut.textKey).value ? (
                    <HelpKtvMutedText>{getShortcutText(shortcut.textKey).value}</HelpKtvMutedText>
                  ) : null}
                  <HelpKtvMutedText>{shortcut.context}</HelpKtvMutedText>
                  <HelpKtvCode data-kg-help-xr-shortcut-invocation={shortcut.id}>
                    {shortcut.invocation
                      ? renderMarkdownSigilInlineText(shortcut.invocation)
                      : 'Invocation grammar hydrating…'}
                  </HelpKtvCode>
                  <HelpKtvMutedText>
                    MCP <PanelCode data-kg-help-xr-shortcut-mcp={shortcut.id}>{shortcut.mcpTool}</PanelCode>
                  </HelpKtvMutedText>
                  <HelpKtvCode>{JSON.stringify(shortcut.mcpInput)}</HelpKtvCode>
                </HelpKtvValueStack>
              )}
              dataKgAnchor={`shortcut.${shortcut.id}`}
            />
          ))}
          {filteredThreeKeyboardShortcuts.length === 0 && (
            <HelpKtvRow
              keyNode="No 3D / XR shortcuts matched"
              iconKey="mainPanel.help"
              valueNode={<HelpKtvMutedText>{UI_COPY.helpNoShortcutsMatched}</HelpKtvMutedText>}
            />
          )}
        </HelpKtvRows>
      </section>

      {otherShortcuts.length > 0 && (
        <section aria-label="Other shortcuts" className="mb-3">
          <p className={`${uiPanelKeyValueTextSizeClass} ${uiPanelTextFontClass} ${UI_THEME_TOKENS.text.secondary} mb-1`}>
            Other shortcuts
          </p>
          <HelpKtvRows>
            {otherShortcuts.map(shortcut => (
              <HelpKtvRow
                key={shortcut}
                keyNode={shortcut}
                iconKey="ktv.type.action"
                valueNode={(
                  <HelpKtvValueStack>
                    {getShortcutText('other.included').value ? (
                      <HelpKtvMutedText>{getShortcutText('other.included').value}</HelpKtvMutedText>
                    ) : null}
                  </HelpKtvValueStack>
                )}
              />
            ))}
          </HelpKtvRows>
        </section>
      )}

      <HelpKtvRows className="mb-2" aria-label="Help shortcut actions">
        <HelpKtvRow
          keyNode="Shortcut Actions"
          iconKey="ktv.type.action"
          valueNode={(
            <HelpKtvValueStack>
              <HelpKtvActionGroup>
                <button
                  type="button"
                  onClick={onCopyAllShortcuts}
                  className={`App-toolbar__btn text-xs ${uiToolbarButtonMutedClassName}`}
                >
                  Copy All
                </button>
                <button
                  type="button"
                  onClick={onLaunchSpotlight}
                  className={`App-toolbar__btn text-xs ${uiPrimaryPillActiveClassName}`}
                >
                  Launch
                </button>
              </HelpKtvActionGroup>
              <HelpKtvMutedText className={UI_THEME_TOKENS.text.tertiary}>
                {shortcutsText.length > 0 ? UI_COPY.helpShortcutsCountStatus(shortcuts.length) : UI_COPY.helpNoShortcutsMatched}
              </HelpKtvMutedText>
            </HelpKtvValueStack>
          )}
        />
      </HelpKtvRows>
    </CollapsibleSection>
  );
}
