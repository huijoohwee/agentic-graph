import React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { DropdownMenuSurface, dropdownMenuOptionClassName } from '@/lib/ui/dropdownMenu'
import { readSemanticSelectOptions } from '@/lib/ui/semanticSelectOptions'
import { emitToolbarDropdownOpen, subscribeToolbarDropdownOpen } from '@/components/toolbar/dropdownOpenEvents'

export type SemanticSelectProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  value?: string | number
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  required?: boolean
  menuTextClassName?: string
}

/** A single-value field backed by the same visible DOM menu as the toolbar. */
export const SemanticSelect = React.forwardRef<HTMLButtonElement, SemanticSelectProps>(function SemanticSelect({
  children, value, defaultValue, onValueChange, disabled, required, name, form, className, style,
  onClick, onKeyDown, menuTextClassName, ...props
}, forwardedRef) {
  const options = React.useMemo(() => readSemanticSelectOptions(children), [children])
  const [localValue, setLocalValue] = React.useState(() => String(defaultValue ?? options.find(option => !option.disabled)?.value ?? ''))
  const selectedValue = String(value ?? localValue)
  const selected = options.find(option => option.value === selectedValue)
  const [open, setOpen] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const [fieldLabel, setFieldLabel] = React.useState('')
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const searchRef = React.useRef({ text: '', at: 0 })
  const id = React.useId()
  const menuId = `${id}-menu`
  const errorId = `${id}-error`
  const label = props['aria-label'] || fieldLabel || props.title || selected?.label || 'Choose value'
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0)
  const focusItem = (index: number) => {
    itemRefs.current[index]?.focus({ preventScroll: true })
    itemRefs.current[index]?.scrollIntoView?.({ block: 'nearest' })
  }
  const close = React.useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }, [])
  const show = () => {
    if (disabled || !enabled.length) return
    emitToolbarDropdownOpen(id)
    setOpen(true)
  }

  React.useLayoutEffect(() => {
    const button = triggerRef.current
    if (!button) return
    // Native label association is retained for fields whose caller supplies a label wrapper.
    const field = button.labels?.[0] || button.closest('dd')?.parentElement?.querySelector('dt')
    if (!field) return
    const copy = field.cloneNode(true) as Element
    copy.querySelectorAll('button,input,menu,svg').forEach(element => element.remove())
    setFieldLabel(copy.textContent?.trim() || '')
  }, [children])
  React.useEffect(() => subscribeToolbarDropdownOpen(detail => {
    if (detail.sourceId !== id) close()
  }), [close, id])
  React.useEffect(() => { if (disabled) close() }, [close, disabled])
  React.useEffect(() => {
    const owner = triggerRef.current?.form
    if (!owner) return
    const reset = () => { setLocalValue(String(defaultValue ?? options.find(option => !option.disabled)?.value ?? '')); setInvalid(false); close() }
    owner.addEventListener('reset', reset)
    return () => owner.removeEventListener('reset', reset)
  }, [close, defaultValue, options])
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const selectedIndex = options.findIndex(option => option.value === selectedValue && !option.disabled)
      focusItem(selectedIndex >= 0 ? selectedIndex : enabled[0])
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  return <>
    <button {...props} ref={element => {
      triggerRef.current = element
      if (typeof forwardedRef === 'function') forwardedRef(element)
      else if (forwardedRef) forwardedRef.current = element
    }} type="button" form={form} disabled={disabled} value={selectedValue}
      className={`${className || ''} inline-flex items-center gap-1`}
      style={style} aria-label={label} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? errorId : props['aria-describedby']}
      data-kg-select="true" data-value={selectedValue}
      onClick={event => { onClick?.(event); if (!event.defaultPrevented) { if (open) close(); else show() } }}
      onKeyDown={event => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation(); show()
        }
      }}>
      <span className="min-w-0 flex-1 truncate">{selected?.label || selectedValue || 'Choose…'}</span>
      <ChevronDown role="img" aria-label="Show choices" className="h-3.5 w-3.5 shrink-0" />
    </button>
    {name || required ? <input type={required ? 'text' : 'hidden'} name={name} form={form}
      className={required ? 'sr-only' : undefined} tabIndex={-1} required={required} disabled={disabled}
      aria-label={`${label} form value`} value={selectedValue} onChange={() => {}}
      onInvalid={event => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus() }} /> : null}
    {invalid && !selectedValue ? <span id={errorId} role="alert">Choose a value.</span> : null}
    {open ? <AnchorOverlay anchorRef={triggerRef} open onClose={() => close()} align="bottom-right" autoFocus={false}>
      <DropdownMenuSurface role="menu" id={menuId} aria-label={label} className={menuTextClassName}
        style={{ '--kg-toolbar-dropdown-width': `${Math.max(220, triggerRef.current?.getBoundingClientRect().width || 0)}px` } as React.CSSProperties}
        onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}
        onKeyDown={event => {
          event.stopPropagation()
          const index = itemRefs.current.findIndex(element => element === document.activeElement)
          const position = enabled.indexOf(index)
          if (event.key === 'Escape') { event.preventDefault(); close(true); return }
          if (event.key === 'Tab') { close(true); return }
          let next: number | undefined
          if (event.key === 'ArrowDown') next = enabled[(position + 1) % enabled.length]
          if (event.key === 'ArrowUp') next = enabled[(position - 1 + enabled.length) % enabled.length]
          if (event.key === 'Home') next = enabled[0]
          if (event.key === 'End') next = enabled.at(-1)
          if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now(), prior = searchRef.current
            const text = now - prior.at > 700 ? event.key.toLowerCase() : prior.text + event.key.toLowerCase()
            searchRef.current = { text, at: now }
            const query = [...text].every(char => char === text[0]) ? text[0] : text
            const ordered = [...enabled.slice(position + 1), ...enabled.slice(0, position + 1)]
            next = ordered.find(candidate => options[candidate].label.toLowerCase().startsWith(query))
          }
          if (next !== undefined) { event.preventDefault(); focusItem(next) }
        }}>
        {options.map((option, index) => <React.Fragment key={`${option.group || ''}:${option.value}:${index}`}>
          {option.group && option.group !== options[index - 1]?.group ? <li role="separator" className="px-2 pt-2 text-xs font-semibold" aria-label={option.group}>{option.group}</li> : null}
          <li role="none" className="list-none min-w-0">
            <button type="button" role="menuitemradio" aria-checked={option.value === selectedValue}
              aria-label={option.label} disabled={option.disabled} tabIndex={-1}
              ref={element => { itemRefs.current[index] = element }}
              className={dropdownMenuOptionClassName(option.value === selectedValue)}
              onClick={() => {
                if (option.disabled) return
                setLocalValue(option.value); setInvalid(false); close(true)
                if (option.value !== selectedValue) onValueChange?.(option.value)
              }}>
              <span className="min-w-0 flex-1 truncate text-left">{option.label}</span>
              {option.value === selectedValue ? <Check role="img" aria-label="Selected" className="h-4 w-4 shrink-0" /> : null}
            </button>
          </li>
        </React.Fragment>)}
      </DropdownMenuSurface>
    </AnchorOverlay> : null}
  </>
})
