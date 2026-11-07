const menu=document.querySelector('.menu-toggle');
const nav=document.querySelector('.site-header nav');
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open);});
nav.addEventListener('click',e=>{if(e.target.closest('a')){menu.setAttribute('aria-expanded','false');nav.classList.remove('open');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.setAttribute('aria-expanded','false');nav.classList.remove('open');}});
const steps=[
 {repo:'81rv10 / DRONE DASHBOARD',title:'Six points. One inspection plan.',description:'Rack A and Rack B, across tiers 1–3. The dashboard labels the entire mission as simulation.',receiver:'Unobserved',flag:'—'},
 {repo:'AGENTIC-GRAPH / FLIGHT SIMULATOR',title:'A bounded path, tested in simulation.',description:'Load the flight example. Take off above 1 m, hover and land. Export a kinematic flight-path contract bound to its SHA-256 digest.',receiver:'Unobserved',flag:'—'},
 {repo:'GAMEXR / DRONE BENCH',title:'Review the path. Lease the authority.',description:'The local demo reviews duration and samples, then receives a simulated landing acknowledgement. Switching tabs zeroes throttle and revokes authority.',receiver:'Simulated ack',flag:'—'},
 {repo:'81rv10 / EVIDENCE INSPECTOR',title:'One capture needs a human review.',description:'Attach a capture to P3, mark it for follow-up and export the dossier JSON. Evidence labels are human-entered today.',receiver:'Unobserved',flag:'01'},
 {repo:'MCP / WEBMCP',title:'/drone.inspect @dashboard #mission',description:'drone_dashboard.inspect returns 6 points, 1 flagged and receiver “unobserved”. Missing telemetry never appears healthy.',receiver:'Unobserved',flag:'01'}
];
const stepButtons=[...document.querySelectorAll('.demo-step')];
function selectStep(index){
 const step=steps[index];
 stepButtons.forEach((b,i)=>{b.classList.toggle('active',i===index);b.setAttribute('aria-pressed',String(i===index));});
 document.getElementById('demo-repo').textContent=step.repo;
 document.getElementById('demo-title').textContent=step.title;
 document.getElementById('demo-description').textContent=step.description;
 document.getElementById('receiver-value').textContent=step.receiver;
 document.getElementById('flag-value').textContent=step.flag;
 document.querySelectorAll('.point').forEach(p=>{p.classList.toggle('visited',index>0);p.classList.toggle('flagged',index>=3&&p.dataset.point==='3');});
}
stepButtons.forEach((button,index)=>button.addEventListener('click',()=>selectStep(index)));
const spokes=document.getElementById('ecosystem-spokes');
const svgNS='http://www.w3.org/2000/svg';
for(let i=0;i<12;i++){
 const angle=(i*30-90)*Math.PI/180;
 const x=260+190*Math.cos(angle), y=260+190*Math.sin(angle);
 const line=document.createElementNS(svgNS,'line');
 Object.entries({x1:260+90*Math.cos(angle),y1:260+90*Math.sin(angle),x2:x,y2:y,stroke:'#afc9c3','stroke-width':'1'}).forEach(([k,v])=>line.setAttribute(k,v));
 const node=document.createElementNS(svgNS,'circle');
 Object.entries({cx:x,cy:y,r:18,fill:'#edf5f4',stroke:'#087b78','stroke-width':'1'}).forEach(([k,v])=>node.setAttribute(k,v));
 const label=document.createElementNS(svgNS,'text');
 Object.entries({x,y:y+4,'text-anchor':'middle',fill:'#087b78','font-size':'12','font-family':'Arial'}).forEach(([k,v])=>label.setAttribute(k,v));
 label.textContent=String(i+1).padStart(2,'0');spokes.append(line,node,label);
}
