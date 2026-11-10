import type { FloatingPanelShellProps } from '@agentic-base/views-react/panels'

type FloatingPanelRootStyle = NonNullable<FloatingPanelShellProps['rootStyle']>

/** Theme adapter shared by native panels and the store-free browser export. */
export function readFloatingPanelThemeStyle(rootStyle?: FloatingPanelRootStyle, minimized = false): FloatingPanelRootStyle {
  return {
    ...rootStyle,
    '--base-accent': 'var(--kg-accent)',
    '--base-text-primary': 'var(--kg-text-primary)',
    '--base-text-secondary': 'var(--kg-text-secondary)',
    '--base-border': 'var(--kg-border)',
    '--base-panel': 'var(--kg-panel-bg)',
    '--base-shadow-overlay': 'var(--kg-shadow-overlay)',
    '--base-toolbar-compact-padding': minimized
      ? '0 var(--kg-toolbar-compact-pad-x)'
      : 'var(--kg-toolbar-compact-padding)',
  }
}
