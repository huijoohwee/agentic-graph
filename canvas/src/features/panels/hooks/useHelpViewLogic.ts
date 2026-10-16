import React from 'react';
import { useLaunchSpotlight } from '@/features/panels/hooks/useLaunchSpotlight';
import { HELP_SHORTCUT_ITEMS, type HelpStepKey } from '@/features/panels/config';
import { emitMainPanelOpen } from '@/features/panels/utils/useMainPanelRect';
import { HELP_SCROLL_TO_ANCHOR_EVENT } from '@/features/panels/utils/helpPanelEvents';
import { normalized as normalizeText } from '@/features/panels/utils/json';
import { useGraphStore } from '@/hooks/useGraphStore';
import { useAgenticOsRemoteGrammarCatalog } from '@/features/agentic-os/agenticOsRemoteGrammarClient';
import {
  buildThreeKeyboardShortcutCatalog,
  formatThreeKeyboardShortcutCopyLine,
  THREE_KEYBOARD_SHORTCUT_GRAMMAR_SIGILS,
} from '@/features/three/threeKeyboardShortcutCatalog';

interface UseHelpViewLogicProps {
  searchQuery: string;
}

export function useHelpViewLogic({ searchQuery }: UseHelpViewLogicProps) {
  // 1. Filter shortcuts
  const grammar = useAgenticOsRemoteGrammarCatalog({ sigils: THREE_KEYBOARD_SHORTCUT_GRAMMAR_SIGILS });
  const threeKeyboardShortcuts = React.useMemo(
    () => buildThreeKeyboardShortcutCatalog(),
    [grammar.entries, grammar.hydration.status, grammar.sourceRevision],
  );
  const items = React.useMemo(
    () => [
      ...HELP_SHORTCUT_ITEMS,
      ...threeKeyboardShortcuts.map(formatThreeKeyboardShortcutCopyLine),
    ],
    [threeKeyboardShortcuts],
  );
  const normalizedQuery = normalizeText(searchQuery).trim();

  const filteredShortcuts = React.useMemo(
    () =>
      normalizedQuery
        ? items.filter(text => normalizeText(text).includes(normalizedQuery))
        : [...items],
    [items, normalizedQuery],
  );

  // 2. Copy shortcuts
  const applyShortcutsCopy = React.useCallback(() => {
    try {
      const text = filteredShortcuts.join('\n');
      if (!text) return;
      navigator.clipboard.writeText(text);
    } catch {
      void 0;
    }
  }, [filteredShortcuts]);

  // 3. Scroll ref and anchor scrolling
  const scrollRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    try {
      node.scrollTop = 0;
    } catch {
      void 0;
    }
  }, [searchQuery]);

  const scrollToAnchor = React.useCallback((anchorId: string) => {
    try {
      const container = scrollRef.current;
      if (!container) return;
      const target = container.querySelector<HTMLElement>(`[data-kg-anchor="${anchorId}"]`);
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch {
      void 0;
    }
  }, []);

  React.useEffect(() => {
    try {
      const handler = (ev: Event) => {
        const e = ev as CustomEvent<{ anchor?: string } | undefined>;
        const anchor = e.detail && e.detail.anchor;
        if (!anchor) return;
        scrollToAnchor(anchor);
      };
      window.addEventListener(HELP_SCROLL_TO_ANCHOR_EVENT, handler as EventListener);
      return () => {
        window.removeEventListener(HELP_SCROLL_TO_ANCHOR_EVENT, handler as EventListener);
      };
    } catch {
      void 0;
    }
  }, [scrollToAnchor]);

  // 4. Launch Spotlight
  const launch = useLaunchSpotlight();

  // 5. Store values
  const uiIconScale = useGraphStore(s => s.uiIconScale);
  const uiPanelMonospaceTextClass = useGraphStore(
    s => s.uiPanelMonospaceTextClass || 'font-mono text-xs',
  );
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  );
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  );

  // 6. Collapse state
  const [collapsedBySection, setCollapsedBySection] = React.useState<Record<HelpStepKey, boolean>>({
    shortcuts: true,
    cheatsheet: true,
    commandMenu: true,
    cloudflareMedia: true,
    panelTour: true,
    workflowLinks: true,
    icons: true,
  });

  React.useEffect(() => {
    if (!normalizedQuery) return
    setCollapsedBySection(prev => prev.shortcuts ? { ...prev, shortcuts: false } : prev)
  }, [normalizedQuery]);

  const collapseAll = React.useCallback(() => {
    setCollapsedBySection({
      shortcuts: true,
      cheatsheet: true,
      commandMenu: true,
      cloudflareMedia: true,
      panelTour: true,
      workflowLinks: true,
      icons: true,
    });
  }, []);

  const expandAll = React.useCallback(() => {
    setCollapsedBySection({
      shortcuts: false,
      cheatsheet: false,
      commandMenu: false,
      cloudflareMedia: false,
      panelTour: false,
      workflowLinks: false,
      icons: false,
    });
  }, []);

  const handleToggleSection = React.useCallback((key: HelpStepKey, next: boolean) => {
    setCollapsedBySection(prev => ({ ...prev, [key]: next }));
  }, []);

  const allSectionsCollapsed = Object.values(collapsedBySection).every(Boolean);

  // 7. Navigation handlers
  const handleOpenStoryboardWidgetManagerTab = React.useCallback(() => {
    try {
      emitMainPanelOpen({ tab: 'workflowManager' });
    } catch {
      void 0;
    }
  }, []);

  const handleOpenSettingsTab = React.useCallback(() => {
    try {
      emitMainPanelOpen({ tab: 'settings' });
    } catch {
      void 0;
    }
  }, []);

  return {
    filteredShortcuts,
    threeKeyboardShortcuts,
    applyShortcutsCopy,
    scrollRef,
    launch,
    uiIconScale,
    uiPanelMonospaceTextClass,
    uiPanelKeyValueTextSizeClass,
    uiPanelTextFontClass,
    collapsedBySection,
    collapseAll,
    expandAll,
    handleToggleSection,
    allSectionsCollapsed,
    handleOpenStoryboardWidgetManagerTab,
    handleOpenSettingsTab,
  };
}
