import React from 'react'
import { Box } from 'lucide-react'
import type { MarkdownVariablePreview } from '@/features/markdown/ui/MarkdownRendererTypes'
import { getMarkdownXrVariableInvocations } from '@/features/markdown/ui/markdownXrVariableInvocations'
import { buildInlineCommandMenuItem } from '@/lib/command-menu/inlineCommandMenuItems'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { XrCatalogArtwork } from '@/features/command-menu/XrMediaCatalogThumbs'
import { XR_SCENE_LIBRARY_ASSETS } from '@/features/three/xrSceneLibrary'
import { CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME, CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME } from '@/lib/cards/cardMarkdownPreviewUtils'
import { MarkdownBlockContainerCommandMenu } from './markdownBlockContainerCore.commandMenu'
import { FLOATING_MENU_BUTTON_CLASSNAME, FLOATING_MENU_BUTTON_DANGER_CLASSNAME, FLOATING_MENU_BUTTON_DISABLED_CLASSNAME, FLOATING_POPOVER_INPUT_CLASSNAME, FLOATING_MENU_LEFT_W220_CLASSNAME } from '@/features/markdown-workspace/main/viewer/floatingMenuStyles'
import { UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME } from '@/lib/ui/responsiveElementClasses'

export function MarkdownVariableInvocationChip({ variableKey, preview, sourceText }: {
  variableKey: string; preview: MarkdownVariablePreview; sourceText: string
}) {
  const anchorRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const target = preview.invocationTarget!
  const label = preview.displayValue ?? preview.value ?? variableKey
  const close = React.useCallback(() => { setOpen(false); setQuery('') }, [])
  const items = React.useMemo(() => open ? getMarkdownXrVariableInvocations(target).map(candidate => buildInlineCommandMenuItem({
    ...candidate, description: candidate.invocation, keywords: [...candidate.keywords, candidate.invocation],
    disabled: busy,
    onSelect: () => {
      if (busy) return
      setBusy(true)
      void preview.onInvoke?.(candidate.invocation).finally(() => { setBusy(false); close() })
    },
  })) : [], [open, target, preview.onInvoke, busy, close])
  const targetKey = target.kind === 'subject' ? target.subjectId : 'stage'
  React.useEffect(close, [variableKey, targetKey, preview.value, close])
  if (!preview.onInvoke) return <span data-kg-var-rendered-value={variableKey} title={sourceText}>{label}</span>
  const asset = XR_SCENE_LIBRARY_ASSETS.find(asset => asset.id === preview.value)
  return <>
    <button ref={anchorRef} type="button" aria-label={`Change ${label}`} aria-haspopup="listbox" aria-expanded={open}
      title={sourceText} data-kg-variable-invocation={variableKey} className={`${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} cursor-pointer`}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setOpen(value => !value); setQuery('') }}>
      <span className="inline-flex h-4 w-5 shrink-0" aria-hidden="true"><XrCatalogArtwork assetId={preview.value ?? ''} label={label} color={asset?.defaultColor ?? '#64748b'} Icon={Box} /></span>
      <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{label}</span>
    </button>
    <AnchorOverlay anchorRef={anchorRef} open={open} onClose={close} align="bottom-left" className={FLOATING_MENU_LEFT_W220_CLASSNAME}>
      <section aria-label="Variable toolbar" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <MarkdownBlockContainerCommandMenu ariaLabel="Variable commands" items={items} query={query} onQueryChange={setQuery} onCancel={close}
          placeholder="Find variable or action" inputClassName={FLOATING_POPOVER_INPUT_CLASSNAME} itemClassName={FLOATING_MENU_BUTTON_CLASSNAME}
          itemDangerClassName={FLOATING_MENU_BUTTON_DANGER_CLASSNAME} itemDisabledClassName={FLOATING_MENU_BUTTON_DISABLED_CLASSNAME}
          emptyLabel="No matching actions" menuClassName={UI_RESPONSIVE_MARKDOWN_INLINE_MENU_LIST_CLASSNAME} />
      </section>
    </AnchorOverlay>
  </>
}
