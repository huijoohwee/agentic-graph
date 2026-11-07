import { useState, useRef, useCallback, useEffect } from 'react';
import { LS_KEYS } from '@/lib/config';
import { lsBool, lsSetBool } from '@/lib/persistence';
import { usePinnedLs } from '@/lib/ui/panelPinned';
import { clampOverlayCenterFullyInViewport } from '@/lib/ui/overlayClamp';
import { beginOverlayPanelPositionDrag } from '@/lib/ui/overlayPanelDrag';
import { createRafValueScheduler } from '@/lib/react/rafValueScheduler';
import type { MainPanelTabKey } from '@/features/panels/mainPanelTabs';

export type { MainPanelTabKey } from '@/features/panels/mainPanelTabs';

export type WorkflowManagerTabKey = 'graph' | 'mapping'

export type MainPanelOpenOptions = {
  searchQuery?: string;
  workflowManagerTab?: WorkflowManagerTabKey;
  workflowManagerEntryLabel?: string;
  anchorId?: string;
};

export function useMainPanelDrag() {
  const [isMainPanelOpen, setIsMainPanelOpen] = useState(false);
  const [mainPanelRequestedTab, setMainPanelRequestedTab] = useState<MainPanelTabKey>('help');
  const [mainPanelRequestedSearchQuery, setMainPanelRequestedSearchQuery] = useState('');
  const [mainPanelRequestedAnchorId, setMainPanelRequestedAnchorId] = useState('');
  const [mainPanelRequestedAnchorSeq, setMainPanelRequestedAnchorSeq] = useState(0);
  const [mainPanelRequestedWorkflowManagerTab, setMainPanelRequestedWorkflowManagerTab] = useState<WorkflowManagerTabKey>('graph');
  const [mainPanelRequestedWorkflowManagerEntryLabel, setMainPanelRequestedWorkflowManagerEntryLabel] = useState('');
  const mainPanelCardRef = useRef<HTMLElement>(null);
  const mainPanelDragPosRef = useRef<{ top: number; left: number } | null>(null);
  const dragSchedulerRef = useRef(createRafValueScheduler((pos: { top: number; left: number }) => setMainPanelDragPosSynced(pos)));
  const { pinned: mainPanelPinned, setPinned: setMainPanelPinned } = usePinnedLs(LS_KEYS.mainPanelPinned, true);
  const [mainPanelCollapsed, setMainPanelCollapsed] = useState<boolean>(() => lsBool(LS_KEYS.mainPanelCollapsed, false));
  // null uses the viewport center in CSS; remembered coordinates must not displace a new opening.
  const [mainPanelDragPos, setMainPanelDragPos] = useState<{ top: number; left: number } | null>(null);

  const centerMainPanel = useCallback(() => {
    dragSchedulerRef.current.cancel();
    mainPanelDragPosRef.current = null;
    setMainPanelDragPos(null);
  }, []);

  useEffect(() => {
    lsSetBool(LS_KEYS.mainPanelCollapsed, mainPanelCollapsed);
  }, [mainPanelCollapsed]);

  const clampMainPanelPos = useCallback((pos: { top: number; left: number }) => {
    if (typeof window === 'undefined') return pos;

    const rect = mainPanelCardRef.current?.getBoundingClientRect();
    const fallbackW = Math.min(Math.round(window.innerWidth * 0.8), 960);
    const fallbackH = mainPanelCollapsed ? 240 : Math.min(Math.round(window.innerHeight * 0.8), 800);
    const width = rect ? Math.max(1, Math.round(rect.width)) : fallbackW;
    const height = rect ? Math.max(1, Math.round(rect.height)) : fallbackH;
    return clampOverlayCenterFullyInViewport({
      pos,
      size: { width, height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
  }, [mainPanelCollapsed]);

  const openMainPanel = useCallback(
    (tab: MainPanelTabKey, options?: MainPanelOpenOptions) => {
      setIsMainPanelOpen(true);
      setMainPanelRequestedTab(tab);
      const requestedSearch = typeof options?.searchQuery === 'string' ? options.searchQuery : '';
      const requestedAnchorId = typeof options?.anchorId === 'string' ? options.anchorId : '';
      const requestedWorkflowManagerEntryLabel =
        typeof options?.workflowManagerEntryLabel === 'string' ? options.workflowManagerEntryLabel.trim() : '';
      setMainPanelRequestedSearchQuery(prev => (prev === requestedSearch ? prev : requestedSearch));
      setMainPanelRequestedAnchorId(prev => (prev === requestedAnchorId ? prev : requestedAnchorId));
      setMainPanelRequestedWorkflowManagerEntryLabel(prev =>
        prev === requestedWorkflowManagerEntryLabel ? prev : requestedWorkflowManagerEntryLabel,
      );
      setMainPanelRequestedAnchorSeq(prev => prev + 1);
      const requestedWorkflowManagerTab =
        options?.workflowManagerTab === 'mapping' ? 'mapping' : 'graph'
      setMainPanelRequestedWorkflowManagerTab(prev =>
        prev === requestedWorkflowManagerTab ? prev : requestedWorkflowManagerTab,
      )
      centerMainPanel();
    },
    [centerMainPanel],
  );

  const setMainPanelDragPosSynced = useCallback((pos: { top: number; left: number }) => {
    mainPanelDragPosRef.current = pos;
    setMainPanelDragPos(pos);
  }, []);

  useEffect(() => {
    if (!isMainPanelOpen || typeof window === 'undefined') return;
    const card = mainPanelCardRef.current;
    if (!card) return;

    const keepPanelInView = () => {
      const current = mainPanelDragPosRef.current;
      if (!current) return;
      const next = clampMainPanelPos(current);
      if (next.top !== current.top || next.left !== current.left) {
        setMainPanelDragPosSynced(next);
      }
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(keepPanelInView);
    observer?.observe(card);
    window.addEventListener('resize', centerMainPanel);
    keepPanelInView();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', centerMainPanel);
    };
  }, [isMainPanelOpen, clampMainPanelPos, setMainPanelDragPosSynced, centerMainPanel]);

  useEffect(() => {
    dragSchedulerRef.current = createRafValueScheduler((pos: { top: number; left: number }) => setMainPanelDragPosSynced(pos));
  }, [setMainPanelDragPosSynced]);

  const handleMainPanelHeaderDragStart = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = mainPanelCardRef.current;
    if (!el) return;

    const scheduler = dragSchedulerRef.current;

    beginOverlayPanelPositionDrag({
      event,
      cursor: 'grabbing',
      readStartPosition: () => {
        const rect = el.getBoundingClientRect();
        return {
          top: rect.top + rect.height / 2,
          left: rect.left + rect.width / 2,
        };
      },
      clampPosition: clampMainPanelPos,
      schedulePosition: position => scheduler.schedule(position),
      flushPosition: () => scheduler.flush(),
      cancelPosition: () => scheduler.cancel(),
      onDragStart: position => setMainPanelDragPosSynced(position),
      onDragEnd: () => {
        const pos = mainPanelDragPosRef.current;
        if (!pos) return;
        setMainPanelDragPosSynced(clampMainPanelPos(pos));
      },
    });
  }, [clampMainPanelPos, setMainPanelDragPosSynced]);

  const handleMainPanelRestore = useCallback(() => {
    setMainPanelCollapsed(false);
    centerMainPanel();
  }, [centerMainPanel]);

  return {
    isMainPanelOpen,
    setIsMainPanelOpen,
    mainPanelRequestedTab,
    mainPanelRequestedSearchQuery,
    mainPanelRequestedAnchorId,
    mainPanelRequestedAnchorSeq,
    mainPanelRequestedWorkflowManagerTab,
    mainPanelRequestedWorkflowManagerEntryLabel,
    setMainPanelRequestedTab,
    mainPanelCardRef,
    mainPanelPinned,
    setMainPanelPinned,
    mainPanelCollapsed,
    setMainPanelCollapsed,
    mainPanelDragPos,
    openMainPanel,
    handleMainPanelHeaderDragStart,
    handleMainPanelRestore,
    clampMainPanelPos,
  };
}
