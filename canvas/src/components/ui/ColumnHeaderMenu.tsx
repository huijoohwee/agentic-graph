import { PanelSelect } from '@/lib/ui/panelFormControls'
import React from 'react'
import { ArrowLeft, ArrowRight, EyeOff, Filter, Trash2, Copy, ArrowUp, ArrowDown, ChevronDown, Columns2 } from 'lucide-react'

import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { DetailsMenu } from '@/components/ui/DetailsMenu'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import {
  UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME,
  UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME,
  UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME,
  UI_RESPONSIVE_COLUMN_HEADER_FILTER_PANEL_CLASSNAME,
  UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME,
  UI_RESPONSIVE_COLUMN_HEADER_TYPE_VALUE_CLASSNAME,
  UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME,
  UI_RESPONSIVE_MENU_ROW_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

export type ColumnHeaderMenuFilterOp = string

export type ColumnHeaderMenuProps = {
  ariaLabel: string
  closeMenu: () => void

  typeSummaryLabel: string
  typeValueLabel: string
  renderTypeMenu: (args: { closeMenu: () => void }) => React.ReactNode
  disableTypeChange?: boolean

  onHideInView?: () => void

  filter?: {
    ops: readonly { key: ColumnHeaderMenuFilterOp; label: string }[]
    defaultOp: ColumnHeaderMenuFilterOp
    defaultValue?: string
    onApply: (args: { op: ColumnHeaderMenuFilterOp; value: string }) => void
    isDisabled?: boolean
  }

  onSortAsc?: () => void
  onSortDesc?: () => void
  disableSort?: boolean

  onInsertLeft?: () => void
  onInsertRight?: () => void
  disableInsert?: boolean

  onMoveLeft?: () => void
  onMoveRight?: () => void
  disableMoveLeft?: boolean
  disableMoveRight?: boolean

  onDuplicate?: () => void
  disableDuplicate?: boolean

  onDelete?: () => void
  disableDelete?: boolean
}

const itemBtn = (disabled?: boolean): string => {
  return [
    `${UI_RESPONSIVE_MENU_ROW_CLASSNAME} gap-2 px-2 py-2 rounded text-xs`,
    disabled ? UI_THEME_TOKENS.text.tertiary : UI_THEME_TOKENS.button.hoverBg,
  ].join(' ')
}

const icon14 = ['w-4 h-4 shrink-0', UI_THEME_TOKENS.icon.color].join(' ')

export const ColumnHeaderMenu = React.memo(function ColumnHeaderMenu(props: ColumnHeaderMenuProps) {
  const [filterOp, setFilterOp] = React.useState(props.filter?.defaultOp || 'contains')
  const [filterValue, setFilterValue] = React.useState(props.filter?.defaultValue || '')
  const [isTypeOpen, setIsTypeOpen] = React.useState(false)
  const typeMenuId = React.useId()

  React.useEffect(() => {
    if (!props.filter) return
    setFilterOp(props.filter.defaultOp)
    setFilterValue(props.filter.defaultValue || '')
  }, [props.filter?.defaultOp, props.filter?.defaultValue])

  React.useEffect(() => {
    setIsTypeOpen(false)
  }, [props.ariaLabel])

  return (
    <menu
      className={[UI_RESPONSIVE_COLUMN_HEADER_MENU_PANEL_CLASSNAME, 'rounded border shadow-sm p-1', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}
      aria-label={props.ariaLabel}
    >
      <li className="list-none">
        <details
          className="min-w-0"
          open={isTypeOpen}
        >
          <summary
            className={[itemBtn(props.disableTypeChange), 'list-none'].join(' ')}
            aria-disabled={props.disableTypeChange}
            aria-expanded={isTypeOpen}
            aria-controls={typeMenuId}
            onClick={e => {
              e.preventDefault()
              if (props.disableTypeChange) return
              setIsTypeOpen(prev => !prev)
            }}
          >
            <Columns2 className={icon14} aria-hidden="true" />
            <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>{props.typeSummaryLabel}</span>
            <span className={[UI_RESPONSIVE_COLUMN_HEADER_TYPE_VALUE_CLASSNAME, UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.secondary].join(' ')}>{props.typeValueLabel}</span>
            <ChevronDown className={[icon14, 'transition-transform', isTypeOpen ? 'rotate-180' : ''].join(' ')} aria-hidden="true" />
          </summary>
          <section id={typeMenuId} className="kg-column-header-children kg-click-expand-menu-children mt-1">
            {props.renderTypeMenu({ closeMenu: props.closeMenu })}
          </section>
        </details>
      </li>

      <li className="list-none">
        <hr className={['my-1', UI_THEME_TOKENS.panel.border].join(' ')} />
      </li>

      <li className="list-none">
        <button
          type="button"
          className={itemBtn(!props.onHideInView)}
          disabled={!props.onHideInView}
          onClick={() => {
            props.onHideInView?.()
            props.closeMenu()
          }}
        >
          <EyeOff className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Hide In View</span>
        </button>
      </li>

      <li className="list-none">
        <hr className={['my-1', UI_THEME_TOKENS.panel.border].join(' ')} />
      </li>

      {props.filter ? (
        <li className="list-none">
          <DetailsMenu
            ariaLabel="Filter"
            detailsClassName="relative"
            summaryClassName={itemBtn(Boolean(props.filter.isDisabled))}
            menuClassName="absolute left-0 mt-1"
            summary={
              <>
                <Filter className={icon14} aria-hidden="true" />
                <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Filter</span>
                <ArrowRight className={icon14} aria-hidden="true" />
              </>
            }
            menu={({ close }) => (
              <section
                className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_PANEL_CLASSNAME, 'rounded border shadow-sm p-2', UI_THEME_TOKENS.panel.bg, UI_THEME_TOKENS.panel.border].join(' ')}
                aria-label="Filter editor"
              >
                <header className="mb-2 flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    className={[UI_RESPONSIVE_MENU_ICON_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(
                      ' ',
                    )}
                    aria-label="Back"
                    onClick={() => close()}
                  >
                    <ArrowLeft className={icon14} aria-hidden="true" />
                  </button>
                  <section className={['min-w-0 font-medium text-sm', UI_TEXT_TRUNCATE, UI_THEME_TOKENS.text.primary].join(' ')}>Filter</section>
                </header>

                <fieldset className="border-0 p-0 m-0 space-y-2">
                  <label className="flex min-w-0 items-center gap-2">
                    <span className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME, 'text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>Op</span>
                    <PanelSelect
                      className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME, 'rounded border', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg].join(' ')}
                      value={filterOp}
                      onValueChange={selectedValueInput => setFilterOp(selectedValueInput)}
                      disabled={props.filter?.isDisabled}
                    >
                      {props.filter.ops.map(o => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </PanelSelect>
                  </label>
                  <label className="flex min-w-0 items-center gap-2">
                    <span className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_LABEL_CLASSNAME, 'text-xs', UI_THEME_TOKENS.text.secondary].join(' ')}>Value</span>
                    <input
                      className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_FIELD_CLASSNAME, 'rounded border', UI_THEME_TOKENS.input.border, UI_THEME_TOKENS.input.bg].join(' ')}
                      value={filterValue}
                      onChange={e => setFilterValue(e.target.value)}
                      disabled={props.filter?.isDisabled}
                    />
                  </label>

                  <section className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
                      onClick={() => close()}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={[UI_RESPONSIVE_COLUMN_HEADER_FILTER_ACTION_CLASSNAME, 'rounded border', UI_THEME_TOKENS.panel.border, UI_THEME_TOKENS.button.hoverBg].join(' ')}
                      disabled={props.filter?.isDisabled}
                      onClick={() => {
                        if (props.filter?.isDisabled) return
                        props.filter.onApply({ op: filterOp, value: String(filterValue ?? '') })
                        props.closeMenu()
                      }}
                    >
                      Apply
                    </button>
                  </section>
                </fieldset>
              </section>
            )}
          />
        </li>
      ) : (
        <li className="list-none">
          <button type="button" className={itemBtn(true)} disabled>
            <Filter className={icon14} aria-hidden="true" />
            <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Filter</span>
          </button>
        </li>
      )}

      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableSort || !props.onSortAsc))}
          disabled={Boolean(props.disableSort || !props.onSortAsc)}
          onClick={() => {
            props.onSortAsc?.()
            props.closeMenu()
          }}
        >
          <ArrowUp className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Sort Ascending</span>
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableSort || !props.onSortDesc))}
          disabled={Boolean(props.disableSort || !props.onSortDesc)}
          onClick={() => {
            props.onSortDesc?.()
            props.closeMenu()
          }}
        >
          <ArrowDown className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Sort Descending</span>
        </button>
      </li>

      <li className="list-none">
        <hr className={['my-1', UI_THEME_TOKENS.panel.border].join(' ')} />
      </li>

      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableInsert || !props.onInsertLeft))}
          disabled={Boolean(props.disableInsert || !props.onInsertLeft)}
          onClick={() => {
            props.onInsertLeft?.()
            props.closeMenu()
          }}
        >
          <ArrowLeft className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Insert Left Column</span>
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableInsert || !props.onInsertRight))}
          disabled={Boolean(props.disableInsert || !props.onInsertRight)}
          onClick={() => {
            props.onInsertRight?.()
            props.closeMenu()
          }}
        >
          <ArrowRight className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Insert Right Column</span>
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableMoveLeft || !props.onMoveLeft))}
          disabled={Boolean(props.disableMoveLeft || !props.onMoveLeft)}
          onClick={() => {
            props.onMoveLeft?.()
            props.closeMenu()
          }}
        >
          <ArrowLeft className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Move Left</span>
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableMoveRight || !props.onMoveRight))}
          disabled={Boolean(props.disableMoveRight || !props.onMoveRight)}
          onClick={() => {
            props.onMoveRight?.()
            props.closeMenu()
          }}
        >
          <ArrowRight className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Move Right</span>
        </button>
      </li>

      <li className="list-none">
        <hr className={['my-1', UI_THEME_TOKENS.panel.border].join(' ')} />
      </li>

      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableDuplicate || !props.onDuplicate))}
          disabled={Boolean(props.disableDuplicate || !props.onDuplicate)}
          onClick={() => {
            props.onDuplicate?.()
            props.closeMenu()
          }}
        >
          <Copy className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Duplicate</span>
        </button>
      </li>
      <li className="list-none">
        <button
          type="button"
          className={itemBtn(Boolean(props.disableDelete || !props.onDelete))}
          disabled={Boolean(props.disableDelete || !props.onDelete)}
          onClick={() => {
            props.onDelete?.()
            props.closeMenu()
          }}
        >
          <Trash2 className={icon14} aria-hidden="true" />
          <span className={['min-w-0 flex-1 text-left', UI_TEXT_TRUNCATE].join(' ')}>Delete</span>
        </button>
      </li>
    </menu>
  )
})
