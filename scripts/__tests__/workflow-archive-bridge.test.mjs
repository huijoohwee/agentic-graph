import test from 'node:test'
import assert from 'node:assert/strict'
import {readWorkflowArchiveRequest} from '../../canvas/viteWorkflowArchiveBridge.mjs'
test('workflow bridge accepts only uploaded manifest bytes and a bounded page index',async()=>{
 const calls=[];const load=(text,offset)=>{calls.push([text,offset]);return {schema:'agent-toolkit-run/v1',status:'blocked',manifestDigest:'a'.repeat(64)}}
 const frame=await readWorkflowArchiveRequest({manifestText:'{}',offset:32},load)
 assert.deepEqual(calls,[['{}',32]]);assert(frame.includes('"capturedStatus":"blocked"'));assert(frame.endsWith('data: [DONE]\n\n'))
 for(const value of [{manifestText:'{}',offset:1},{manifestText:'{}',offset:-32},{manifestText:'{}',offset:0,path:'/private'},
  {manifestText:'x'.repeat(32001),offset:0},null])await assert.rejects(readWorkflowArchiveRequest(value,load))
 assert.equal(calls.length,1)
 await assert.rejects(readWorkflowArchiveRequest({manifestText:'{}',offset:0},()=>({x:'a'.repeat(262144)})),/large/)
})
import {createServer} from 'node:http'
import {createDurableRunBridgePlugin} from '../../canvas/viteDurableRunBridge.mjs'
test('local manifest ingress shares origin and content guards without requiring runtime credentials',async t=>{
 let handle;const server=createServer((req,res)=>handle(req,res,()=>{res.statusCode=404;res.end()}))
 createDurableRunBridgePlugin({env:{}}).configureServer({httpServer:server,middlewares:{use(fn){handle=fn}},config:{logger:{warn(){}}}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close())
 const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/api/agent-swarm/workflow-trace'
 const headers={origin,'content-type':'application/json'}
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,origin:'https://untrusted.example'},body:'{}'})).status,403)
 assert.equal((await fetch(url,{method:'GET',headers})).status,405)
 assert.equal((await fetch(url,{method:'POST',headers:{...headers,'content-type':'text/plain'},body:'{}'})).status,415)
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({manifestText:'{}',offset:0})})).status,422)
})

import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer as createViteServer} from 'vite'
test('workflow ingress remains available after the Vite configuration runner closes',async()=>{
 const fixture=await mkdtemp(path.join(os.tmpdir(),'workflow-bridge-vite-'))
 let server
 try{
  const helper=fileURLToPath(new URL('../../canvas/viteDurableRunBridge.mjs',import.meta.url))
  const configFile=path.join(fixture,'vite.config.mjs')
  await writeFile(configFile,`import {createDurableRunBridgePlugin} from ${JSON.stringify(helper)}; export default {plugins:[createDurableRunBridgePlugin({env:{}})]}`)
  server=await createViteServer({root:fixture,configFile,configLoader:'runner',logLevel:'silent',server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}})
  await server.listen()
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`
  const response=await fetch(origin+'/api/agent-swarm/workflow-trace',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({manifestText:'{}',offset:0})})
  assert.equal(response.status,422,await response.text())
 }finally{await server?.close();await rm(fixture,{recursive:true,force:true})}
})

import {mkdir,readFile,symlink,realpath} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {collectWorkflow,WORKFLOW_PHASES} from '../../node_modules/agentic-os/bin/agentic-os-workflow.mjs'
import {readWorkspaceObservationSource} from '../../canvas/viteWorkspaceObservationBridge.mjs'
test('workspace selection reads the exact native archive; unselected, malformed, outside and symlink sources fail closed',async()=>{
 const fixture=await realpath(await mkdtemp(path.join(os.tmpdir(),'workspace-observation-'))),repo=path.join(fixture,'repo')
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
 try{
  await mkdir(repo);git('init');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');git('commit','--allow-empty','-m','fixture')
  assert.equal(await readWorkspaceObservationSource(repo,{}),null)
  await assert.rejects(readWorkspaceObservationSource(repo,{path:'/private'}),/input/)
  const input=path.join(fixture,'input.json'),repository='github.com/example/fixture'
  await writeFile(input,JSON.stringify({schema:'agentic-os/workflow-observation-input/v1',id:'source-fixture',
   source:{repository,revision:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')},expected:WORKFLOW_PHASES,phases:[]}))
  const stored=collectWorkflow(repo,repository,input)
  git('config','agentic-os.workflowManifest',stored.manifest)
  const source=await readWorkspaceObservationSource(repo,{})
  assert.equal(source.manifestText,await readFile(stored.manifest,'utf8'));assert.equal(source.manifestDigest,stored.digest)
  const frame=await readWorkflowArchiveRequest({manifestText:source.manifestText,offset:0},undefined,repo)
  assert(frame.includes('workflow-source-fixture'));assert(frame.includes('"missing"'));assert(frame.endsWith('data: [DONE]\n\n'))
  const outside=path.join(fixture,'outside.json');await writeFile(outside,source.manifestText,{mode:0o600})
  git('config','agentic-os.workflowManifest',outside);await assert.rejects(readWorkspaceObservationSource(repo,{}),/archive_required/)
  const linked=path.join(fixture,'linked.json');await symlink(stored.manifest,linked)
  git('config','agentic-os.workflowManifest',linked);await assert.rejects(readWorkspaceObservationSource(repo,{}))
 }finally{await rm(fixture,{recursive:true,force:true})}
})
