import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {ViewerSurface} from 'agentic-design-system/react/viewer'
import {MarkdownBlockContainer} from '@/lib/markdown-core/ui/MarkdownBlockContainerCore.impl.engine.runtime'
import {initJsdomHarness} from '@/tests/lib/jsdomHarness'

test('shared Viewer activation retains mounted rich nodes and does not publish source',async()=>{
 const {dom,restore}=initJsdomHarness(),container=dom.window.document.createElement('div');dom.window.document.body.append(container);const root=createRoot(container)
 let writes=0
 const content=<><h2>Heading</h2><p>A <strong>bold</strong> paragraph</p><table><tbody><tr><td>Value</td></tr></tbody></table></>
 const render=(editing:boolean)=>root.render(<ViewerSurface editing={editing} activation="manual" onCommit={()=>writes++}>{content}</ViewerSurface>)
 try{
  await act(async()=>render(false));const surface=container.firstElementChild!,nodes=[...surface.querySelectorAll('*')],html=surface.innerHTML
  await act(async()=>render(true));assert.equal(container.firstElementChild,surface);assert.equal(surface.innerHTML,html);assert.deepEqual([...surface.querySelectorAll('*')],nodes)
  assert.equal(surface.getAttribute('contenteditable'),'true');assert.equal(writes,0)
  await act(async()=>render(false));assert.equal(container.firstElementChild,surface);assert.equal(surface.innerHTML,html);assert.equal(writes,0)
 }finally{await act(async()=>root.unmount());container.remove();restore()}
})
test('Graph click activation preserves its rendered block and no-op blur source',async()=>{
 const {dom,restore}=initJsdomHarness(),container=dom.window.document.createElement('div');dom.window.document.body.append(container);const root=createRoot(container),writes:unknown[]=[]
 try{
  await act(async()=>root.render(<MarkdownBlockContainer as="p" highlightClass="" startLine={1} inlineEditable sourceLines={['A **bold** paragraph']} onReplaceLineRange={value=>writes.push(value)} editDisableRichUi><>A <strong>bold</strong> paragraph</></MarkdownBlockContainer>))
  const surface=container.querySelector('p')!,strong=surface.querySelector('strong'),body=surface.querySelector('[data-kg-paragraph-content]')??surface,html=body.innerHTML
  await act(async()=>surface.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:1})))
  assert.equal(container.querySelector('p'),surface);assert.equal(surface.querySelector('strong'),strong);assert.equal(body.innerHTML,html)
  const editor=surface.querySelector<HTMLElement>('[contenteditable="true"]')??surface
  assert.equal(editor.getAttribute('contenteditable'),'true');assert.deepEqual(writes,[])
  await act(async()=>editor.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})))
  assert.equal(body.innerHTML,html);assert.deepEqual(writes,[])
 }finally{await act(async()=>root.unmount());container.remove();restore()}
})
test('shared dirty edit settlement commits once and safely projects current source',async()=>{
 const {dom,restore}=initJsdomHarness(),container=dom.window.document.createElement('div');dom.window.document.body.append(container);const root=createRoot(container),writes:string[]=[]
 function Host(){const [text,setText]=React.useState('Original');return <ViewerSurface onCommit={value=>{writes.push(value);setText(value)}}>{text}</ViewerSurface>}
 try{
  await act(async()=>root.render(<Host/>));const surface=container.firstElementChild! as HTMLElement
  await act(async()=>surface.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,detail:1})))
  await act(async()=>{surface.textContent='Changed';surface.dispatchEvent(new dom.window.Event('input',{bubbles:true}));surface.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true}))})
  assert.deepEqual(writes,['Changed']);assert.equal(container.firstElementChild?.textContent,'Changed');assert.equal(container.firstElementChild?.getAttribute('contenteditable'),null)
 }finally{await act(async()=>root.unmount());container.remove();restore()}
})
