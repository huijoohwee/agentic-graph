import React from 'react'

import { X } from 'lucide-react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { getIconSizeClass } from '@/lib/ui'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { cn } from '@/lib/utils'

type FlowManagerRegistrySectionHeaderProps = {
  title: string
  actionLabel: string
  className?: string
  onAction: () => void
}

export function FlowManagerRegistrySectionHeader({
  title,
  actionLabel,
  className,
  onAction,
}: FlowManagerRegistrySectionHeaderProps) {
  return (
    <section className={className}>
      <h4 className={cn('text-xs font-semibold uppercase tracking-normal', UI_THEME_TOKENS.text.secondary)}>{title}</h4>
      <button type="button" className={`App-toolbar__btn ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`} onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  )
}

type FlowManagerRegistryItemCardProps = {
  className?: string
  gridClassName?: string
  footer?: React.ReactNode
  children: React.ReactNode
}

export function FlowManagerRegistryItemCard({
  className,
  gridClassName,
  footer,
  children,
}: FlowManagerRegistryItemCardProps) {
  return (
    <section className={className}>
      <section className={gridClassName}>{children}</section>
      {footer}
    </section>
  )
}

type FlowManagerRegistryRemoveButtonProps = {
  ariaLabel: string
  onClick: () => void
}

export function FlowManagerRegistryRemoveButton({ ariaLabel, onClick }: FlowManagerRegistryRemoveButtonProps) {
  const uiIconScale = useGraphStore(s => s.uiIconScale)
  const iconSizeClass = getIconSizeClass(uiIconScale)

  return (
    <button
      type="button"
      className={cn('App-toolbar__btn', UI_THEME_TOKENS.button.text, UI_THEME_TOKENS.button.hoverBg)}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <X className={iconSizeClass} aria-hidden="true" />
    </button>
  )
}

type FlowManagerRegistryEmptyStateProps = {
  className?: string
  children: React.ReactNode
}

export function FlowManagerRegistryEmptyState({ className, children }: FlowManagerRegistryEmptyStateProps) {
  return <section className={className}>{children}</section>
}
