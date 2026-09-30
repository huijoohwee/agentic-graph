import { Box, Image as ImageIcon, Mic2 } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
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
  return (
    <nav className={cn('inline-flex max-w-full flex-wrap overflow-hidden rounded border', UI_THEME_TOKENS.panel.border)} aria-label={context === 'preview' ? 'Preview modes' : 'Media catalog mode'} data-kg-media-mode-switcher="header-icons">
      {modes.map(({ value, label, action, Icon, marker }) => (
        <button key={value} type="button" title={label} aria-label={context === 'preview' ? `Preview ${label}` : action} aria-pressed={mode === value}
          {...{ [marker]: '1' }} onClick={() => onChange(value)}
          className={cn('inline-flex min-h-7 items-center justify-center gap-1 px-2 text-xs', mode === value ? UI_THEME_TOKENS.button.activeBg : UI_THEME_TOKENS.button.hoverBg)}>
          <Icon className="size-3.5 shrink-0" role="img" aria-label={label} />
          {context === 'preview' ? <span>{label}</span> : null}
        </button>
      ))}
    </nav>
  )
}
