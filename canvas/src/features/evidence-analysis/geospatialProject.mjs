export { parseJson as parseSourceGeospatialJson } from './core/evidence-kernel.mjs';
import { validateSourceGeospatialTimeline } from './geospatialTimeline.mjs';
const fail = (ok, message) => { if (!ok) throw new Error(message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2048) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const color = value => typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test(value);
const path = value => typeof value === 'string' && /^\/evidence-analysis\/fixtures\/[a-zA-Z0-9._-]+\.json$/.test(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const clone = value => JSON.parse(JSON.stringify(value));
const utc = value => { fail(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), 'Use explicit UTC time.'); const ms = Date.parse(value); fail(Number.isFinite(ms) && new Date(ms).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z'), 'UTC time is invalid.'); return ms; };
const coordinates = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
const key = value => JSON.stringify(value);
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a,b,c)=>cross(a,b,c)===0&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
const intersects=(a,b,c,d)=>((cross(a,b,c)>0)!==(cross(a,b,d)>0)&&(cross(c,d,a)>0)!==(cross(c,d,b)>0))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
function shape(geometry) {
 fail(object(geometry) && ['Point', 'LineString', 'Polygon'].includes(geometry.type), 'Unsupported source geometry.');
 const points = geometry.type === 'Point' ? [geometry.coordinates] : geometry.type === 'Polygon' ? geometry.coordinates?.[0] : geometry.coordinates;
 fail(Array.isArray(points) && points.length <= 1000 && points.every(coordinates), 'Source coordinates must be bounded, finite, strictly 2D WGS84.');
 if (geometry.type === 'LineString') fail(points.length >= 2, 'A source path needs two observations.');
 if (geometry.type === 'Polygon') {
  fail(geometry.coordinates.length === 1 && points.length >= 4 && key(points[0]) === key(points.at(-1)), 'Only a closed single-ring surface is supported.');
  fail(new Set(points.slice(0,-1).map(key)).size === points.length - 1, 'Surface ring has repeated vertices.');
  fail(points.slice(1).reduce((sum,p,i)=>sum+points[i][0]*p[1]-p[0]*points[i][1],0)!==0, 'Surface ring has zero area.');
  for(let i=0;i<points.length-1;i++) for(let j=i+2;j<points.length-1;j++) if(!(i===0&&j===points.length-2)) fail(!intersects(points[i],points[i+1],points[j],points[j+1]), 'Self-intersecting surfaces are unsupported.');
 }
 for (let i=1;i<points.length;i++) fail(Math.abs(points[i][0]-points[i-1][0]) <= 180, 'Antimeridian geometry requires a separate authored projection.');
}
export function validateSourceGeospatialScene(input) {
 fail(object(input), 'A source scene is required.'); const value=clone(input);
 const fields=['schema','title','description','profileId','defaultAtUtc','gapAfterSeconds','staleAfterSeconds','trackBundlePaths','surfaces','airspace','references','roles','trackColors','timeline'];
 fail(Object.keys(value).every(k=>fields.includes(k)) && value.schema==='source-geospatial-scene/v1', 'Unsupported source scene fields or schema.');
 fail(text(value.title)&&text(value.description)&&text(value.profileId,80), 'Author source scene labels and profile ID.'); utc(value.defaultAtUtc);
 fail(object(value.roles)&&Object.keys(value.roles).length===2&&text(value.roles.position,80)&&text(value.roles.altitude,80)&&value.roles.position!==value.roles.altitude, 'Author distinct position and altitude roles.');
 for(const k of ['gapAfterSeconds','staleAfterSeconds']) fail(Number.isFinite(value[k])&&value[k]>0&&value[k]<=86400, 'Author bounded gap and stale thresholds.');
 fail(Array.isArray(value.trackColors)&&value.trackColors.length>0&&value.trackColors.length<=10&&value.trackColors.every(color), 'Author track colours.');
 fail(Array.isArray(value.trackBundlePaths)&&value.trackBundlePaths.length>0&&value.trackBundlePaths.length<=3&&value.trackBundlePaths.every(path)&&new Set(value.trackBundlePaths).size===value.trackBundlePaths.length, 'Author 1–3 unique local track bundles.');
 fail(object(value.airspace)&&['unavailable','qualified'].includes(value.airspace.status)&&text(value.airspace.statement), 'Author the airspace qualification and statement.');
 fail(object(value.surfaces)&&value.surfaces.type==='FeatureCollection'&&Array.isArray(value.surfaces.features)&&value.surfaces.features.length<=100, 'Author bounded source surface features.');
 const ids=new Set();
 for(const feature of value.surfaces.features) {
  const p=feature.properties; shape(feature.geometry);
  fail(feature.type==='Feature'&&text(feature.id,128)&&!ids.has(feature.id), 'Source surface IDs must be unique.'); ids.add(feature.id);
  fail(object(p)&&['surface','volume','path','point'].includes(p.role)&&text(p.label)&&color(p.color)&&text(p.sourceId,128)&&hex(p.sourceHash)&&text(p.sourcePointer)&&p.sourcePointer.startsWith('/'), 'Every source surface needs attribution and a source pointer.');
  fail(p.role==='volume'?feature.geometry.type==='Polygon':p.role === ({Polygon:'surface',LineString:'path',Point:'point'})[feature.geometry.type], 'Source geometry and role disagree.');
  fail(Object.keys(p).every(k=>['role','label','color','sourceId','sourceHash','sourcePointer','status','baseMeters','heightMeters','heightReference'].includes(k))&&(!p.status||text(p.status,256)), 'Unsupported surface properties; no implicit height conversion.');
  fail(Object.keys(feature).every(k=>['type','id','geometry','properties','effective'].includes(k))&&Object.keys(feature.geometry).every(k=>['type','coordinates'].includes(k)), 'Unsupported feature fields.');
  if(p.role==='volume') {
   fail(value.airspace.status==='qualified'&&object(feature.effective)&&feature.effective.datum==='map-ground-geometric'&&p.heightReference==='map-ground-geometric', 'Volume geometry requires explicit qualified geometric reference.');
   fail(utc(feature.effective.fromUtc)<utc(feature.effective.toUtc),'Volume effective interval must be ordered UTC.');
   fail(Number.isFinite(p.baseMeters)&&Number.isFinite(p.heightMeters)&&p.baseMeters>=0&&p.heightMeters>p.baseMeters&&p.heightMeters<=100000, 'Volume heights must be a finite geometric interval.');
  } else fail(feature.effective===undefined&&p.baseMeters===undefined&&p.heightMeters===undefined&&p.heightReference===undefined, 'Only qualified volumes may declare geometric heights.');
 }
 value.references ||= [];
 fail(Array.isArray(value.references)&&value.references.length<=8, 'Source references exceed the bound.');
 for(const r of value.references) fail(object(r)&&text(r.label)&&path(r.url)&&text(r.license)&&hex(r.sha256)&&(!r.upstreamUrl||(text(r.upstreamUrl)&&r.upstreamUrl.startsWith('https://'))), 'A reference needs a local source asset, SHA-256 and licence.');
 fail(new Set([...value.trackBundlePaths,...value.references.map(r=>r.url)]).size===value.trackBundlePaths.length+value.references.length, 'Source asset paths must be distinct.');
 validateSourceGeospatialTimeline(value);
 return freeze(value);
}
export function verifySurfaceReferences(scene, sources) {
 for(const feature of scene.surfaces.features) {
  const source=sources.find(item=>item.sha256===feature.properties.sourceHash);
  fail(source, 'Surface source hash has no verified reference.');
  let value=source.value;
  for(const segment of feature.properties.sourcePointer.slice(1).split('/')) {
   fail(!/~(?:[^01]|$)/.test(segment),'Malformed source pointer.'); const part=segment.replace(/~1/g,'/').replace(/~0/g,'~');
   fail(object(value)||Array.isArray(value), 'Source pointer is unresolved.');
   fail(Object.prototype.hasOwnProperty.call(value,part),'Source pointer is unresolved.'); value=value[part];
  }
  fail(value!==undefined,'Source pointer is unresolved.');
 }
}
export function sourceGeospatialMoments(records, scene) {
 return [...new Set(records.flatMap(r=>r.facts.filter(f=>f.kind===scene.roles.position).map(f=>new Date(utc(f.observed_at)).toISOString())))].sort();
}
export function sourceGeospatialMissingPositions(records, scene, atUtc) {
 const at=utc(atUtc), groups=new Map();
 for(const record of records) for(const fact of record.facts.filter(f=>f.kind===scene.roles.position&&utc(f.observed_at)<=at)) {
  const id=key([fact.entity_id,fact.source_id]), previous=groups.get(id);
  if(!previous||utc(fact.observed_at)>utc(previous.fact.observed_at)) groups.set(id,{fact,entity:record.entities.find(e=>e.id===fact.entity_id)});
 }
 return freeze([...groups.values()].filter(({fact})=>fact.value===null).map(({fact,entity})=>({entityId:fact.entity_id,label:entity.label,sourceId:fact.source_id,observedAtUtc:new Date(utc(fact.observed_at)).toISOString(),reason:fact.null_reason})).sort((a,b)=>a.entityId.localeCompare(b.entityId)||a.sourceId.localeCompare(b.sourceId)));
}
export function projectSourceGeospatial(scene, records, sourceKey, atUtc) {
 const at=utc(atUtc); fail(text(sourceKey), 'Exact source key is required.');
 fail(Array.isArray(records)&&records.length>0&&records.length<=3,'Supply admitted track records.');
 const features=clone(scene.surfaces.features.filter(f=>f.properties.role!=='volume'||(at>=utc(f.effective.fromUtc)&&at<utc(f.effective.toUtc)))).map(({effective,...feature})=>feature), groups=new Map(), entityIds=new Set();
 for(const record of records) {
  fail(record.schema==='evidence-inspection/v1'&&Array.isArray(record.facts)&&Array.isArray(record.sources)&&Array.isArray(record.entities),'Only admitted inspection records are supported.');
  for(const entity of record.entities) { fail(!entityIds.has(entity.id),'Entity IDs collide across track bundles.'); entityIds.add(entity.id); }
  const sourceById=new Map(record.sources.map(s=>[s.id,s]));
  for(const fact of record.facts.filter(f=>f.kind===scene.roles.position)) {
   fail(fact.unit==='deg'&&fact.datum==='WGS84'&&(fact.value===null||coordinates([fact.value.longitude,fact.value.latitude])),'Track positions require explicit WGS84 degrees.');
   utc(fact.observed_at); const source=sourceById.get(fact.source_id); fail(source&&hex(source.sha256),'Track source is unresolved.');
   const id=key([fact.entity_id,fact.source_id]); if(!groups.has(id)) groups.set(id,{entity:record.entities.find(e=>e.id===fact.entity_id),source,points:[],altitudes:record.facts.filter(f=>f.kind===scene.roles.altitude&&f.entity_id===fact.entity_id&&f.source_id===fact.source_id)});
   groups.get(id).points.push(fact);
  }
 }
 const sorted=[...groups.values()].sort((a,b)=>a.entity.id.localeCompare(b.entity.id)||a.source.id.localeCompare(b.source.id));
 sorted.forEach((group,groupIndex)=>{
  const all=group.points.sort((a,b)=>utc(a.observed_at)-utc(b.observed_at)||a.id.localeCompare(b.id));
  for(let i=1;i<all.length;i++) fail(utc(all[i].observed_at)!==utc(all[i-1].observed_at)||key(all[i].value)===key(all[i-1].value),'Conflicting positions at one source time cannot form a path.');
  const points=all.filter(f=>utc(f.observed_at)<=at), selected=points.at(-1); if(!selected)return;
  const paint=scene.trackColors[groupIndex%scene.trackColors.length], entityLabel=group.entity.label;
  const properties=f=>({role:'point',label:entityLabel,color:paint,sourceId:group.source.id,sourceHash:group.source.sha256,sourcePointer:f.evidence_ref,observedAtUtc:new Date(utc(f.observed_at)).toISOString()});
  let segment=[], segmentIndex=0;
  const flush=()=>{if(segment.length>=2) features.push({type:'Feature',id:`track:${group.entity.id}:${group.source.id}:${segmentIndex++}`,geometry:{type:'LineString',coordinates:segment.map(f=>[f.value.longitude,f.value.latitude])},properties:{...properties(segment[0]),role:'path',label:`${entityLabel} · observed samples`,lastObservedAtUtc:new Date(utc(segment.at(-1).observed_at)).toISOString(),status:'observed-path'}});segment=[];};
  for(const fact of points) {
   if(fact.value===null) {flush();continue;}
   const previous=segment.at(-1);
   if(previous) {
    const gap=(utc(fact.observed_at)-utc(previous.observed_at))/1000;
    if(gap>scene.gapAfterSeconds) {flush();features.push({type:'Feature',id:`gap:${fact.id}`,geometry:{type:'Point',coordinates:[fact.value.longitude,fact.value.latitude]},properties:{...properties(fact),label:`${entityLabel} · ${gap} s observation gap; no interpolation`,gapSeconds:gap,status:'gap'}});}
    else fail(Math.abs(fact.value.longitude-previous.value.longitude)<=180,'Antimeridian track needs a separate authored projection.');
   }
   segment.push(fact);
  }
  flush();
  if(selected.value===null)return;
  const age=(at-utc(selected.observed_at))/1000, stale=age>scene.staleAfterSeconds;
  const altitudes=group.altitudes.filter(f=>utc(f.observed_at)===utc(selected.observed_at));
  const altitudeLabel=altitudes.length?altitudes.map(f=>f.value===null?`unknown altitude · ${f.null_reason}`:`${f.value} ${f.unit} · ${f.datum}`).join(' / '):'Altitude unknown at this observation';
  features.push({type:'Feature',id:`point:${group.entity.id}:${group.source.id}`,geometry:{type:'Point',coordinates:[selected.value.longitude,selected.value.latitude]},properties:{...properties(selected),label:`${entityLabel} · ${stale?'stale':'observed'} · ${age.toFixed(3)} s before cursor`,altitudeLabel,status:stale?'stale':'observed'}});
 });
 fail(features.length<=1024&&entityIds.size<=64, 'Source display exceeds feature or entity bounds.');
 fail(new Set(features.map(f=>f.id)).size===features.length, 'Authored and observed feature IDs collide.');
 let coordinateCount=0;
 for(const f of features) {
  coordinateCount += f.geometry.type==='Point'?1:f.geometry.type==='Polygon'?f.geometry.coordinates.flat().length:f.geometry.coordinates.length;
  fail(text(f.id,256)&&text(f.properties.label)&&(!f.properties.altitudeLabel||text(f.properties.altitudeLabel,512)), 'Projected feature text exceeds its display bound.');
 }
 fail(coordinateCount<=16384, 'Source display exceeds its coordinate bound.');
 const projected={schema:'source-geospatial/v1',sourceKey,atUtc:new Date(at).toISOString(),collection:{type:'FeatureCollection',features}};
 fail(new TextEncoder().encode(JSON.stringify(projected)).length<=2000000, 'Source snapshot exceeds 2,000,000 bytes.');
 return freeze({schema:'source-geospatial/v1',sourceKey,atUtc:new Date(at).toISOString(),collection:{type:'FeatureCollection',features}});
}
