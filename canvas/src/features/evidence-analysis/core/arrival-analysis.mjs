import{canonicalJson,EvidenceError,normalizedValue,readEvidence,utcMillis} from './evidence-kernel.mjs';

export const ARRIVAL_ALGORITHM='arrival-analysis/v1';
const check=(ok,code,message)=>{if(!ok) throw new EvidenceError(code,message);};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const freeze=value=>{
if(value&&typeof value==='object'){Object.values(value).forEach(freeze); Object.freeze(value);}
return value;
};
function keys(value,expected){
check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===expected.length
&& expected.every(key=>Object.hasOwn(value,key)),'ARRIVAL_POLICY','Invalid p fields.');
}
function policyOf(input){
const p=JSON.parse(canonicalJson(input));
keys(p,['schema','id','profile','roles','components','partitions','scope','distance','model','evaluation','ui']);
keys(p.profile,['id','version']); keys(p.roles,['schedule','plan','position','destination','speed','truth','truthBasis','partition']);
keys(p.components,['longitude','latitude']); keys(p.partitions,['train','calibration','test']);
check(p.schema==='arrival-policy/v1'&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=120
&& Object.values(p.roles).every(x=>typeof x==='string')&&new Set(Object.values(p.roles)).size===8
&& Object.values(p.components).every(x=>typeof x==='string')&&p.components.longitude!==p.components.latitude,'ARRIVAL_POLICY','Invalid p or roles.');
let previous=-Infinity;
for(const name of ['train','calibration','test']){
const window=p.partitions[name]; keys(window,['fromUtc','toUtc']);
const start=utcMillis(window.fromUtc),end=utcMillis(window.toUtc);
check(start<end&&start>=previous,'ARRIVAL_LEAKAGE','Partitions overlap or reverse.'); previous=end;
}
keys(p.scope,['label','latitude','longitude','supportedTypes','caseType']);
for(const [axis,limit] of [['latitude',90],['longitude',180]]){
const bounds=p.scope[axis]; check(Array.isArray(bounds)&&bounds.length===2&&bounds.every(x=>Number.isFinite(x)&&Math.abs(x)<=limit)
&& bounds[0]<bounds[1],'ARRIVAL_POLICY','Invalid study bounds.');
}
check(typeof p.scope.label==='string'&&Array.isArray(p.scope.supportedTypes)&&p.scope.supportedTypes.length>0
&& p.scope.supportedTypes.every(x=>typeof x==='string')&&typeof p.scope.caseType==='string','ARRIVAL_POLICY','Invalid scope/type p.');
keys(p.distance,['method','radiusMetres','datum','unit']);
check(p.distance.method==='sphere-haversine/v1'&&Number.isFinite(p.distance.radiusMetres)
&& p.distance.radiusMetres>=6000000&&p.distance.radiusMetres<=7000000&&p.distance.unit==='deg'
&& typeof p.distance.datum==='string','ARRIVAL_POLICY','Unsupported distance model.');
keys(p.model,['method','calibration','nominalCoverage','minimumTrainingCases']);
check(p.model.method==='median-track-residual/v1'&&p.model.calibration==='absolute-residual-order-statistic/v1'
&& p.model.nominalCoverage===0.9&&Number.isInteger(p.model.minimumTrainingCases)&&p.model.minimumTrainingCases>=1,'ARRIVAL_POLICY','Unsupported model.');
const e=p.evaluation;
keys(e,['sampleSecondsBeforeTruth','minimumQualifiedArrivals','minimumCoverage','lateSeconds','leadSeconds','minimumLeadCoverage','maximumFeatureAgeSeconds','maximumRemainingSeconds','independentTruthBasis','advisoryRule']);
check(e.sampleSecondsBeforeTruth===1800&&e.minimumQualifiedArrivals===200&&e.minimumCoverage===0.85
&& e.lateSeconds===600&&e.leadSeconds===1200&&e.minimumLeadCoverage===0.7,'ARRIVAL_POLICY','Verification thresholds changed.');
check(Number.isFinite(e.maximumFeatureAgeSeconds)&&e.maximumFeatureAgeSeconds>=0&&e.maximumFeatureAgeSeconds<=3600
&& Number.isFinite(e.maximumRemainingSeconds)&&e.maximumRemainingSeconds>0&&e.maximumRemainingSeconds<=86400
&& typeof e.independentTruthBasis==='string'&&e.independentTruthBasis.length>0
&& e.advisoryRule==='interval-lower-exceeds-plan-plus-threshold','ARRIVAL_POLICY','Invalid prediction p.');
return p;
}
const median=values=>{
if(!values.length) return null;
const v=[...values].sort((a,b)=>a - b),middle=Math.floor(v.length/2);
return v.length % 2?v[middle]:(v[middle - 1]+v[middle])/2;
};
const utc=ms=>ms===null?null:new Date(Math.round(ms)).toISOString();
function distance(a,b,p){
const radians=Math.PI/180,c=p.components;
const latA=a[c.latitude]*radians,latB=b[c.latitude]*radians;
const h=Math.sin((latB - latA)/2) ** 2+Math.cos(latA)*Math.cos(latB)*Math.sin((b[c.longitude] - a[c.longitude])*radians/2) ** 2;
return 2*p.distance.radiusMetres*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
function parseCase(data,entity,p){
const facts=data.derived.facts.filter(fact=>fact.entity_id===entity.id),fields={};
const expectedTypes={schedule: 'utc',plan: 'utc',position: 'vector',destination: 'vector',speed: 'number',truth: 'utc',truthBasis: 'string',partition: 'string'};
check(facts.length===8,'ARRIVAL_COLLISION','Require one fact per role.');
for(const [role,kind] of Object.entries(p.roles)){
const matches=facts.filter(fact=>fact.kind===kind),definition=data.profile.fields.find(field=>field.key===kind);
check(matches.length===1&&definition?.type===expectedTypes[role],'ARRIVAL_COLLISION','Conflicting role evidence.'); fields[role]=matches[0];
}
const asOf=utcMillis(fields.position.observed_at),part=fields.partition.value;
check(Object.hasOwn(p.partitions,part),'ARRIVAL_PARTITION','Unknown partition.');
const window=p.partitions[part],start=utcMillis(window.fromUtc),end=utcMillis(window.toUtc);
check(asOf>=start&&asOf<end,'ARRIVAL_LEAKAGE','Case outside its partition.');
for(const role of ['schedule','plan','position','destination','speed','partition']){
check(utcMillis(fields[role].observed_at)<=asOf&&utcMillis(fields[role].retrieved_at)<=asOf,'ARRIVAL_LEAKAGE','Future feature or plan.');
}
const reasons=[],missing=role=>{
if(fields[role].value===null){reasons.push(`${role}: ${fields[role].null_reason}`); return true;} return false;
};
const truth=fields.truth.value===null?null:utcMillis(fields.truth.value);
if(truth===null) missing('truth');
else{
check(utcMillis(fields.truth.observed_at)>=truth&&utcMillis(fields.truth.retrieved_at)<end
&& utcMillis(fields.truthBasis.retrieved_at)<end,'ARRIVAL_LEAKAGE','Truth timing crosses partition.');
if((truth - asOf)/1000!==p.evaluation.sampleSecondsBeforeTruth) reasons.push('Snapshot horizon differs.');
}
const inside=value=>['latitude','longitude'].every(axis=>value[p.components[axis]]>=p.scope[axis][0]&&value[p.components[axis]]<=p.scope[axis][1]);
let remaining=null;
const inputMissing=['position','destination','speed'].map(missing).some(Boolean);
if(!inputMissing){
for(const role of ['position','destination']) check(fields[role].datum===p.distance.datum&&fields[role].unit===p.distance.unit
&& Object.keys(fields[role].value).length===2&&Object.values(p.components).every(key=>Number.isFinite(fields[role].value[key])),'ARRIVAL_DATUM','Coordinate reference mismatch.');
const definition=data.profile.fields.find(field=>field.key===p.roles.speed);
check(definition.canonicalUnit==='m/s','ARRIVAL_UNIT','Speed must normalize to m/s.');
const speed=normalizedValue(fields.speed,definition);
if(speed<=0) reasons.push('Ground speed must be positive.');
else remaining=distance(fields.position.value,fields.destination.value,p)/speed;
if(!inside(fields.position.value)||!inside(fields.destination.value)) reasons.push('Outside study region.');
if(['position','speed'].some(role=>(asOf - utcMillis(fields[role].observed_at))/1000>p.evaluation.maximumFeatureAgeSeconds)) reasons.push('Track features are stale.');
if(remaining!==null&&(!Number.isFinite(remaining)||remaining<=0||remaining>p.evaluation.maximumRemainingSeconds)) reasons.push('Remaining time out of bounds.');
}
if(!p.scope.supportedTypes.includes(p.scope.caseType)) reasons.push('Unsupported case type.');
const scheduled=fields.schedule.value===null?null:utcMillis(fields.schedule.value),plan=fields.plan.value===null?null:utcMillis(fields.plan.value);
return{id: entity.id,label: entity.label,partition: part,classification: data.derived.dataset.classification,sourceRef: data.identity,asOf,truth,scheduled,plan,remaining,reasons,unavailable: ['schedule','plan','truthBasis'].filter(role=>fields[role].value===null).map(role=>({role,reason: fields[role].null_reason})),qualified: data.derived.dataset.classification==='imported'&&fields.truthBasis.value===p.evaluation.independentTruthBasis,truthBasis: fields.truthBasis.value,facts};
}
// Inference receives no truth.
function forecast(snapshot,bias,radius){
const constantSpeed=snapshot.remaining===null?null:snapshot.asOf+snapshot.remaining*1000;
const candidate=constantSpeed===null||bias===null?null:constantSpeed+bias*1000;
return{constantSpeed,candidate,lower: candidate===null||radius===null?null:candidate - radius*1000,upper: candidate===null||radius===null?null:candidate+radius*1000};
}
export function analyzeArrivals(handles,inputPolicy){
check(Array.isArray(handles)&&handles.length>0&&handles.length<=40,'ARRIVAL_LIMIT','Supply 1–40 admitted batches.');
const cfg=policyOf(inputPolicy),records=handles.map(readEvidence),rows=[],seen=new Set();
for(const data of records){
check(data.profile.id===cfg.profile.id&&data.profile.version===cfg.profile.version,'ARRIVAL_PROFILE','Batch/profile revision mismatch.');
for(const entity of data.derived.entities){
check(!seen.has(entity.id),'ARRIVAL_LEAKAGE','Duplicate case across batches.'); seen.add(entity.id);
rows.push(parseCase(data,entity,cfg));
}
}
check(rows.length<=400,'ARRIVAL_LIMIT','Too many arrival cases.');
rows.sort((a,b)=>a.asOf - b.asOf||compare(a.id,b.id));
const usable=rows.filter(row=>row.reasons.length===0),part=name=>usable.filter(row=>row.partition===name);
const training=part('train'),calibration=part('calibration'),heldout=part('test');
const bias=training.length<cfg.model.minimumTrainingCases?null
: median(training.map(row=>(row.truth - forecast({asOf: row.asOf,remaining: row.remaining},null,null).constantSpeed)/1000));
const resid=bias===null?[]:calibration.map(row=>Math.abs((row.truth
- forecast({asOf: row.asOf,remaining: row.remaining},bias,null).candidate)/1000)).sort((a,b)=>a - b);
const rank=Math.ceil((resid.length+1)*cfg.model.nominalCoverage);
const radius=resid.length>0&&rank<=resid.length?resid[rank - 1]:null;
const modelReasons=[];
if(bias===null) modelReasons.push('Insufficient training cases.');
if(radius===null) modelReasons.push('Too few calibrators for a finite interval.');
const preds=heldout.map(row=>{
const estimate=forecast({asOf: row.asOf,remaining: row.remaining},bias,radius);
const predicted=estimate.candidate!==null&&estimate.candidate>row.asOf&&(estimate.candidate - row.asOf)/1000<=cfg.evaluation.maximumRemainingSeconds;
return{row,...estimate,candidate: predicted?estimate.candidate:null,lower: predicted?estimate.lower:null,upper: predicted?estimate.upper:null};
});
const errors=name=>{
const pairs=preds.filter(p=>(name==='scheduled'?p.row.scheduled:p[name])!==null);
return{count: pairs.length,medianAbsoluteErrorSeconds: median(pairs.map(p=>Math.abs(((name==='scheduled'?p.row.scheduled:p[name]) - p.row.truth)/1000)))};
};
const comparison=name=>{
const pairs=preds.filter(p=>p.candidate!==null&&(name==='scheduled'?p.row.scheduled:p[name])!==null);
const baseline=median(pairs.map(p=>Math.abs(((name==='scheduled'?p.row.scheduled:p[name]) - p.row.truth)/1000)));
const candidate=median(pairs.map(p=>Math.abs((p.candidate - p.row.truth)/1000)));
return{count: pairs.length,baselineMedianAbsoluteErrorSeconds: baseline,candidateMedianAbsoluteErrorSeconds: candidate,improved: pairs.length>0&&candidate<baseline};
};
const intervals=preds.filter(p=>p.lower!==null),covered=intervals.filter(p=>p.row.truth>=p.lower&&p.row.truth<=p.upper).length;
const late=preds.filter(p=>p.row.plan!==null&&p.row.truth - p.row.plan>cfg.evaluation.lateSeconds*1000);
const alerts=preds.filter(p=>p.row.plan!==null&&p.lower!==null&&p.lower - p.row.plan>cfg.evaluation.lateSeconds*1000);
const positives=alerts.filter(p=>p.row.truth - p.row.plan>cfg.evaluation.lateSeconds*1000);
const leadQualified=positives.filter(p=>p.row.truth - p.row.asOf>=cfg.evaluation.leadSeconds*1000);
const qualifiedN=usable.filter(row=>row.qualified).length,allQualified=usable.length>0&&usable.every(row=>row.qualified);
const intervalCoverage=heldout.length?covered/heldout.length:null;
const leadCoverage=late.length?leadQualified.length/late.length:null;
const pairsByBaseline={scheduled: comparison('scheduled'),constantSpeed: comparison('constantSpeed')};
const eligible=allQualified&&qualifiedN>=cfg.evaluation.minimumQualifiedArrivals&&heldout.length>0&&modelReasons.length===0;
const vcc3=eligible&&Object.values(pairsByBaseline).every(value=>value.improved)
&& intervalCoverage!==null&&intervalCoverage>=cfg.evaluation.minimumCoverage;
const vcc4=eligible&&late.length>0&&leadCoverage>=cfg.evaluation.minimumLeadCoverage;
const reasons=[...modelReasons];
if(!allQualified) reasons.push('Synthetic/fixture/non-independent truth cannot qualify.');
if(qualifiedN<cfg.evaluation.minimumQualifiedArrivals) reasons.push('Fewer than 200 qualified arrival declarations.');
if(!heldout.length) reasons.push('No usable held-out cases.');
const model={method: cfg.model.method,calibrationMethod: cfg.model.calibration,status: modelReasons.length?'incomplete':'fitted',correctionSeconds: bias,intervalRadiusSeconds: radius,nominalCoverage: cfg.model.nominalCoverage,calibrationRank: rank,trainingCaseIds: training.map(row=>row.id),calibrationCaseIds: calibration.map(row=>row.id),identity:{algorithm: ARRIVAL_ALGORITHM,policy: cfg,training: training.map(row=>({caseId: row.id,source: row.sourceRef})),calibration: calibration.map(row=>({caseId: row.id,source: row.sourceRef}))}};
return freeze({schema: 'arrival-analysis/v1',algorithm: ARRIVAL_ALGORITHM,profiles: records.map(data=>data.derived.profile).sort((a,b)=>compare(canonicalJson(a),canonicalJson(b))),sources: records.map(data=>({dataset: data.derived.dataset,identity: data.identity,sources: data.derived.sources})).sort((a,b)=>compare(a.identity.originalSha256,b.identity.originalSha256)),policy: cfg,model,counts:{total: rows.length,train: training.length,calibration: calibration.length,test: heldout.length,excluded: rows.length - usable.length,qualified: qualifiedN},exclusions: rows.filter(row=>row.reasons.length).map(row=>({id: row.id,partition: row.partition,reasons: row.reasons})),metrics:{scheduled: errors('scheduled'),constantSpeed: errors('constantSpeed'),candidate: errors('candidate'),comparisons: pairsByBaseline,interval:{nominalCoverage: cfg.model.nominalCoverage,totalHeldout: heldout.length,evaluated: intervals.length,covered,empiricalCoverage: intervalCoverage}},advisory:{rule: cfg.evaluation.advisoryRule,evaluatedPlanCount: preds.filter(p=>p.row.plan!==null).length,missingPlanCount: preds.filter(p=>p.row.plan===null).length,lateCount: late.length,alertedCount: alerts.length,truePositiveCount: positives.length,falsePositiveCount: alerts.length - positives.length,leadQualifiedCount: leadQualified.length,precision: alerts.length?positives.length/alerts.length:null,leadCoverage,oneForecastPerCase: true},cases: rows.map(row=>{const p=preds.find(p=>p.row.id===row.id); return{id: row.id,partition: row.partition,classification: row.classification,asOfUtc: utc(row.asOf),truthUtc: utc(row.truth),truthBasis: row.truthBasis,eligibleDeclaration: row.qualified,status: row.reasons.length?'excluded':'evaluated',reasons: row.reasons,unavailable: row.unavailable,scheduledUtc: utc(row.scheduled),planUtc: utc(row.plan),constantSpeedUtc: p?utc(p.constantSpeed):null,candidateUtc: p?utc(p.candidate):null,lowerUtc: p?utc(p.lower):null,upperUtc: p?utc(p.upper):null,advisory: p?alerts.includes(p):false,leadSeconds: p&&alerts.includes(p)?(row.truth - row.asOf)/1000:null};}),acceptance:{eligible,count: qualifiedN,minimum: cfg.evaluation.minimumQualifiedArrivals,passed: vcc3&&vcc4,vcc3,vcc4,qualification: 'Declared qualification; hashes do not verify truth.',reasons},cost:{modelCalls: 0,billedApiCalls: 0,estimatedCost: 0}});
}
