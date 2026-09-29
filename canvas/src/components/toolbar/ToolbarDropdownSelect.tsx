import React from 'react'
import { ChevronDown, LockKeyhole } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { DropdownPanel } from '@/lib/ui/overlay'
import { emitToolbarDropdownOpen, subscribeToolbarDropdownOpen } from '@/components/toolbar/dropdownOpenEvents'
import { uiPrimaryIconActiveClassName, uiPrimaryIconInactiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { DropdownMenuSurface, dropdownMenuOptionClassName } from '@/lib/ui/dropdownMenu'
import { SelectableRowValue } from '@/components/ui/SelectableRowValue'

const toolbarDropdownChevronClassName = `${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} ml-auto opacity-70 transition-transform`

type ToolbarDropdownOptionBase = {
  id: string
  title: string
  rowLabel?: string
  valueLabel?: string
  children?: readonly ToolbarDropdownOptionBase[]
  isActive?: boolean
  dividerBefore?: boolean
  disabled?: boolean
  disabledReason?: string
  enableHint?: string
}

type ToolbarDropdownSelectProps<T extends ToolbarDropdownOptionBase> = {
  value: T['id']
  options: readonly T[]
  title: string
  tooltipContent?: string
  showTooltip?: boolean
  disabled?: boolean
  isButtonActive?: boolean
  menuWidthClass?: string
  onSelect: (id: T['id']) => void
  onTriggerClick?: () => boolean
  renderButtonContent: (activeOption: T) => React.ReactNode
  getOptionTooltip?: (option: T) => string
  renderOptionContent?: (option: T) => React.ReactNode
  renderMenuAppend?: () => React.ReactNode
  onSelectComplete?: (id: T['id']) => void
}

export function ToolbarDropdownSelect<T extends ToolbarDropdownOptionBase>({
  value,
  options,
  title,
  tooltipContent,
  showTooltip = true,
  disabled,
  isButtonActive,
  menuWidthClass = '',
  onSelect,
  onTriggerClick,
  renderButtonContent,
  renderOptionContent,
  getOptionTooltip,
  renderMenuAppend,
  onSelectComplete,
}: ToolbarDropdownSelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [expandedOptionId, setExpandedOptionId] = React.useState<string | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const optionButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const didFocusOpenMenuRef = React.useRef(false)
  const autoExpandedParentOptionIdRef = React.useRef<string | null>(null)
  const dropdownIdRef = React.useRef(`toolbar-dropdown-${Math.random().toString(36).slice(2)}`)
  const activeOption = React.useMemo(() => options.find(option => option.id === value) || options[0], [options, value])
  const enabledOptions = React.useMemo(() => options.filter(option => option.disabled !== true), [options])
  const activeParentOptionId = React.useMemo(
    () =>
      options.find(option =>
        option.children?.some(child => (child.isActive === undefined ? child.id === value : child.isActive)),
      )?.id || null,
    [options, value],
  )
  const getChildrenId = React.useCallback(
    (id: string) => `${dropdownIdRef.current}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}-children`,
    [],
  )
  const focusOptionAtIndex = React.useCallback((index: number) => {
    const optionEl = optionButtonRefs.current[index]
    if (!optionEl) return
    try {
      optionEl.focus({ preventScroll: true })
    } catch {
      optionEl.focus()
    }
  }, [])
  const closeMenuNow = React.useCallback(() => {
    setOpen(false)
    setExpandedOptionId(null)
    autoExpandedParentOptionIdRef.current = null
  }, [])
  React.useEffect(() => {
    return subscribeToolbarDropdownOpen(detail => {
      if (detail.sourceId === dropdownIdRef.current) return
      setOpen(false)
      setExpandedOptionId(null)
      autoExpandedParentOptionIdRef.current = null
    })
  }, [])
  React.useEffect(() => {
    if (!open) {
      didFocusOpenMenuRef.current = false
      optionButtonRefs.current = []
      autoExpandedParentOptionIdRef.current = null
      if (expandedOptionId !== null) setExpandedOptionId(null)
      return
    }
    if (
      activeParentOptionId &&
      expandedOptionId == null &&
      autoExpandedParentOptionIdRef.current !== activeParentOptionId
    ) {
      autoExpandedParentOptionIdRef.current = activeParentOptionId
      setExpandedOptionId(activeParentOptionId)
    }
    const preferredIndex = Math.max(0, enabledOptions.findIndex(option => option.id === value || option.id === activeParentOptionId))
    const rafId = requestAnimationFrame(() => {
      if (!didFocusOpenMenuRef.current) {
        focusOptionAtIndex(preferredIndex)
        didFocusOpenMenuRef.current = true
      }
    })
    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [activeParentOptionId, enabledOptions, expandedOptionId, focusOptionAtIndex, open, value])
  const optionHelp = (option: T) => [getOptionTooltip?.(option) || option.title,
    option.disabled ? option.disabledReason : '', option.disabled ? option.enableHint : ''].filter(Boolean).join('\n')
  const unavailable = <LockKeyhole role="img" aria-label="Unavailable" className={`${UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME} shrink-0`} />
  if (!activeOption) return null

  return (
    <>
      <IconButton
        ref={buttonRef}
        className={`App-toolbar__btn ${open || isButtonActive ? uiPrimaryIconActiveClassName : uiPrimaryIconInactiveClassName}`}
        title={title}
        ariaLabel={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? dropdownIdRef.current : undefined}
        suppressTitleAttribute={!showTooltip}
        tooltipContent={tooltipContent}
        disabled={disabled}
        onClick={() => {
          if (onTriggerClick?.() === true) {
            closeMenuNow()
            return
          }
          const next = !open
          if (next) {
            emitToolbarDropdownOpen(dropdownIdRef.current)
          } else {
            setExpandedOptionId(null)
            autoExpandedParentOptionIdRef.current = null
          }
          setOpen(next)
        }}
        showTooltip={showTooltip}
      >
        {renderButtonContent(activeOption)}
      </IconButton>
      {open ? (
        <DropdownPanel
          anchorRef={buttonRef}
          open={open}
          onClose={() => {
            setOpen(false)
            setExpandedOptionId(null)
            autoExpandedParentOptionIdRef.current = null
          }}
          align="bottom-center"
        >
          <DropdownMenuSurface
            id={dropdownIdRef.current}
            aria-label={title}
            className={menuWidthClass}
            onKeyDown={e => {
              const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-kg-toolbar-option]'))
              if (!rows.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
              e.preventDefault()
              const current = rows.indexOf(document.activeElement as HTMLButtonElement)
              const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
                : (current + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
              rows[next]?.focus()
            }}
          >
            {enabledOptions.map((option, index) => {
              const hasChildren = Boolean(option.children && option.children.length > 0)
              const isExpanded = hasChildren && expandedOptionId === option.id
              const hasActiveChild = option.children?.some(child => (child.isActive === undefined ? child.id === value : child.isActive)) === true
              const isActive = option.isActive === undefined ? option.id === value || hasActiveChild : option.isActive
              const childrenId = hasChildren ? getChildrenId(option.id) : undefined
              return (
                <React.Fragment key={option.id}>
                  {option.dividerBefore ? (
                    <li className="list-none px-1 py-0.5">
                      <hr />
                    </li>
                  ) : null}
                  <li
                    className="list-none"
                  >
                    <button
                      ref={el => {
                        optionButtonRefs.current[index] = el
                      }}
                      type="button"
                      className={`kg-toolbar-dropdown-section-toggle ${dropdownMenuOptionClassName(isActive)}`}
                      data-kg-toolbar-option="true"
                      aria-disabled={option.disabled || undefined}
                      aria-label={option.title}
                      aria-expanded={hasChildren ? isExpanded : undefined}
                      aria-controls={childrenId}
                      onClick={() => {
                        if (option.disabled) return
                        if (hasChildren) {
                          setExpandedOptionId(prev => (prev === option.id ? null : option.id))
                          return
                        }
                        closeMenuNow()
                        onSelect(option.id)
                        onSelectComplete?.(option.id)
                      }}
                      title={optionHelp(option)}
                      aria-description={optionHelp(option)}
                    >
                      {renderOptionContent ? (
                        renderOptionContent(option)
                      ) : (
                        <>
                          <span className="truncate">{option.rowLabel || option.title}</span>
                          {option.valueLabel ? <SelectableRowValue label={option.rowLabel || option.title} value={option.valueLabel} /> : null}
                        </>
                      )}
                      {option.disabled ? unavailable : hasChildren ? (
                        <ChevronDown
                          className={`${toolbarDropdownChevronClassName} ${isExpanded ? 'rotate-180' : ''}`}
                          role="img" aria-label="Expand choices"
                        />
                      ) : null}
                    </button>
                    {option.children && option.children.length > 0 && isExpanded ? (
                      <menu
                        id={childrenId}
                        className="kg-toolbar-dropdown-children kg-click-expand-menu-children mt-1 m-0 flex flex-col gap-1 list-none"
                      >
                        {option.children.map(childRaw => {
                          const child = childRaw as T
                          const isChildActive = child.isActive === undefined ? child.id === value : child.isActive
                          return (
                            <li key={child.id} className="list-none">
                              <button
                                type="button"
                                className={dropdownMenuOptionClassName(isChildActive)}
                                data-kg-toolbar-option="true"
                                aria-disabled={child.disabled || undefined}
                                aria-label={child.title}
                                onClick={() => {
                                  if (child.disabled) return
                                  closeMenuNow()
                                  onSelect(child.id)
                                  onSelectComplete?.(child.id)
                                }}
                                title={optionHelp(child)}
                                aria-description={optionHelp(child)}
                              >
                                {renderOptionContent ? (
                                  renderOptionContent(child)
                                ) : (
                                  <>
                                    <span className="truncate">{child.rowLabel || child.title}</span>
                                    {child.valueLabel ? <SelectableRowValue label={child.rowLabel || child.title} value={child.valueLabel} /> : null}
                                  </>
                                )}
                                {child.disabled ? unavailable : null}
                              </button>
                            </li>
                          )
                        })}
                      </menu>
                    ) : null}
                  </li>
                </React.Fragment>
              )
            })}
            {renderMenuAppend ? renderMenuAppend() : null}
          </DropdownMenuSurface>
        </DropdownPanel>
      ) : null}
    </>
  )
}
