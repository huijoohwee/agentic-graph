import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { FileText, GitMerge, Table, Tags } from 'lucide-react'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import { UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

type DocumentModeSelectProps = {
  iconSizeClass: string
  iconStrokeWidth: number
  ensureBaselineUnlocked: () => boolean
}

type DocumentModeValue = 'documentStructure' | 'keyword' | 'frontmatter' | 'multiDimTable'

export function DocumentModeSelect({ iconSizeClass, iconStrokeWidth, ensureBaselineUnlocked }: DocumentModeSelectProps) {
  const {
    documentSemanticMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    canvasRenderMode,
    canvas2dRenderer,
    setDocumentSemanticMode,
    setFrontmatterModeEnabled,
    setMultiDimTableModeEnabled,
  } = useGraphStore(
    useShallow(s => ({
      documentSemanticMode: s.documentSemanticMode || 'document',
      frontmatterModeEnabled: s.frontmatterModeEnabled === true,
      multiDimTableModeEnabled: s.multiDimTableModeEnabled === true,
      canvasRenderMode: s.canvasRenderMode,
      canvas2dRenderer: s.canvas2dRenderer,
      setDocumentSemanticMode: s.setDocumentSemanticMode,
      setFrontmatterModeEnabled: s.setFrontmatterModeEnabled,
      setMultiDimTableModeEnabled: s.setMultiDimTableModeEnabled,
    })),
  )
  const frontmatterOnlyAllowed = isFrontmatterOnlyPolicyActive({ canvasRenderMode, canvas2dRenderer })

  const activeMode: DocumentModeValue = multiDimTableModeEnabled
    ? 'multiDimTable'
    : frontmatterModeEnabled
      ? 'frontmatter'
      : documentSemanticMode === 'keyword'
        ? 'keyword'
        : 'documentStructure'

  const options = React.useMemo(
    () =>
      [
        {
          value: 'documentStructure' as const,
          label: UI_LABELS.documentStructureMode,
          tooltip: UI_COPY.documentStructureModeTooltip,
          Icon: FileText,
          disabled: frontmatterOnlyAllowed,
          disabledReason: frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
        {
          value: 'keyword' as const,
          label: UI_LABELS.keywordMode,
          tooltip: UI_COPY.keywordModeTooltip,
          Icon: Tags,
          disabled: frontmatterOnlyAllowed,
          disabledReason: frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
        {
          value: 'frontmatter' as const,
          label: UI_LABELS.frontmatterMode,
          tooltip: UI_COPY.frontmatterModeTooltip,
          Icon: GitMerge,
        },
        {
          value: 'multiDimTable' as const,
          label: UI_LABELS.multiDimTableMode,
          tooltip: UI_COPY.multiDimTableModeTooltip,
          Icon: Table,
          disabled: frontmatterOnlyAllowed,
          disabledReason: frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
      ] satisfies Array<{
        value: DocumentModeValue
        label: string
        tooltip: string
        Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
        disabled?: boolean
        disabledReason?: string
      }>,
    [frontmatterOnlyAllowed],
  )

  const activeOption = options.find(o => o.value === activeMode) || options[0]
  const triggerTooltip = activeOption.tooltip

  const applyMode = React.useCallback(
    (next: DocumentModeValue) => {
      if (!ensureBaselineUnlocked()) return
      if (frontmatterOnlyAllowed) {
        if (!frontmatterModeEnabled) setFrontmatterModeEnabled(true)
        if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
        setDocumentSemanticMode('document')
        return
      }

      if (next === 'documentStructure') {
        if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
        if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
        setDocumentSemanticMode('document')
        return
      }
      if (next === 'keyword') {
        if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
        if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
        setDocumentSemanticMode('keyword')
        return
      }
      if (next === 'frontmatter') {
        setFrontmatterModeEnabled(true)
        return
      }
      setMultiDimTableModeEnabled(true)
    },
    [
      ensureBaselineUnlocked,
      frontmatterModeEnabled,
      multiDimTableModeEnabled,
      frontmatterOnlyAllowed,
      setDocumentSemanticMode,
      setFrontmatterModeEnabled,
      setMultiDimTableModeEnabled,
    ],
  )

  return (
    <ToolbarDropdownSelect
      value={activeMode}
      options={options.map(option => ({
        id: option.value,
        title: option.label,
        tooltip: option.tooltip,
        Icon: option.Icon,
        disabled: option.disabled,
        disabledReason: option.disabledReason,
      }))}
      title={activeOption.label}
      tooltipContent={triggerTooltip}
      onSelect={id => applyMode(id)}
      renderButtonContent={active => (
        <active.Icon className={iconSizeClass} strokeWidth={iconStrokeWidth} />
      )}
      renderOptionContent={option => (
        <>
          <option.Icon role="img" aria-label={option.title} className={iconSizeClass} strokeWidth={iconStrokeWidth} />
          <span className="truncate">{option.title}</span>
        </>
      )}
      menuWidthClass={UI_RESPONSIVE_COMPACT_TOOLBAR_DROPDOWN_WIDTH_CLASSNAME}
    />
  )
}
