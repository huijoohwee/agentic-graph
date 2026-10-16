import React from 'react'
import { fieldKindLabel } from '@/features/graph-fields/graphFields'
import type { GraphFieldKind, GraphFieldScope } from '@/features/graph-fields/graphFields'
import { UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS, UI_ICON_DEFAULTS, normalizeUiIconStrokeWidth } from '@/lib/ui/theme-tokens'

const graphFieldIconDefaultClassName = UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME
const graphFieldIconTertiaryClassName = `${UI_RESPONSIVE_DEFAULT_GLYPH_CLASSNAME} ${UI_THEME_TOKENS.text.tertiary}`

export function resolveFieldTypeIconKind(fieldTypeLabel: string): GraphFieldKind {
  const normalized = String(fieldTypeLabel || '').trim().toLowerCase()
  if (!normalized) return 'string'
  if (
    normalized === 'string' ||
    normalized === 'text' ||
    normalized === 'enum' ||
    normalized === 'mapping' ||
    normalized === 'function' ||
    normalized === 'in' ||
    normalized === 'out'
  ) {
    return 'string'
  }
  if (normalized === 'array' || normalized === 'list') {
    return 'array'
  }
  if (
    normalized === 'number' ||
    normalized === 'int' ||
    normalized === 'integer' ||
    normalized === 'float' ||
    normalized === 'decimal'
  ) {
    return 'number'
  }
  if (normalized === 'bool' || normalized === 'boolean' || normalized === 'checkbox') {
    return 'boolean'
  }
  if (normalized === 'object' || normalized === 'json') {
    return 'object'
  }
  return 'string'
}

export function GripDotsIcon({ className }: { className?: string }) {
  return (
    <svg data-kg-ui-icon="true" viewBox="0 0 24 24" aria-hidden="true" className={className ?? graphFieldIconDefaultClassName}>
      <path
        d="M9 6h2v2H9V6Zm4 0h2v2h-2V6ZM9 11h2v2H9v-2Zm4 0h2v2h-2v-2ZM9 16h2v2H9v-2Zm4 0h2v2h-2v-2Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SearchIcon({
  className,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg data-kg-ui-icon="true"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? graphFieldIconDefaultClassName}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.2-4.2" />
    </svg>
  )
}

export function FieldKeyIcon({
  className,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg data-kg-ui-icon="true"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? graphFieldIconDefaultClassName}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="5" width="16" height="14" rx="1.5" ry="1.5" />
      <path d="M7 9h10M7 12h7M7 15h9" />
    </svg>
  )
}

export function GraphFieldsIcon({
  className,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg data-kg-ui-icon="true"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? graphFieldIconDefaultClassName}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="11" height="14" rx="1.5" ry="1.5" stroke="currentColor" />
      <path d="M7 5v14" opacity="0.9" />
      <path d="M3 9h11" opacity="0.9" />
      <path d="M3 13h11" opacity="0.9" />
      <circle cx="18" cy="8" r="1.75" fill="currentColor" stroke="none" opacity="0.95" />
      <circle cx="18" cy="12" r="1.75" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="18" cy="16" r="1.75" fill="currentColor" stroke="none" opacity="0.85" />
      <path d="M19.7 8l1.8 0" opacity="0.9" />
      <path d="M19.7 12l1.8 0" opacity="0.85" />
      <path d="M19.7 16l1.8 0" opacity="0.8" />
    </svg>
  )
}

export function ScopeIcon({
  scope,
  className,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  scope: GraphFieldScope
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg data-kg-ui-icon="true" strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className ?? graphFieldIconTertiaryClassName}
    >
      {scope === 'node' ? (
        <>
          <circle cx="12" cy="7" r="3" fill="currentColor" opacity="0.9" />
          <circle cx="6" cy="17" r="3" fill="currentColor" opacity="0.8" />
          <circle cx="18" cy="17" r="3" fill="currentColor" opacity="0.8" />
          <path d="M10.2 9.4L7.8 14.2M13.8 9.4l2.4 4.8" stroke="currentColor"  />
        </>
      ) : (
        <>
          <circle cx="7" cy="12" r="3" fill="currentColor" opacity="0.9" />
          <circle cx="17" cy="12" r="3" fill="currentColor" opacity="0.9" />
          <path d="M10 12h4" stroke="currentColor"  />
          <path d="M12 6v12" stroke="currentColor"  opacity="0.25" />
        </>
      )}
    </svg>
  )
}

export function FieldTypeBadgeIcon({
  kind,
  fieldTypeLabel,
  className,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  kind: GraphFieldKind
  fieldTypeLabel?: string
  className?: string
  strokeWidth?: number
}) {
  const label = typeof fieldTypeLabel === 'string' && fieldTypeLabel.trim() ? fieldTypeLabel : fieldKindLabel(kind)
  const safeStrokeWidth = normalizeUiIconStrokeWidth(strokeWidth)
  const iconClassName = [className ?? graphFieldIconDefaultClassName].filter(Boolean).join(' ')
  const iconColor = 'var(--kg-text-secondary, #6b7280)'
  const iconStyle = {
    fill: 'none',
    opacity: 1,
    display: 'block',
    shapeRendering: 'geometricPrecision',
  } as const
  const normalized = label.toLowerCase()
  const isText =
    normalized === 'string' ||
    normalized === 'text' ||
    normalized === 'enum' ||
    normalized === 'mapping' ||
    normalized === 'function' ||
    normalized === 'in' ||
    normalized === 'out' ||
    normalized.includes('single line') ||
    normalized.includes('long text') ||
    normalized.includes('text')
  const isNumber =
    normalized.includes('number') ||
    normalized.includes('decimal') ||
    normalized.includes('currency')
  const isBoolean = normalized.includes('checkbox')
  const isMultiSelect = normalized.includes('multi-select') || normalized.includes('array') || normalized.includes('list')
  const isSingleSelect = normalized.includes('single-select')
  const isDateTime = normalized.includes('date time')
  const isUrl = normalized.includes('url')
  const isJson = normalized.includes('json') || normalized.includes('object')

  return (
    <svg data-kg-ui-icon="true"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={iconClassName}
      style={iconStyle}
      fill="none"
      stroke={iconColor}
      strokeWidth={safeStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {isText ? (
        <>
          <rect x="5" y="6" width="14" height="3" rx="1.5" />
          <rect x="5" y="11" width="10" height="3" rx="1.5" opacity="0.7" />
          <rect x="5" y="16" width="7" height="3" rx="1.5" opacity="0.5" />
        </>
      ) : null}
      {isNumber ? (
        <>
          <circle cx="9" cy="9" r="2" />
          <path d="M15 7h4" />
          <path d="M15 11h4" />
          <path d="M9 13v4" />
        </>
      ) : null}
      {isBoolean ? (
        <>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 12l3 3l4-5" />
        </>
      ) : null}
      {isMultiSelect ? (
        <>
          <rect x="5" y="6" width="6" height="6" rx="1.5" />
          <rect x="13" y="6" width="6" height="6" rx="1.5" opacity="0.8" />
          <rect x="9" y="12" width="6" height="6" rx="1.5" opacity="0.6" />
        </>
      ) : null}
      {isSingleSelect ? (
        <>
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="2.5" fill={iconColor} />
        </>
      ) : null}
      {isDateTime ? (
        <>
          <circle cx="12" cy="12" r="6" />
          <path d="M12 9v3l2 2" />
        </>
      ) : null}
      {isUrl ? (
        <>
          <path d="M9 9h-2.5a3.5 3.5 0 0 0 0 7H9" />
          <path d="M15 9h2.5a3.5 3.5 0 0 1 0 7H15" />
          <path d="M8 12h8" />
        </>
      ) : null}
      {isJson ? (
        <>
          <path d="M8 7l-3 3l3 3" />
          <path d="M16 7l3 3l-3 3" />
          <path d="M11 5l2 14" opacity="0.7" />
        </>
      ) : null}
      {!isText && !isNumber && !isBoolean && !isMultiSelect && !isSingleSelect && !isDateTime && !isUrl && !isJson ? (
        <>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <path d="M9 10h6M9 14h6" />
        </>
      ) : null}
    </svg>
  )
}

export function KindPill({
  kind,
  label,
  className,
  iconClassName,
  iconStrokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  kind: GraphFieldKind
  label?: string
  className?: string
  iconClassName?: string
  iconStrokeWidth?: number
}) {
  const display = typeof label === 'string' && label.trim() ? label : fieldKindLabel(kind)
  return (
    <span
      className={
        className ?? `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-1.5 py-0.5`
      }
      title={display}
      aria-label={display}
    >
      <FieldTypeBadgeIcon
        kind={kind}
        fieldTypeLabel={display}
        className={iconClassName}
        strokeWidth={iconStrokeWidth}
      />
    </span>
  )
}

export function BaseFieldIcon({
  className,
  iconClassName,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  className?: string
  iconClassName?: string
  strokeWidth?: number
}) {
  const label = 'Base field'
  return (
    <span
      className={className ?? 'inline-flex items-center justify-center'}
      title={label}
      aria-label={label}
    >
      <svg data-kg-ui-icon="true"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={iconClassName ?? graphFieldIconDefaultClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="6" width="4" height="12" rx="1.5" />
        <path d="M12.5 8h5.5" opacity="0.9" />
        <path d="M12.5 11.5h4.5" opacity="0.8" />
        <path d="M13.5 15l3.5-3.5" opacity="0.9" />
        <path d="M16 11.5l1.5 1.5" opacity="0.9" />
      </svg>
    </span>
  )
}

export function FieldColorIcon({
  color,
  className,
  iconClassName,
}: {
  color: string
  className?: string
  iconClassName?: string
}) {
  const fill = color && color.trim() ? color : '#9CA3AF'
  return (
    <span className={className ?? 'inline-flex items-center justify-center'} aria-hidden="true">
      <svg data-kg-ui-icon="true"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={iconClassName ?? graphFieldIconDefaultClassName}
      >
        <circle cx="12" cy="12" r="6" fill={fill} />
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" opacity="0.25" />
      </svg>
    </span>
  )
}

export function FieldOriginIcon({
  isCustom,
  className,
  iconClassName,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  isCustom: boolean
  className?: string
  iconClassName?: string
  strokeWidth?: number
}) {
  const label = isCustom ? 'Custom field' : 'Derived field'
  return (
    <span
      className={
        className ??
        `inline-flex items-center justify-center rounded border ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.headerBg} px-1.5 py-0.5`
      }
      title={label}
      aria-label={label}
    >
      <svg data-kg-ui-icon="true"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={iconClassName ?? graphFieldIconDefaultClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isCustom ? (
          <>
            <path d="M6 12l4 4l8-8" />
            <path d="M5 5h4v4" opacity="0.6" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="5" />
            <path d="M9 12h3l2-3" />
          </>
        )}
      </svg>
    </span>
  )
}

export function VisibilityIcon({
  hidden,
  className,
  iconClassName,
  strokeWidth = UI_ICON_DEFAULTS.strokeWidth,
}: {
  hidden: boolean
  className?: string
  iconClassName?: string
  strokeWidth?: number
}) {
  const label = hidden ? 'Hidden field' : 'Visible field'
  return (
    <span
      className={className ?? 'inline-flex items-center justify-center'}
      aria-label={label}
    >
      <svg data-kg-ui-icon="true"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={iconClassName ?? graphFieldIconDefaultClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {hidden ? (
          <>
            <path d="M2 12c2-4 5.5-6.5 10-6.5S20 8 22 12c-2 4-5.5 6.5-10 6.5S4 16 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            <path d="M3 3l18 18" />
          </>
        ) : (
          <>
            <path d="M2 12c2-4 5.5-6.5 10-6.5S20 8 22 12c-2 4-5.5 6.5-10 6.5S4 16 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </span>
  )
}
