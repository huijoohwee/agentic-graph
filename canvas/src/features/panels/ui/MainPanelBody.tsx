import React from 'react';
import 'agentic-design-system/panel-tab-layout.css';

interface MainPanelBodyProps {
  header: React.ReactNode;
  children: React.ReactNode;
  scrollRef?: React.Ref<HTMLElement>;
  scrollable?: boolean;
}

export default function MainPanelBody({ header, children, scrollRef, scrollable = true }: MainPanelBodyProps) {
  return (
    <aside className="agentic-panel-tab-layout" aria-label="Main Panel">
      {header}
      <section
        ref={scrollRef}
        className="agentic-panel-tab-body"
        data-agentic-tab-viewport={!scrollable || undefined}
        aria-label="Main Panel Content"
      >
        {children}
      </section>
    </aside>
  );
}
