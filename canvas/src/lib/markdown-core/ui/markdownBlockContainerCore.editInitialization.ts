import React from 'react'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'

export const useMarkdownBlockContainerEditInitialization = (args: {
  editing: boolean
  renderedInlineHtml?: string
  initialText: string
  editStripLinePrefix?: (line: string) => { prefix: string; content: string }
  editKeepLinePrefixesInEditor: boolean
  editTrimEdgeNewlines: boolean
  editTrimEmptyBlockEdges: boolean
  editListMode?: 'ordered' | 'unordered'
  editSigilRenderMode: 'styled' | 'plain'
  editorPresentation: 'markdown' | 'html'
  htmlRenderMode: 'inline' | 'block'
  placeCaretFromClientPoint: () => void
  runSelectionSyncBurst: (fn: () => void) => void
  syncSelectionToolbarState: () => void
  trimEmptyEditableEdges: () => boolean
  scheduleEdgeTrimBurst: () => void
  editLinePrefixesRef: React.MutableRefObject<string[] | null>
  initialPresentTextRef: React.MutableRefObject<string>
  draftRef: React.MutableRefObject<string>
  editDirtyRef: React.MutableRefObject<boolean>
  editSessionIdRef: React.MutableRefObject<number>
  editorRef: React.RefObject<HTMLElement | null>
  initialEditorHtmlRef: React.MutableRefObject<string>
  lastSerializedEditorHtmlRef: React.MutableRefObject<string>
  lastPointerSelectionModeRef: React.MutableRefObject<'caret' | 'word'>
}) => {
  const initialized=React.useRef(-1), latest=React.useRef(args);latest.current=args
  useIsomorphicLayoutEffect(()=>{
    if(!args.editing){initialized.current=-1;return}
    const session=args.editSessionIdRef.current
    if(initialized.current===session)return
    initialized.current=session
    const lines=args.initialText.split(/\r?\n/), stripped=args.editStripLinePrefix?lines.map(args.editStripLinePrefix):null
    args.editLinePrefixesRef.current=stripped?.map(line=>line.prefix)??null
    const text=stripped&&!args.editKeepLinePrefixesInEditor?stripped.map(line=>line.content).join('\n'):args.initialText
    args.initialPresentTextRef.current=text;args.draftRef.current=text;args.editDirtyRef.current=false
    const root=args.editorRef.current
    if(!root)return
    // The shared Viewer host is already rendered. Activation only captures its baseline.
    args.initialEditorHtmlRef.current=root.innerHTML;args.lastSerializedEditorHtmlRef.current=root.innerHTML
    queueMicrotask(()=>{
      if(latest.current.editSessionIdRef.current!==session||!root.isConnected)return
      root.focus({preventScroll:true});latest.current.placeCaretFromClientPoint()
      latest.current.runSelectionSyncBurst(()=>latest.current.syncSelectionToolbarState())
    })
  },[args.editing,args.initialText,args.editSessionIdRef,args.editorRef])
}
