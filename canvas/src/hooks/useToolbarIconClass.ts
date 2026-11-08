import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui/icons'

export function useToolbarIconClass(): string {
  return getIconSizeClass(useGraphStore(state => state.uiIconScale))
}
