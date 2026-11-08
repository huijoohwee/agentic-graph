import { Box, Image as ImageIcon, Mic2 } from 'lucide-react'
import { useToolbarIconClass } from '@/hooks/useToolbarIconClass'
import { ToggleButton } from '@agentic-base/views-react/controls'
import type { MediaCatalogMode } from './mediaCatalogModeRuntime'

const modes = [
  { value: 'media', label: 'Media', action: 'Show media library', Icon: ImageIcon, marker: 'data-kg-media-library-toggle' },
  { value: 'xr-3d', label: '3D for XR', action: 'Show 3D assets for XR', Icon: Box, marker: 'data-kg-media-3d-toggle' },
  { value: 'voice-studio', label: 'AI Voice Studio', action: 'Show AI Voice Studio', Icon: Mic2, marker: 'data-kg-media-voice-toggle' },
] as const

export function MediaCatalogModeControls({ mode, onChange, context = 'library' }: {
  mode: MediaCatalogMode
  onChange: (mode: MediaCatalogMode) => void
  context?: 'library' | 'preview'
}) {
  const iconClass = useToolbarIconClass()
  return (
    <nav className="agentic-toggle-group" aria-label={context === 'preview' ? 'Preview modes' : 'Media catalog mode'} data-kg-media-mode-switcher="header-icons">
      {modes.map(({ value, label, action, Icon, marker }) => (
        <ToggleButton key={value} title={label} aria-label={context === 'preview' ? `Preview ${label}` : action} pressed={mode === value}
          {...{ [marker]: '1' }} onClick={() => onChange(value)}>
          <Icon className={iconClass} role="img" aria-label={label} />
          {context === 'preview' ? <span>{label}</span> : null}
        </ToggleButton>
      ))}
    </nav>
  )
}
