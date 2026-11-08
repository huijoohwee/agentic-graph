import { ToggleButton, ToggleButtonGroup } from '@agentic-base/views-react/controls'
import { Grid2X2, List, Rows3 } from 'lucide-react'
import { useToolbarIconClass } from '@/hooks/useToolbarIconClass'
import type { MediaCatalogLayout } from './mediaCatalogTypes'

const layouts = [
  { value: 'list', label: 'List layout', Icon: List },
  { value: 'card', label: 'Card layout', Icon: Rows3 },
  { value: 'grid', label: 'Grid layout', Icon: Grid2X2 },
] as const

type Props = {
  context: 'library' | 'preview'
  layout: MediaCatalogLayout
  onChange: (value: MediaCatalogLayout) => void
}

export function MediaCatalogLayoutControls({ context, layout, onChange }: Props) {
  const iconClass = useToolbarIconClass()
  const library = context === 'library'
  return (
    <ToggleButtonGroup aria-label={library ? 'Media layout' : 'Preview layout'} data-kg-media-layout-selector={library ? '1' : undefined}>
      {layouts.map(({ value, label, Icon }) => {
        const name = library ? label : `Preview ${value} layout`
        return (
          <ToggleButton key={value} title={name} aria-label={name} pressed={layout === value}
            data-kg-media-layout-toggle={library ? value : undefined} onClick={() => onChange(value)}>
            <Icon className={iconClass} aria-hidden />
          </ToggleButton>
        )
      })}
    </ToggleButtonGroup>
  )
}
