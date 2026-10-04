import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createSourceGeospatialOwner, boundedSceneFetcher, readSourceGeospatialSnapshot, readSourceGeospatialState, clearSourceGeospatial, isSourceGeospatialReview, sourceGeospatialReviewBounds } from '../geospatialSource'
import { useGraphStore } from '@/hooks/useGraphStore'
import { validateSourceGeospatialSnapshot } from '../../../../../gympgrph/src/useSourceGeospatialLayers'
import { readEvidenceExamples } from './evidenceInput'
import { executeEvidence } from '../tools/executeEvidence.mjs'
import type { EvidenceSourceCapture } from '../evidenceSource'
const path='/evidence-analysis/fixtures/scene-wsss-v1.json'
const capture={documentName:'/scene.md',documentText:`---\nsource_geospatial: ${JSON.stringify({schema:'source-geospatial-config/v1',scenePath:path})}\n---\n`,sourceId:'scene',sourceRevision:1,sourceKey:'scene:1',config:{} } as EvidenceSourceCapture
const local=(url: unknown)=>new Response(readFileSync(`public${String(url).split('?')[0]}`))
const dependencies=(fetcher:typeof fetch=((async url=>local(url)) as typeof fetch))=>({isCurrent:()=>true,read:(paths:readonly string[],fetcher:typeof fetch)=>readEvidenceExamples(paths,fetcher),fetcher,inspect:(bundle:string,profileId:string)=>executeEvidence('aviation.inspect',{bundle,profileId})})
test('one owner loads verified actual runway and three-track assets and rejects invalid query without replacing acceptance',async()=>{
 const owner=createSourceGeospatialOwner(dependencies()); await owner.load(capture)
 assert.equal(owner.read().loading,false); assert.equal(owner.read().error,''); assert.equal(owner.readSnapshot()!.collection.features.filter(f=>f.id.startsWith('point:')).length,3)
 assert.deepEqual(validateSourceGeospatialSnapshot(owner.readSnapshot()),owner.readSnapshot());
 assert.match(owner.read().airspaceQualification,/unavailable|not|no/i);assert.ok(owner.read().moments.length>=80)
 const previous=owner.readSnapshot();await owner.setTime('invalid');assert.equal(owner.readSnapshot(),previous);assert.match(owner.read().error,/UTC/)
 owner.clear();assert.equal(owner.readSnapshot(),null);assert.equal(owner.read().sourceKey,capture.sourceKey);assert.ok(owner.read().title);assert.equal(owner.read().status,'Map context removed.')
 await owner.load(capture);assert.ok(owner.readSnapshot());owner.invalidate();assert.equal(owner.read().sourceKey,null)
})
test('late source load cannot replace a newer intent or survive exact-source invalidation',async()=>{
 let release!:(value:Response)=>void,calls=0,current=true
 const deps=dependencies((async url=>{calls++;if(calls===1)return new Promise<Response>(resolve=>{release=resolve});return local(url)}) as typeof fetch)
 deps.isCurrent=()=>current
 const owner=createSourceGeospatialOwner(deps),first=owner.load(capture)
 while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 await owner.load(capture);const accepted=owner.readSnapshot();assert.ok(accepted)
 release(local(path));await first;assert.equal(owner.readSnapshot(),accepted)
 current=false;owner.sourceChanged();assert.equal(owner.readSnapshot(),null);assert.equal(owner.read().sourceKey,null)
 assert.equal(owner.read().timeline,null)
 await owner.load(capture);assert.equal(owner.readSnapshot(),null)
})
test('latest UTC query wins and a changed-source pending request remains empty',async()=>{
 const owner=createSourceGeospatialOwner(dependencies());await owner.load(capture)
 const first=owner.setTime('2026-10-04T02:25:00.000Z'),last=owner.setTime('2026-10-04T02:25:50.000Z');await Promise.all([first,last]);assert.equal(owner.read().atUtc,'2026-10-04T02:25:50.000Z')
 let release!:(value:Response)=>void,current=true
 const deps=dependencies((async()=>new Promise<Response>(resolve=>{release=resolve})) as typeof fetch);deps.isCurrent=()=>current
 const pending=createSourceGeospatialOwner(deps),load=pending.load(capture);while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 current=false;pending.sourceChanged();release(local(path));await load;assert.equal(pending.readSnapshot(),null);assert.equal(pending.read().loading,false)
})
test('provenance mismatch is rejected while the prior same-source view stays available',async()=>{
 let corrupt=false
 const owner=createSourceGeospatialOwner(dependencies((async url=>{
  if(corrupt&&String(url).includes('airport-wsss-source'))return new Response('{}')
  return local(url)
 }) as typeof fetch))
 await owner.load(capture);const previous=owner.readSnapshot();corrupt=true;await owner.load(capture)
 assert.equal(owner.readSnapshot(),previous);assert.match(owner.read().error,/SHA-256/)
})
test('streamed per-asset and aggregate budgets reject before later data, and redirects are never accepted',async()=>{
 const controller=new AbortController();let canceled=false
 const oversized=boundedSceneFetcher((async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(500000))},cancel(){canceled=true}}))) as typeof fetch,controller.signal)
 await assert.rejects(readEvidenceExamples([path],oversized),/499,999/);assert.equal(canceled,true)
 let calls=0
 const cumulative=boundedSceneFetcher((async()=>{calls++;return new Response(' '.repeat(499999),{headers:{'content-length':'499999'}})}) as typeof fetch,controller.signal)
 for(let i=0;i<4;i++)await readEvidenceExamples([path],cumulative)
 await assert.rejects(readEvidenceExamples([path],cumulative),/combined/);assert.equal(calls,5)
 const response=new Response('{}');Object.defineProperty(response,'redirected',{value:true})
 await assert.rejects(readEvidenceExamples([path],boundedSceneFetcher((async()=>response) as typeof fetch,controller.signal)),/unavailable/)
})

test('the native source subscription loads opt-in context without a panel and clears immediately on source change',async()=>{
 const prior=useGraphStore.getState(),oldFetch=globalThis.fetch
 const config={schema:'evidence-workspace/v1',title:'Test source',description:'Observed context',profiles:{record:'aviation-v1',volume:'volume-v1',arrival:'arrival-v1',route:'route-v1'},policies:{volume:'volume-view',arrival:'arrival-policy',route:'route-policy',notice:'notice-policy'},examples:[{id:'track',label:'Track',kind:'record',paths:['/evidence-analysis/fixtures/aviation-singapore-multitrack-v1.json']}]}
 const documentText=capture.documentText.replace('---\nsource_geospatial:',`---\nevidence_workspace: ${JSON.stringify(config)}\nsource_geospatial:`)
 globalThis.fetch=(async url=>local(url)) as typeof fetch
 try {
  useGraphStore.setState({markdownDocumentName:'/auto-scene.md',markdownDocumentText:documentText,sourceFiles:[{id:'auto-scene',name:'/auto-scene.md',text:documentText,enabled:true,status:'parsed',parsedGraphRevision:2,source:{kind:'local',path:'/auto-scene.md'}}]} as never)
  const end=Date.now()+5000;while(!readSourceGeospatialSnapshot()&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,10))
  assert.ok(readSourceGeospatialSnapshot());assert.equal(readSourceGeospatialSnapshot()!.collection.features.filter(f=>f.id.startsWith('point:')).length,3)
  const runtime = await import('../../game-flight-sim/flightSimRuntime')
  assert.match(runtime.startFlightSim().runtimeError || '', /Recorded source context is active/)
  assert.match(runtime.restartFlightSim().runtimeError || '', /Recorded source context is active/)
  assert.equal(runtime.readFlightSimSnapshot().phase, 'stopped')
  runtime.resetFlightSimRuntimeForTests()
  clearSourceGeospatial();assert.ok(readSourceGeospatialState().sourceKey);assert.equal(readSourceGeospatialState().timeline,null)
  const invalidText=documentText.replace(path,'/unavailable.json')
  useGraphStore.setState({markdownDocumentText:invalidText,sourceFiles:[{id:'auto-scene',name:'/auto-scene.md',text:invalidText,enabled:true,status:'parsed',parsedGraphRevision:3,source:{kind:'local',path:'/auto-scene.md'}}]} as never)
  assert.ok(readSourceGeospatialState().sourceKey,'an authored context keeps Timeline ownership when its configuration is rejected')
  assert.match(readSourceGeospatialState().error,/valid local source_geospatial/)
  assert.equal(readSourceGeospatialState().timeline,null)
  useGraphStore.setState({markdownDocumentText:documentText+'changed draft'})
  assert.equal(readSourceGeospatialSnapshot(),null)
  assert.equal(readSourceGeospatialState().sourceKey,null)
 } finally {globalThis.fetch=oldFetch;useGraphStore.setState({markdownDocumentName:prior.markdownDocumentName,markdownDocumentText:prior.markdownDocumentText,sourceFiles:prior.sourceFiles})}
})

test('duplicate keys in either scene or hash-matched provenance are refused by the shared parser',async()=>{
 for(const duplicateScene of [true,false]) {
  const scene=JSON.parse(readFileSync(`public${path}`,'utf8'));
  delete scene.timeline;
  const referencePath=scene.references[0].url,reference=readFileSync(`public${referencePath}`,'utf8').replace('{','{"rows":[],');
  const sha=createHash('sha256').update(reference).digest('hex');scene.references[0].sha256=sha;scene.surfaces.features.forEach((f:any)=>{f.properties.sourceHash=sha});
  const sceneText=JSON.stringify(scene),owner=createSourceGeospatialOwner(dependencies((async url=>{
   if(String(url)===path)return new Response(duplicateScene?sceneText.replace('{','{"title":"shadow",'):sceneText)
   if(String(url)===referencePath)return new Response(reference)
   return local(url)
  }) as typeof fetch));
  await owner.load(capture);assert.equal(owner.readSnapshot(),null);assert.match(owner.read().error,/duplicate/i)
 }
})

test('a reused source key cannot keep an earlier document visible during a new load',async()=>{
 let block=false,release!:(value:Response)=>void
 const owner=createSourceGeospatialOwner(dependencies((async url=>block?new Promise<Response>(resolve=>{release=resolve}):local(url)) as typeof fetch))
 await owner.load(capture);assert.ok(owner.readSnapshot());block=true
 const load=owner.load({...capture,documentName:'/renamed-scene.md',documentText:capture.documentText+'new exact source'})
 assert.equal(owner.readSnapshot(),null)
 assert.equal(owner.read().timeline,null)
 while(!release)await new Promise(resolve=>setTimeout(resolve,0))
 owner.clear();release(local(path));await load;assert.equal(owner.readSnapshot(),null)
})

test('the timeline descriptor stays stable while UTC changes and its document identity binds exact loaded content',async()=>{
 let suffix=''
 const owner=createSourceGeospatialOwner(dependencies((async url=>{
  if(String(url)!==path)return local(url)
  const scene=JSON.parse(readFileSync(`public${path}`,'utf8'))
  scene.title+=suffix
  scene.timeline={title:'Authored observations',window:{startUtc:'2026-10-04T02:24:40.000Z',endUtc:'2026-10-04T02:26:40.000Z'},lanes:[{id:'observed',label:'Observed',kind:'observations'}]}
  return new Response(JSON.stringify(scene))
 }) as typeof fetch))
 await owner.load(capture);assert.equal(owner.read().error,'')
 const timeline=owner.read().timeline;assert.ok(timeline);assert.match(timeline.documentKey,/^source-geospatial:[a-f0-9]{64}$/)
 await owner.setTime('2026-10-04T02:25:31.125Z');assert.equal(owner.read().timeline,timeline);assert.equal(owner.read().atUtc,'2026-10-04T02:25:31.125Z')
 await owner.load(capture);assert.equal(owner.read().timeline!.documentKey,timeline.documentKey)
 suffix=' changed scene bytes';await owner.load(capture);assert.notEqual(owner.read().timeline!.documentKey,timeline.documentKey)
 const second=owner.read().timeline!.documentKey;await owner.load({...capture,sourceRevision:2});assert.notEqual(owner.read().timeline!.documentKey,second)
 owner.clear();assert.equal(owner.read().timeline,null);assert.equal(owner.readSnapshot(),null)
})

test('malformed timeline retry retains only accepted same-source context, and invalidation clears both',async()=>{
 let invalid=false
 const owner=createSourceGeospatialOwner(dependencies((async url=>{
  if(String(url)!==path)return local(url)
  const scene=JSON.parse(readFileSync(`public${path}`,'utf8'))
  scene.timeline={title:'Authored observations',window:{startUtc:'2026-10-04T02:24:40.000Z',endUtc:'2026-10-04T02:26:40.000Z'},lanes:[{id:'observed',label:'Observed',kind:'observations',...(invalid?{entityIds:['missing-entity']}: {})}]}
  return new Response(JSON.stringify(scene))
 }) as typeof fetch))
 await owner.load(capture);const timeline=owner.read().timeline,snapshot=owner.readSnapshot();assert.ok(timeline)
 invalid=true;await owner.load(capture);assert.equal(owner.read().timeline,timeline);assert.equal(owner.readSnapshot(),snapshot);assert.match(owner.read().error,/no position evidence/)
 owner.invalidate();assert.equal(owner.read().timeline,null);assert.equal(owner.readSnapshot(),null)
})

test('source context owns presentation independently of panel visibility and frames all accepted geometry without inventing positions', async () => {
 assert.equal(isSourceGeospatialReview(true), true)
 assert.equal(isSourceGeospatialReview(false), false)
 assert.equal(sourceGeospatialReviewBounds(null), null)
 const owner = createSourceGeospatialOwner(dependencies()); await owner.load(capture)
 const snapshot = owner.readSnapshot()!, bounds = sourceGeospatialReviewBounds(snapshot)!
 assert.ok(bounds[0] < bounds[2] && bounds[1] < bounds[3])
 const points = snapshot.collection.features.filter(feature => feature.geometry.type === 'Point').map(feature => feature.geometry.coordinates as readonly number[])
 assert.equal(points.length, 3)
 for (const [lng, lat] of points) assert.ok(lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3])
 const before = JSON.stringify(snapshot); sourceGeospatialReviewBounds(snapshot); assert.equal(JSON.stringify(snapshot), before)
 owner.clear(); assert.equal(sourceGeospatialReviewBounds(owner.readSnapshot()), null)
 assert.equal(isSourceGeospatialReview(owner.read().sourceKey !== null), true, 'removal retains review ownership without displaying practice as replacement evidence')
})
