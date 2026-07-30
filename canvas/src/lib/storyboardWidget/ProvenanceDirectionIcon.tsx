import React from 'react'

export type ProvenanceDirection = 'source' | 'target'

const provenanceDirectionGlyph: Record<ProvenanceDirection, string> = {
  source: '←',
  target: '→',
}

export function ProvenanceDirectionIcon(props: {
  direction: ProvenanceDirection
  className?: string
}) {
  return (
    <span
      className={props.className}
      data-kg-provenance-direction-icon={props.direction}
    >
      {provenanceDirectionGlyph[props.direction]}
    </span>
  )
}
