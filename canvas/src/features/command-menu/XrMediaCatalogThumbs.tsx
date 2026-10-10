import type { LucideIcon } from 'lucide-react'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import { xrCatalogArtworkDataUri } from 'grph-shared/geospatial/xrCatalogArtwork'

export function XrCatalogArtwork({ assetId = '', label = '', color, Icon }: {
  assetId?: string; label?: string; color: string; Icon: LucideIcon
}) {
  void Icon
  return <img
    src={xrCatalogArtworkDataUri(assetId, label, color)}
    className="h-full w-full rounded"
    role="img"
    alt={`${label || assetId} native illustration`}
    data-kg-xr-catalog-artwork={assetId || label}
  />
}

export function XrCatalogThumb({ Icon, color, assetId, label }: { Icon: LucideIcon; color: string; assetId?: string; label?: string }) {
  return (
    <figure
      className={cn('m-0 grid size-10 shrink-0 place-items-center rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.input.bg)}
      style={{ color }}
      aria-label={`${label || assetId || 'Media library'} preview`}
      data-kg-xr-catalog-selection-target="asset-artwork"
    >
      {assetId || label
        ? <XrCatalogArtwork Icon={Icon} color={color} assetId={assetId} label={label} />
        : <Icon
          className="size-7 max-h-full max-w-full"
          role="img"
          aria-label="Media library"
          data-kg-xr-catalog-artwork="media-library"
        />}
    </figure>
  )
}
