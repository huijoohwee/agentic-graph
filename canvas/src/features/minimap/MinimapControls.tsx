import { Map as MapIcon, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { dispatchRuntimeZoomActionSoon } from '@/lib/canvas/runtimeZoomDispatch'
import { UI_LABELS } from '@/lib/config'

interface MinimapControlsProps {
  collapsed: boolean
  opacity: number
  onToggle: (collapsed: boolean) => void
}

export function MinimapControls({ collapsed, opacity, onToggle }: MinimapControlsProps) {
  return (
    <section className={collapsed ? undefined : 'absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100'}>
      <IconButton
        icon={MapIcon}
        title={collapsed ? 'Show Minimap' : 'Hide Minimap'}
        aria-expanded={!collapsed}
        onClick={() => onToggle(!collapsed)}
        style={collapsed ? { opacity } : undefined}
      />
      {!collapsed && <>
        <IconButton icon={RotateCcw} title={UI_LABELS.reset} onClick={() => dispatchRuntimeZoomActionSoon('reset')} />
        <IconButton icon={ZoomIn} title={UI_LABELS.zoomIn} onClick={() => dispatchRuntimeZoomActionSoon('in')} />
        <IconButton icon={ZoomOut} title={UI_LABELS.zoomOut} onClick={() => dispatchRuntimeZoomActionSoon('out')} />
      </>}
    </section>
  )
}
