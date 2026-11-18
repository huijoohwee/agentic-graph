import React from 'react'
import { mountCollectionLayoutPicker, type CollectionLayout } from 'agentic-design-system/collection-layout'

type Props = {
  context: 'library' | 'preview'
  layout: CollectionLayout
  onChange: (value: CollectionLayout) => void
}

export function MediaCatalogLayoutControls({ context, layout, onChange }: Props) {
  const host = React.useRef<HTMLDivElement>(null)
  const current = React.useRef({ layout, onChange })
  const picker = React.useRef<ReturnType<typeof mountCollectionLayoutPicker> | null>(null)

  React.useLayoutEffect(() => {
    current.current = { layout, onChange }
    picker.current?.setLayout(layout)
  }, [layout, onChange])

  React.useLayoutEffect(() => {
    if (!host.current) return
    const library = context === 'library'
    const mounted = mountCollectionLayoutPicker(host.current, {
      layout: current.current.layout,
      label: library ? 'Media layout' : 'Preview layout',
      labelPrefix: library ? undefined : 'Preview',
      onChange: value => current.current.onChange(value),
    })
    picker.current = mounted
    return () => {
      picker.current = null
      mounted.destroy()
    }
  }, [context])

  return <div ref={host} data-kg-media-layout-selector={context === 'library' ? '1' : undefined} />
}
