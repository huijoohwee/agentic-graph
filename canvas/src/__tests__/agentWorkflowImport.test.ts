import assert from 'node:assert/strict'
import { readWorkflowImport } from '@/features/agent-ready/agentWorkflowImport'
import { readAgentRunImport, agentRunInspectionJson } from '@/features/agent-ready/agentRunImport'

export async function testWorkflowImport(): Promise<void> {
  const manifestText = JSON.stringify({ schema: 'agentic-os/workflow-group/v1', id: 'all-worktrees' })
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifestText)))].map(n=>n.toString(16).padStart(2,'0')).join('')
  const offsets: number[] = []
  const snapshot = (offset: number) => ({schema:'agent-toolkit-run/v1',authority:false,runId:'workflow-all-worktrees',status:'completed',manifestDigest:digest,
    subjectDigest:'a'.repeat(64),observedAt:Date.now(),expiresAt:Date.now()+60000,
    spans:Array.from({length:Math.min(32,70-offset)},(_,i)=>({spanId:String(offset+i),parentSpanId:offset+i ? '0':null,kind:'check',operation:'check',status:'completed',
      model:'native-model',modelIdentityBasis:'reported-span',timing:{startOffsetMs:i,inclusiveMs:10,scope:offset<64?'left':'right'},resources:{cpuMs:0,peakMemoryBytes:1000,tokens:5,costUsd:0}})),
    page:{offset,total:70,nextCursor:offset+32<70?String(offset+32):null},coverage:{partial:true,sourcePartial:false,expectedSpans:70}})
  function request(mutate?: (value: ReturnType<typeof snapshot>) => void): typeof fetch {
    return (async (_url: unknown, init: RequestInit) => {const offset=JSON.parse(String(init.body)).offset; offsets.push(offset); const data=snapshot(offset);mutate?.(data);
      return new Response('data: '+JSON.stringify(data)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','cache-control':'no-store'}}) }) as typeof fetch
  }
  const result=await readWorkflowImport(manifestText,'manifest.json',new AbortController().signal,request())
  assert.deepEqual(offsets,[0,32,64]);assert.equal(result.spans.length,70);assert.equal(result.partial,false);assert.equal(result.nextCursor,null)
  assert.equal(result.spans[69]!.model,'native-model');assert.equal(result.spans[69]!.timing.scope,'right')
  const reimport=readAgentRunImport(agentRunInspectionJson(result,'69',Date.now()+60000),'inspection.json')!
  assert.equal(reimport.trace.spans.length,70);assert.equal(reimport.spanId,'69');assert.equal(reimport.trace.spans[69]!.timing.scope,'right')
  for(const mutate of [(v:ReturnType<typeof snapshot>)=>{v.manifestDigest='b'.repeat(64)},
    (v:ReturnType<typeof snapshot>)=>{v.page.nextCursor=null},(v:ReturnType<typeof snapshot>)=>{if(v.page.offset)v.spans[0]!.spanId='0'},
    (v:ReturnType<typeof snapshot>)=>{v.page.total=2049}]) await assert.rejects(readWorkflowImport(manifestText,'manifest.json',new AbortController().signal,request(mutate)))
  const canceled=new AbortController();canceled.abort();await assert.rejects(readWorkflowImport(manifestText,'manifest.json',canceled.signal,request()))
  await assert.rejects(readWorkflowImport(manifestText,'manifest.json',new AbortController().signal,(async()=>new Response('{}',{status:422})) as typeof fetch),/unavailable/)
}
