import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { admit, inspect } from '../core/evidence-kernel.mjs';
import { validateSourceGeospatialScene, verifySurfaceReferences, projectSourceGeospatial, sourceGeospatialMoments, sourceGeospatialMissingPositions } from '../geospatialProject.mjs';
const data=new URL('../../../../public/evidence-analysis/fixtures/',import.meta.url);
const profile=JSON.parse(await readFile(new URL('../profiles/aviation-v1.json',import.meta.url)));
const original=await readFile(new URL('aviation-singapore-multitrack-v1.json',data));
const record=inspect(await admit(original,profile));
const scene=validateSourceGeospatialScene(JSON.parse(await readFile(new URL('scene-wsss-v1.json',data))));
const project=(time=scene.defaultAtUtc,s=scene,r=record)=>projectSourceGeospatial(s,[r],'exact-source:revision1',time);
const points=value=>value.collection.features.filter(f=>f.id.startsWith('point:'));
test('real three-aircraft projection retains observed coordinates and pressure metadata with source provenance',()=>{
 const value=project();assert.equal(points(value).length,3);assert.equal(value.collection.features.filter(f=>f.properties.role==='surface').length,3);
 for(const point of points(value)) {assert.equal(point.geometry.coordinates.length,2);assert.match(point.properties.altitudeLabel,/pressure/);assert.equal(point.properties.heightMeters,undefined);assert.ok(Date.parse(point.properties.observedAtUtc)<=Date.parse(value.atUtc));assert.match(point.properties.sourceHash,/^[a-f0-9]{64}$/);}
 assert.deepEqual(value,project());assert.ok(Object.isFrozen(value.collection.features));assert.equal(createHash('sha256').update(original).digest('hex'),'f8e3e92881fde1d7bfa36423ee1e031e71019697993153fd1829cd440a1f0082');
});
test('time scrubbing never invents earlier positions, connects gaps or extrapolates a stale aircraft',()=>{
 assert.equal(points(project('2026-10-04T02:24:40.000Z')).length,0);
 const end=project('2026-10-04T02:28:00.000Z');assert.ok(points(end).every(f=>f.properties.status==='stale'));
 const gaps=end.collection.features.filter(f=>f.properties.status==='gap');assert.ok(gaps.length>=2);assert.ok(gaps.every(f=>f.properties.gapSeconds>15));
 for(const line of end.collection.features.filter(f=>f.properties.status==='observed-path')) {
  const sourceFacts=record.facts.filter(f=>f.source_id===line.properties.sourceId&&f.kind==='position');
  const times=line.geometry.coordinates.map(c=>Date.parse(sourceFacts.find(f=>f.value.longitude===c[0]&&f.value.latitude===c[1]).observed_at));
  assert.ok(times.slice(1).every((t,i)=>(t-times[i])/1000<=15));
 }
 assert.ok(sourceGeospatialMoments([record],scene).length>=80);assert.throws(()=>project('2026-02-30T00:00:00.000Z'),/UTC/);
});
test('source surfaces require resolved matching provenance and reject implicit 3D or unsupported topology',async()=>{
 const text=await readFile(new URL('airport-wsss-source-v1.json',data),'utf8'),sha256=createHash('sha256').update(text).digest('hex');
 verifySurfaceReferences(scene,[{sha256,value:JSON.parse(text)}]);assert.throws(()=>verifySurfaceReferences(scene,[]),/verified reference/);
 const bad=structuredClone(scene);bad.surfaces.features[0].geometry.coordinates[0][0].push(22);assert.throws(()=>validateSourceGeospatialScene(bad),/2D/);
 const holes=structuredClone(scene);holes.surfaces.features[0].geometry.coordinates.push(holes.surfaces.features[0].geometry.coordinates[0]);assert.throws(()=>validateSourceGeospatialScene(holes),/single-ring/);
 assert.throws(()=>project(scene.defaultAtUtc,scene,{...record,entities:[...record.entities,record.entities[0]]}),/collide/);
 const collision=structuredClone(scene);collision.surfaces.features[0].id=points(project())[0].id;assert.throws(()=>project(scene.defaultAtUtc,collision),/feature IDs collide/);
});
test('equivalent UTC forms match altitude and conflicting same-instant positions fail loudly',()=>{
 const r=structuredClone(record);const f=r.facts.find(f=>f.kind==='position');f.observed_at=f.observed_at.replace(/\.\d{3}Z$/,'.000Z');
 r.facts.push({...f,id:f.id+'-conflict',observed_at:f.observed_at.replace('.000Z','Z'),value:{latitude:f.value.latitude+0.001,longitude:f.value.longitude}});
 assert.throws(()=>project(scene.defaultAtUtc,scene,r),/Conflicting positions/);
 const same=structuredClone(record);const pos=same.facts.find(f=>f.kind==='position');const alt=same.facts.find(f=>f.kind==='altitude'&&f.entity_id===pos.entity_id&&f.observed_at===pos.observed_at);
 pos.observed_at=pos.observed_at.replace(/\.\d{3}Z$/,'.000Z');alt.observed_at=pos.observed_at.replace('.000Z','Z');
 const p=points(project(pos.observed_at,scene,same)).find(f=>f.id.includes(pos.entity_id));assert.match(p.properties.altitudeLabel,/pressure/);
});
test('authored qualified geometric volumes have explicit active intervals and cannot consume pressure heights',()=>{
 const raw=structuredClone(scene);delete raw.timeline;raw.airspace.status='qualified';const volume=raw.surfaces.features.find(f=>f.properties.role==='surface');
 volume.properties={...volume.properties,role:'volume',baseMeters:10,heightMeters:100,heightReference:'map-ground-geometric'};volume.effective={fromUtc:'2026-10-04T02:25:00.000Z',toUtc:'2026-10-04T02:26:00.000Z',datum:'map-ground-geometric'};
 const qualified=validateSourceGeospatialScene(raw);assert.equal(project('2026-10-04T02:25:30.000Z',qualified).collection.features.filter(f=>f.properties.role==='volume').length,1);
 assert.equal(project('2026-10-04T02:26:00.000Z',qualified).collection.features.filter(f=>f.properties.role==='volume').length,0);
 volume.effective.datum='pressure';assert.throws(()=>validateSourceGeospatialScene(raw),/geometric reference/);
});
test('self-crossing polygons and a scene with too many gap markers fail before publication',()=>{
 const crossing=structuredClone(scene);crossing.surfaces.features[0].geometry.coordinates=[[[103.9,1.2],[104,1.4],[103.9,1.4],[104,1.2],[103.9,1.2]]];
 assert.throws(()=>validateSourceGeospatialScene(crossing),/zero area|Self-intersecting/);
 const r=structuredClone(record),base=r.facts.find(f=>f.kind==='position');r.entities=[r.entities.find(e=>e.id===base.entity_id)];r.facts=Array.from({length:1030},(_,i)=>({...base,id:`gap-${i}`,observed_at:new Date(Date.parse('2026-10-04T00:00:00.000Z')+i*16000).toISOString()}));
 assert.throws(()=>project('2026-10-04T23:59:00.000Z',scene,r),/feature or entity bounds/);
});

test('an admitted explicit-null position remains on the clock, breaks the path and suppresses a current marker',async()=>{
 const bundle=JSON.parse(await readFile(new URL('aviation-synthetic-v1.json',data)));
 const source=bundle.sources[0],envelope=JSON.parse(source.original.text),base=envelope.facts.find(f=>f.kind==='position');
 const absent={...base,id:'explicit-position-unknown',observed_at:'2026-01-01T12:00:15.000Z',retrieved_at:'2026-01-01T12:00:20.000Z',value:null,null_reason:'Source explicitly reports position unavailable.'};
 const index=envelope.facts.push(absent)-1;source.original.text=JSON.stringify(envelope);source.original.sha256=createHash('sha256').update(source.original.text).digest('hex');bundle.facts.push({...absent,evidence_ref:`/facts/${index}`});
 const admitted=inspect(await admit(new TextEncoder().encode(JSON.stringify(bundle)),profile)),study={...scene,gapAfterSeconds:60};
 assert.ok(sourceGeospatialMoments([admitted],study).includes(absent.observed_at));
 const atNull=project(absent.observed_at,study,admitted);assert.equal(points(atNull).length,0);
 assert.deepEqual(sourceGeospatialMissingPositions([admitted],study,absent.observed_at).map(p=>p.reason),[absent.null_reason]);
 const after=project('2026-01-01T12:00:30.000Z',study,admitted);assert.equal(after.collection.features.filter(f=>f.properties.status==='observed-path'&&f.properties.sourceId===source.id).length,0);
 assert.equal(sourceGeospatialMissingPositions([admitted],study,'2026-01-01T12:00:30.000Z').length,0);
});
