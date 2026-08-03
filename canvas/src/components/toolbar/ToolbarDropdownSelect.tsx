import React from 'react'
import { ChevronDown } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { DropdownPanel } from '@/lib/ui/overlay'
import { emitToolbarDropdownOpen, subscribeToolbarDropdownOpen } from '@/components/toolbar/dropdownOpenEvents'
import { uiPrimaryIconActiveClassName, uiPrimaryIconInactiveClassName } from '@/features/toolbar/ui/toolbarStyles'
import { uiSelectableRowClassName } from 'grph-shared/ui/selectedRowClasses'
import {
  UI_RESPONSIVE_COMPACT_GLYPH_CLASSNAME,
  UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME,
  UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME,
  UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
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
  renderMenuAppend,
  onSelectComplete,
}: ToolbarDropdownSelectProps<T>) {
  const [open, setOpen] = React.useState(false)
  const [expandedOptionId, setExpandedOptionId] = React.useState<string | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const optionButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([])
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
      focusOptionAtIndex(preferredIndex)
    })
    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [activeParentOptionId, enabledOptions, expandedOptionId, focusOptionAtIndex, open, value])
  if (!activeOption) return null

  return (
    <>
      <IconButton
        ref={buttonRef}
        className={`App-toolbar__btn ${open || isButtonActive ? uiPrimaryIconActiveClassName : uiPrimaryIconInactiveClassName}`}
        title={title}
        ariaLabel={title}
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
          <menu
            className={`kg-toolbar-dropdown-menu p-1 flex flex-col gap-1 ${menuWidthClass} list-none m-0 ${UI_THEME_TOKENS.panel.bg} border ${UI_THEME_TOKENS.panel.border} rounded shadow-md`}
            onKeyDown={e => {
              if (!enabledOptions.length) return
              const currentIndex = optionButtonRefs.current.findIndex(option => option === document.activeElement)
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % enabledOptions.length : 0
                focusOptionAtIndex(nextIndex)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                const nextIndex = currentIndex >= 0 ? (currentIndex - 1 + enabledOptions.length) % enabledOptions.length : enabledOptions.length - 1
                focusOptionAtIndex(nextIndex)
                return
              }
              if (e.key === 'Home') {
                e.preventDefault()
                focusOptionAtIndex(0)
                return
              }
              if (e.key === 'End') {
                e.preventDefault()
                focusOptionAtIndex(enabledOptions.length - 1)
              }
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
                    <li className="list-none px-1 py-0.5" aria-hidden="true">
                      <hr className={`border-t ${UI_THEME_TOKENS.panel.border}`} />
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
                      className={`kg-toolbar-dropdown-section-toggle ${UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME} disabled:opacity-50 disabled:cursor-not-allowed ${uiSelectableRowClassName(isActive)}`}
                      disabled={option.disabled}
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
                      title={
                        option.disabled && (option.disabledReason || option.enableHint)
                          ? `${option.title}\n${option.disabledReason || ''}${option.enableHint ? `\n${option.enableHint}` : ''}`
                          : option.title
                      }
                    >
                      {renderOptionContent ? (
                        renderOptionContent(option)
                      ) : (
                        <>
                          <span className="truncate">{option.rowLabel || option.title}</span>
                          {option.valueLabel ? <SelectableRowValue label={option.rowLabel || option.title} value={option.valueLabel} /> : null}
                        </>
                      )}
                      {option.disabled && (option.disabledReason || option.enableHint) ? (
                        <span className={`${UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME} ml-auto text-[10px] text-amber-500/90 text-right`}>
                          {option.disabledReason || option.enableHint}
                        </span>
                      ) : hasChildren ? (
                        <ChevronDown
                          className={`${toolbarDropdownChevronClassName} ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                    {option.disabled && option.enableHint ? (
                      <section className={UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME}>{option.enableHint}</section>
                    ) : null}
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
                                className={`${UI_RESPONSIVE_TOUCH_MENU_OPTION_ROW_CLASSNAME} disabled:opacity-50 disabled:cursor-not-allowed ${uiSelectableRowClassName(isChildActive)}`}
                                disabled={child.disabled}
                                aria-label={child.title}
                                onClick={() => {
                                  if (child.disabled) return
                                  closeMenuNow()
                                  onSelect(child.id)
                                  onSelectComplete?.(child.id)
                                }}
                                title={
                                  child.disabled && (child.disabledReason || child.enableHint)
                                    ? `${child.title}\n${child.disabledReason || ''}${child.enableHint ? `\n${child.enableHint}` : ''}`
                                    : child.title
                                }
                              >
                                {renderOptionContent ? (
                                  renderOptionContent(child)
                                ) : (
                                  <>
                                    <span className="truncate">{child.rowLabel || child.title}</span>
                                    {child.valueLabel ? <SelectableRowValue label={child.rowLabel || child.title} value={child.valueLabel} /> : null}
                                  </>
                                )}
                                {child.disabled && (child.disabledReason || child.enableHint) ? (
                                  <span className={`${UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_META_CLASSNAME} ml-auto text-[10px] text-amber-500/90 text-right`}>
                                    {child.disabledReason || child.enableHint}
                                  </span>
                                ) : null}
                              </button>
                              {child.disabled && child.enableHint ? (
                                <section className={UI_RESPONSIVE_TOOLBAR_DROPDOWN_OPTION_HINT_CLASSNAME}>{child.enableHint}</section>
                              ) : null}
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
          </menu>
        </DropdownPanel>
      ) : null}
    </>
  )
}
