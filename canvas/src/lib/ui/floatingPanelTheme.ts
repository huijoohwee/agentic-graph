import type React from 'react'

/** Theme adapter shared by native panels and the store-free browser export. */
export function readFloatingPanelThemeStyle(rootStyle?: React.CSSProperties, minimized = false): React.CSSProperties {
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
    '--base-control-height': 'var(--kg-toolbar-compact-surface-height)',
  } as React.CSSProperties
}
