import React from 'react'
import { Cloud, Database, KeyRound, Waypoints, type LucideIcon } from 'lucide-react'
import { useCanvasKeyTypeValueStaticRowProps } from '@/features/panels/ui/canvasKeyTypeValueRuntime'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { HELP_STEP_COPY } from '@/features/panels/config'
import {
  CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES,
  type CloudflareMediaAssetService,
} from '@/lib/storage/cloudflareMediaAssetTopology'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'
import {
  KeyTypeValueHeader,
  KeyTypeValueSectionStack,
} from 'grph-shared/react/keyTypeValueLayout'
import { KeyTypeValueStaticRow } from 'grph-shared/react/keyTypeValueRow'

interface HelpCloudflareMediaSectionProps {
  collapsed: boolean
  onToggle: (next: boolean) => void
}

function getCloudflareMediaAssetServiceIcon(serviceId: CloudflareMediaAssetService['id']): LucideIcon {
  if (serviceId === 'r2') return Cloud
  if (serviceId === 'd1') return Database
  if (serviceId === 'kv') return KeyRound
  return Waypoints
}

function CloudflareMediaAssetServiceType({
  service,
}: {
  service: CloudflareMediaAssetService
}) {
  const Icon = getCloudflareMediaAssetServiceIcon(service.id)
  return (
    <span className="inline-flex min-w-0 max-w-full items-center justify-start gap-1 overflow-hidden sm:justify-end" title={service.owner}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', UI_THEME_TOKENS.text.secondary)} strokeWidth={1.7} aria-hidden />
      <span className={cn('min-w-0 truncate text-xs', UI_THEME_TOKENS.text.tertiary)}>{service.owner}</span>
    </span>
  )
}

function CloudflareMediaAssetServiceRow({
  service,
  compactStaticRowProps,
}: {
  service: CloudflareMediaAssetService
  compactStaticRowProps: Pick<
    React.ComponentProps<typeof KeyTypeValueStaticRow>,
    'textSizeClassName' | 'fontClassName' | 'densityClassName' | 'activeClassName'
  >
}) {
  return (
    <section
      data-kg-main-panel-cloudflare-media-service={service.id}
      data-kg-main-panel-cloudflare-binding={service.bindingName}
    >
      <KeyTypeValueStaticRow
        {...compactStaticRowProps}
        align="start"
        keyNode={(
          <span className="flex min-w-0 flex-col leading-4">
            <span className={cn('truncate font-semibold', UI_THEME_TOKENS.text.primary)}>{service.label}</span>
            <span className={cn('truncate font-mono text-xs font-normal', UI_THEME_TOKENS.text.tertiary)}>{service.bindingName}</span>
          </span>
        )}
        typeNode={<CloudflareMediaAssetServiceType service={service} />}
        valueNode={(
          <span className="flex min-w-0 flex-col leading-4">
            <span className={cn('truncate font-mono text-xs', UI_THEME_TOKENS.text.secondary)} title={service.contract}>
              {service.contract}
            </span>
            <a
              className={cn('truncate text-xs underline-offset-2 hover:underline', UI_THEME_TOKENS.text.tertiary)}
              href={service.docsUrl}
              target="_blank"
              rel="noreferrer"
              title={service.behavior}
            >
              {service.behavior}
            </a>
          </span>
        )}
      />
    </section>
  )
}

export function HelpCloudflareMediaSection({ collapsed, onToggle }: HelpCloudflareMediaSectionProps) {
  const compactStaticRowProps = useCanvasKeyTypeValueStaticRowProps('compact')

  return (
    <CollapsibleSection
      title={HELP_STEP_COPY.cloudflareMedia.title}
      collapsed={collapsed}
      onToggle={onToggle}
    >
      {HELP_STEP_COPY.cloudflareMedia.descriptionShort && (
        <section className={cn('mb-2 text-xs', UI_THEME_TOKENS.text.secondary)}>
          {HELP_STEP_COPY.cloudflareMedia.descriptionShort}
        </section>
      )}
      <section aria-label="Cloudflare media storage runtime" data-kg-main-panel-cloudflare-media-section="1">
        <KeyTypeValueHeader keyLabel="Service" typeLabel="Owner" valueLabel="Runtime contract / docs" stickyOffsetClassName="top-0" />
        <KeyTypeValueSectionStack>
          {CLOUDFLARE_MEDIA_ASSET_SYNC_SERVICES.map(service => (
            <CloudflareMediaAssetServiceRow
              key={service.id}
              service={service}
              compactStaticRowProps={compactStaticRowProps}
            />
          ))}
        </KeyTypeValueSectionStack>
      </section>
    </CollapsibleSection>
  )
}
