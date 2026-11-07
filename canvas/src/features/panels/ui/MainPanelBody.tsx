import React from 'react';
import { usePanelTypography } from '@/lib/ui/panelTypography';

interface MainPanelBodyProps {
  header: React.ReactNode;
  children: React.ReactNode;
  scrollRef?: React.Ref<HTMLElement>;
  scrollable?: boolean;
}

export default function MainPanelBody({ header, children, scrollRef, scrollable = true }: MainPanelBodyProps) {
  const { panelTextClass } = usePanelTypography();
  return (
    <aside className={`h-full w-full min-h-0 min-w-0 max-w-full flex flex-col overflow-hidden ${panelTextClass}`} aria-label="Main Panel">
      {header}
      <section
        ref={scrollRef}
        className={`flex-1 min-h-0 min-w-0 max-w-full w-full ${scrollable ? 'overflow-auto' : 'overflow-hidden'}`}
        aria-label="Main Panel Content"
      >
        {children}
      </section>
    </aside>
  );
}
