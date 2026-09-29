import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function readSource(...parts: string[]): string {
  return readFileSync(resolve(root, 'src', ...parts), 'utf8')
}

export function testGanttTimelineTransportToolbarFoldsIntoMenusOnResize() {
  const controlsCssText = ['TimelineTransportControls.css', 'TimelineTransportPlayer.css', 'TimelineTransportControlsMermaidGantt.css'].map(file => readSource('components', 'timeline', file)).join('\n')
  const mermaidCssText = readSource('components', 'timeline', 'TimelineTransportControlsMermaidGantt.css')
  const headerToolsText = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  if (
    !controlsCssText.includes('container-name: timeline-player-toolbar') ||
    !controlsCssText.includes('container-type: inline-size') ||
    !mermaidCssText.includes('width: auto') ||
    !mermaidCssText.includes('max-width: 100%') ||
    !mermaidCssText.includes('@container timeline-player-toolbar (max-width: 500px)') ||
    !mermaidCssText.includes('.timeline-video-sequence-primary-clip-actions') ||
    !mermaidCssText.includes('@container timeline-player-toolbar (max-width: 420px)') ||
    !mermaidCssText.includes('.timeline-transport-zoom-controls > button') ||
    !mermaidCssText.includes('@container timeline-player-toolbar (max-width: 360px)') ||
    !mermaidCssText.includes('.timeline-video-sequence-tool-strip,\n  .timeline-transport-chrome--mermaid-gantt .timeline-transport-zoom-controls') ||
    !mermaidCssText.includes('.timeline-overflow-action-group--clip-primary {\n    display: none;') ||
    !mermaidCssText.includes('.timeline-tool-menu--utilities .timeline-tool-menu-panel') ||
    !mermaidCssText.includes('.timeline-overflow-action-group') ||
    !mermaidCssText.includes('.timeline-overflow-action-group--clip-primary') ||
    !mermaidCssText.includes('.timeline-overflow-action-group--zoom') ||
    !mermaidCssText.includes('.timeline-overflow-action-group--transport,\n  .timeline-transport-chrome--mermaid-gantt .timeline-overflow-action-group--edit,\n  .timeline-transport-chrome--mermaid-gantt .timeline-overflow-action-group--clip') ||
    !headerToolsText.includes('timeline-overflow-action-group timeline-overflow-action-group--transport') ||
    !headerToolsText.includes('timeline-overflow-action-group timeline-overflow-action-group--edit') ||
    !headerToolsText.includes('timeline-overflow-action-group timeline-overflow-action-group--clip-primary') ||
    !headerToolsText.includes('timeline-overflow-action-group timeline-overflow-action-group--clip') ||
    !headerToolsText.includes('timeline-overflow-action-group timeline-overflow-action-group--zoom') ||
    !headerToolsText.includes("renderMediaPlayerButton('overflow-')") ||
    !headerToolsText.includes("renderTimingSyncButton('overflow-')") ||
    !headerToolsText.includes("key={`overflow-tool-${tool.id}`}") ||
    !headerToolsText.includes("renderClipActionButton(button, 'overflow-')") ||
    !headerToolsText.includes('args.model.zoomControls.actionButtons.map(button => renderZoomButton(button.key))') ||
    !headerToolsText.includes("{renderZoomButton('zoom-out')}") ||
    !headerToolsText.includes("{renderZoomButton('zoom-in')}") ||
    !headerToolsText.includes("className=\"timeline-tool-menu timeline-tool-menu--clip\"") ||
    !headerToolsText.includes("className=\"timeline-tool-menu timeline-tool-menu--zoom\"")
  ) {
    throw new Error('expected BottomPanel timeline toolbar actions to fold into existing dropdown menus during resize')
  }
  if (mermaidCssText.includes('.timeline-tool-menu--utilities {\n  margin-inline-start: auto;')) {
    throw new Error('expected visible timeline icons to fill rightward without an auto spacer before the overflow menu')
  }
  if (headerToolsText.includes("<nav className=\"timeline-tool-menu-panel\" aria-label=\"Timeline fit and center tools\">\n            {renderZoomButton('zoom-out')}")) {
    throw new Error('expected regular zoom menu to avoid duplicating direct zoom-in/out controls')
  }
}
