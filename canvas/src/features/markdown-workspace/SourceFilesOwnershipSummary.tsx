import React from 'react'
import { HardDrive, ShieldCheck, Users } from 'lucide-react'
import { DOCUMENT_REPOSITORY_DISPLAY_ROOTS } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_TEXT_TRUNCATE } from '@/lib/ui/textLayout'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const OWNERSHIP_ROWS = [
  {
    id: 'product',
    label: 'Product',
    root: DOCUMENT_REPOSITORY_DISPLAY_ROOTS.knowgrphDocs,
    Icon: ShieldCheck,
  },
  {
    id: 'workspace',
    label: 'Workspace',
    root: DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceDocs,
    Icon: Users,
  },
  {
    id: 'seeds',
    label: 'Seeds',
    root: DOCUMENT_REPOSITORY_DISPLAY_ROOTS.workspaceSeeds,
    Icon: ShieldCheck,
  },
  {
    id: 'offline',
    label: 'Offline',
    root: DOCUMENT_REPOSITORY_DISPLAY_ROOTS.offlineFallback,
    Icon: HardDrive,
  },
] as const

export function SourceFilesOwnershipSummary() {
  const typography = usePanelTypography()
  return (
    <section
      className={`kg-source-files-ownership border-b px-2 py-1 ${UI_THEME_TOKENS.panel.border}`}
      aria-label="Source Files storage ownership"
    >
      <dl className="m-0 grid gap-0.5">
        {OWNERSHIP_ROWS.map(({ id, label, root, Icon }) => (
          <div key={id} className={`min-w-0 flex items-center gap-1.5 ${typography.microLabelClass}`}>
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <dt className={`w-14 shrink-0 ${UI_THEME_TOKENS.text.secondary}`}>{label}</dt>
            <dd className={`m-0 min-w-0 flex-1 ${UI_TEXT_TRUNCATE} ${UI_THEME_TOKENS.text.primary}`} title={root}>
              {root}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
