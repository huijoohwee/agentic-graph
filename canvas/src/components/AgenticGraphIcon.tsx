import type { SVGProps } from 'react'
import { agenticGraphMark as mark } from 'grph-shared/ui/agenticGraphMark'

/** Decorative product identity; the adjacent text supplies the accessible name. */
export default function AgenticGraphIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox={mark.viewBox} fill="none" stroke="currentColor"
    strokeWidth={mark.strokeWidth} aria-hidden="true" focusable="false" data-kg-agentic-graph-mark="1">
    <path d={mark.path} />
    {mark.nodes.map(([cx, cy]) => <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r={mark.radius} />)}
  </svg>
}
