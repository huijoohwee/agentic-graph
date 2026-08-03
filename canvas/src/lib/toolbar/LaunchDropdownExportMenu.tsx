import React from 'react'
import { ChevronDown, Download } from 'lucide-react'
import { WORKSPACE_EXPORT_MENU_ITEMS, type ExportMenuActionKey } from '@/lib/toolbar/exportMenuSsot'
import { WorkspaceLaunchRowValue } from './WorkspaceLaunchRowValue'

export type LaunchDropdownExportActions = Partial<Record<ExportMenuActionKey, () => void>>

type LaunchDropdownExportMenuProps = {
  canExport: boolean
  exportActions: LaunchDropdownExportActions
  exportMenuOpen: boolean
  pdfMenuOpen: boolean
  menuItemClass: string
  menuIconClass: string
  openExportMenu: () => void
  closeExportMenu: () => void
  openPdfMenu: () => void
  closePdfMenu: () => void
  runExportAction: (label: string, action: (() => void) | undefined) => void
}

const NON_PDF_EXPORT_ITEMS = WORKSPACE_EXPORT_MENU_ITEMS.filter(
  item => item.id !== 'pdfPortrait' && item.id !== 'pdfLandscape',
)

const EXPORT_ACTION_KEYS: readonly ExportMenuActionKey[] = [
  'duplicateInWorkspace',
  'workspaceFileJsonLd',
  'markdown',
  'png',
  'gltf',
  'glb',
  'htmlWorkspace',
  'htmlViewer',
  'htmlCanvas',
  'json',
  'csv',
  'svg',
  'pdfPortrait',
  'pdfLandscape',
]

export const hasLaunchDropdownExportActions = (actions: LaunchDropdownExportActions): boolean =>
  EXPORT_ACTION_KEYS.some(key => typeof actions[key] === 'function')

export const resolveLaunchDropdownVisibleExportItems = (actions: LaunchDropdownExportActions) =>
  NON_PDF_EXPORT_ITEMS.filter(item => typeof actions[item.id] === 'function')

export function LaunchDropdownExportMenu({
  canExport,
  exportActions,
  exportMenuOpen,
  pdfMenuOpen,
  menuItemClass,
  menuIconClass,
  openExportMenu,
  closeExportMenu,
  openPdfMenu,
  closePdfMenu,
  runExportAction,
}: LaunchDropdownExportMenuProps) {
  const canExportPdf = Boolean(exportActions.pdfPortrait || exportActions.pdfLandscape)
  const visibleExportItems = React.useMemo(() => resolveLaunchDropdownVisibleExportItems(exportActions), [exportActions])
  const exportMenuClass = 'kg-launch-menu-children kg-click-expand-menu-children mt-1 m-0 flex flex-col list-none'
  const pdfExportMenuClass = 'kg-launch-menu-children kg-click-expand-menu-children mt-1 m-0 flex flex-col list-none'
  const exportMenuId = React.useId()
  const pdfMenuId = React.useId()

  return (
    <li className="list-none">
      <section>
        <button
          type="button"
          className={menuItemClass}
          aria-label="Export"
          disabled={!canExport}
          aria-expanded={canExport ? exportMenuOpen : undefined}
          aria-controls={canExport ? exportMenuId : undefined}
          onClick={() => {
            if (!canExport) return
            if (exportMenuOpen) closeExportMenu()
            else openExportMenu()
          }}
        >
          <Download className={menuIconClass} strokeWidth={1.6} />
          <span className="truncate">Export</span>
          <WorkspaceLaunchRowValue label="Export" value="Configure" optionId="export:configure" />
          <ChevronDown className={`ml-auto ${menuIconClass} transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} strokeWidth={1.6} aria-hidden="true" />
        </button>
        {exportMenuOpen ? (
          <menu id={exportMenuId} className={exportMenuClass} aria-label="Export">
            {visibleExportItems.map(item => (
              <li key={item.id} className="list-none">
                <button
                  type="button"
                  className={menuItemClass}
                  onPointerDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    runExportAction(item.toastLabel, exportActions[item.id])
                  }}
                >
                  <span className="truncate">{item.menuLabel}</span>
                </button>
              </li>
            ))}
            {canExportPdf ? (
              <li className="list-none">
                <section>
                  <button
                    type="button"
                    className={menuItemClass}
                    aria-expanded={pdfMenuOpen}
                    aria-controls={pdfMenuId}
                    onClick={() => {
                      if (pdfMenuOpen) closePdfMenu()
                      else openPdfMenu()
                    }}
                  >
                    <span className="truncate">PDF (.pdf) — Print…</span>
                    <ChevronDown className={`ml-auto ${menuIconClass} transition-transform ${pdfMenuOpen ? 'rotate-180' : ''}`} strokeWidth={1.6} aria-hidden="true" />
                  </button>
                  {pdfMenuOpen ? (
                    <menu id={pdfMenuId} className={pdfExportMenuClass} aria-label="PDF export orientation">
                      <li className="list-none">
                        <button
                          type="button"
                          className={menuItemClass}
                          onClick={() => {
                            runExportAction('PDF Portrait', exportActions.pdfPortrait)
                          }}
                        >
                          <span className="truncate">Portrait 9:16</span>
                        </button>
                      </li>
                      <li className="list-none">
                        <button
                          type="button"
                          className={menuItemClass}
                          onClick={() => {
                            runExportAction('PDF Landscape', exportActions.pdfLandscape)
                          }}
                        >
                          <span className="truncate">Landscape 16:9</span>
                        </button>
                      </li>
                    </menu>
                  ) : null}
                </section>
              </li>
            ) : null}
          </menu>
        ) : null}
      </section>
    </li>
  )
}
