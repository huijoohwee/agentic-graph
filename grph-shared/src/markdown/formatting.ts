import { applyMarkdownFormatAction as applyShared, type MarkdownFormatAction as SharedAction, type MarkdownSelectionOffsets, type MarkdownFormatResult, clampMarkdownSelection } from 'agentic-design-system/markdown'
import { normalizeMarkdownAsciiBlocks } from './asciiBlocks.js'
export type { MarkdownSelectionOffsets, MarkdownFormatResult }
export type MarkdownFormatAction = SharedAction | 'normalizeAsciiBlocks'
/** Graph-only ASCII block conversion remains a document extension. Generic formatting has one owner. */
export function applyMarkdownFormatAction(args:{text:string;selection:MarkdownSelectionOffsets;action:MarkdownFormatAction}):MarkdownFormatResult {
  if(args.action !== 'normalizeAsciiBlocks') return applyShared({...args,action:args.action})
  const {text}=args,sel=clampMarkdownSelection(text,args.selection)
  const start=sel.startOffset===0?0:text.lastIndexOf('\n',sel.startOffset-1)+1
  const found=text.indexOf('\n',sel.endOffset),end=found<0?text.length:found
  const next=normalizeMarkdownAsciiBlocks(text.slice(start,end))
  return {nextText:text.slice(0,start)+next+text.slice(end),nextSelection:{startOffset:sel.startOffset,endOffset:sel.endOffset+next.length-(end-start)}}
}
