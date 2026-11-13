import React from 'react'
import { FloatingPanelTab, FloatingPanelTabs } from '@agentic-base/views-react/panels'

type PanelViewTabProps = {
  tabKey?: string
  title: string
  children: React.ReactNode
  iconOnly?: boolean
  onClick?: () => void
  id?: string
  'aria-controls'?: string
  'aria-selected'?: boolean
  'aria-pressed'?: boolean
  [attribute: `data-${string}`]: string | undefined
}

/** Descriptor retained for Graph call sites; the Design System renders the tab. */
export function PanelViewTab(_props: PanelViewTabProps) {
  return null
}

type PanelViewTabsProps = {
  activeKey: string
  label?: string
  minimized?: boolean
  children: React.ReactNode
}

function readIcon(child: React.ReactNode): React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined {
  if (!React.isValidElement(child)) return undefined
  return child.type as React.ComponentType<React.SVGProps<SVGSVGElement>>
}

/** Graph supplies tab meaning and callbacks; shared markup, state, and keyboard behavior come from Base. */
export function PanelViewTabs({ activeKey, label = 'Panel views', minimized = false, children }: PanelViewTabsProps) {
  const items = React.Children.toArray(children)
  const tabItems = items.filter((item): item is React.ReactElement<PanelViewTabProps> =>
    React.isValidElement<PanelViewTabProps>(item) && item.type === PanelViewTab,
  )
  const labels = items.filter(item => !React.isValidElement(item) || item.type !== PanelViewTab)
  if (minimized) return <>{labels}</>

  const selectedItem = tabItems.find(item =>
    item.props['aria-selected'] === true || item.props['aria-pressed'] === true,
  )
  const selectedKey = selectedItem?.props.tabKey ?? activeKey
  const keyFor = (item: React.ReactElement<PanelViewTabProps>, index: number) =>
    item.props.tabKey ?? item.props.id ?? `${item.props.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`
  const handleSelect = (key: string) => {
    const selected = tabItems.find((item, index) => keyFor(item, index) === key)
    selected?.props.onClick?.()
  }

  return (
    <>
      {labels}
      <FloatingPanelTabs label={label} activeKey={selectedKey} onSelect={handleSelect}>
        {tabItems.map((item, index) => {
          const { title, id, onClick: _onClick, children: iconElement, tabKey: _tabKey, iconOnly,
            'aria-controls': ariaControls, 'aria-selected': _ariaSelected, 'aria-pressed': _ariaPressed,
            ...dataAttributes } = item.props
          return (
            <FloatingPanelTab
              key={item.key ?? keyFor(item, index)}
              tabKey={keyFor(item, index)}
              label={title}
              iconOnly={iconOnly ?? true}
              id={id}
              ariaControls={ariaControls}
              icon={readIcon(iconElement)}
              dataAttributes={dataAttributes}
            />
          )
        })}
      </FloatingPanelTabs>
    </>
  )
}
