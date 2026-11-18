import React from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import type { CollectionLayout } from 'agentic-design-system/collection-layout'
import 'agentic-design-system/collection-layout.css'

type SkillsCommandReferenceProps = React.HTMLAttributes<HTMLElement> & {
  layout: CollectionLayout
  icon: LucideIcon
  label: string
  description: string
}

export function SkillsCommandReference({ layout, icon: Icon, label, description, children, ...props }: SkillsCommandReferenceProps) {
  const icon = <span className={layout === 'card' ? 'agentic-collection-preview' : 'agentic-collection-leading'}><Icon className="size-4" aria-hidden /></span>
  const heading = <>
    <strong className="agentic-collection-title block">{label}</strong>
    <span className="agentic-collection-meta block" title={description}>{description}</span>
  </>
  const content = <div className="text-xs space-y-1">{children}</div>
  if (layout !== 'list') {
    return <section {...props} className="agentic-collection-item" data-layout={layout}>
      {icon}
      <div>{heading}{content}</div>
    </section>
  }
  return (
    <details {...props} className="group/reference">
      <summary className="agentic-collection-item agentic-skills-row" data-layout="list" role="button">
        {icon}
        <span>{heading}</span>
        <ChevronDown className="size-4 group-open/reference:rotate-180" aria-hidden />
      </summary>
      {content}
    </details>
  )
}
