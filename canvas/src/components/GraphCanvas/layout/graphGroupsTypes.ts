export type GraphGroup = {
  id: string
  label: string
  source?:
    | 'mermaidSubgraph'
    | 'markdownHeading'
    | 'keywordRole'
    | 'keywordNer'
    | 'community'
    | 'layer'
    | 'userSubgraph'
  depth: number
  xIndex?: number
  zIndex?: number
  zMode?: 'group' | 'absolute'
  yIndex?: number
  memberNodeIds: string[]
  parentGroupId?: string | null
  containChildren?: boolean
  connectable?: boolean
  autoBounds?: boolean
  style: {
    fill?: string
    stroke?: string
    strokeWidth?: number
    labelColor?: string
  }
  bounds?: {
    x: number
    y: number
    width: number
    height: number
    labelX?: number
    labelY?: number
  }
}
