import React from 'react'
import { ColorPicker, type ColorPickerProps } from 'agentic-design-system/react/rich-text'
import { AnchorOverlay } from '@/lib/ui/overlay'
import { MVP_COLOR_PALETTE } from '@/lib/graph/schema'
import { emitToolbarDropdownOpen, subscribeToolbarDropdownOpen } from '@/components/toolbar/dropdownOpenEvents'
export type PanelColorPickerProps=Omit<ColorPickerProps,'renderOverlay'|'swatches'|'onOpenChange'|'closeSignal'>
const swatches=['#000000','#ffffff','#808080',...Object.values(MVP_COLOR_PALETTE.nodes),...Object.values(MVP_COLOR_PALETTE.edges)]
/** Product palette values and mutual exclusion only; shared controls own rendering and interaction. */
export function PanelColorPicker(props:PanelColorPickerProps) {
  const [closeSignal,setCloseSignal]=React.useState(0),ownId=React.useRef('')
  React.useEffect(()=>subscribeToolbarDropdownOpen(detail=>{if(detail.sourceId!==ownId.current)setCloseSignal(value=>value+1)}),[])
  return <ColorPicker {...props} data-kg-color-picker="true" swatches={swatches} closeSignal={closeSignal}
    onOpenChange={(open,id)=>{ownId.current=id;if(open)emitToolbarDropdownOpen(id)}}
    renderOverlay={({anchorRef,onClose,children})=><AnchorOverlay anchorRef={anchorRef} open onClose={onClose} align="bottom-right">{children}</AnchorOverlay>} />
}
