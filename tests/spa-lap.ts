import model from '../public/models/manifest.json';
import rig from '../src/model/wheel-rig.json';
import raceSpeed from '../src/tracks/spa-flying-speed.json';
import benchmark from '../data/tracks/spa/race-pace/benchmark.json';
import assert from 'node:assert/strict';
import {Box3,InstancedMesh,Matrix4,Ray,Vector3} from 'three';
import {SpaTrack,spaData} from '../src/tracks/SpaTrack';
import {turnStations} from '../src/tracks/SpaMarkers';
import {RacingLine} from '../src/optimizer/RacingLine';
import {Tyre} from '../src/motion/Tyre';
import {Suspension} from '../src/motion/Suspension';
import {DriverMemory} from '../src/motion/DriverMemory';
import {Cruise} from '../src/motion/Cruise';

// Isolate load changes from steering inputs and the map's estimated elevations.
function settled(vertical:number,opening:number){
 const unit=new Suspension(800,1.75,1.636);
 for(let i=0;i<240;i++)unit.step(1/240,60,0,0,0,vertical,opening);
 return unit;
}
const level=settled(0,0),valley=settled(5,0),crest=settled(-5,0),open=settled(0,1);
const total=(unit:Suspension)=>Object.values(unit.loads).reduce((sum,value)=>sum+value,0);
assert.ok(total(valley)>total(level) && total(level)>total(crest));
assert.ok(open.drag<level.drag && open.downforce<level.downforce && open.heave>level.heave);
const kerb=new Suspension(800,1.75,1.636);
kerb.ground.FL=.035;
kerb.step(1/240,0,0,0,0);
assert.ok(kerb.hub.FL>0 && kerb.hub.FL<kerb.ground.FL && kerb.hub.FL>kerb.hub.FR);

const stored=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)
}});
// A locked contact heats and wears one tread sector; heat decays but the flat survives.
const slick=new Tyre(.35);slick.omega=40/.35;
for(let i=0;i<120;i++)slick.step(1/240,40,-14000,4200,3200);
assert.ok(slick.locked && Math.max(...slick.wear)>0 && slick.pressure>160);
const damage=Math.max(...slick.wear),hot=Math.max(...slick.heat);
for(let i=0;i<1200;i++)slick.step(1/240,0,0,4000,2400);
assert.equal(Math.max(...slick.wear),damage);assert.ok(Math.max(...slick.heat)<hot*.05);
// Only label canvases need a DOM; road geometry and the driving model run normally.
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})}});
const track=new SpaTrack(),car=new Cruise(track,new RacingLine(track));
for(const key of ['FL','FR','RL','RR'] as const){
 const hub=new Vector3().fromArray(model.pivots[key]).add(new Vector3().fromArray(rig.wheels[key].center));
 hub.y=0;car.contactCenters[key]=hub;
}
// Check the rendered divider against the full car envelope through pit exit.
const divider=track.markings.getObjectByName('Spa pit divider')!;
const uprights=divider.children.find(part=>part instanceof InstancedMesh) as InstancedMesh;
const posts=Array.from({length:uprights.count},(_,i)=>{
 const m=new Matrix4();uprights.getMatrixAt(i,m);return new Vector3().setFromMatrixPosition(m);
});
// Include the wall half-thickness and 15 cm of clearance around the wing tips.
const footprint=new Box3(new Vector3(-1.24,-4,-3.09),new Vector3(1.24,4,3.09));
function checkExit(pose:ReturnType<Cruise['pose']>){
 const inverse=pose.quaternion.clone().invert();
 for(let i=1;i<posts.length;i++){
   if(posts[i].distanceToSquared(pose.position)>100)continue;
   const a=posts[i-1].clone().sub(pose.position).applyQuaternion(inverse);
   const b=posts[i].clone().sub(pose.position).applyQuaternion(inverse);
   const dir=b.clone().sub(a),length=dir.length();
   const hit=new Ray(a,dir.normalize()).intersectBox(footprint,new Vector3());
   assert.ok(!footprint.containsPoint(a) && (!hit || hit.distanceTo(a)>length),'pit divider clearance at '+car.s);
 }
 for(const hub of Object.values(car.contactCenters)){
   const contact=hub.clone().applyQuaternion(pose.quaternion).add(pose.position);
   const y=track.pit!.heightAt(contact);
   assert.ok(y!==undefined && Math.abs(y-contact.y)<.08,'wheel support at pit exit '+car.s);
 }
}
let kerbSamples=0,trailSamples=0;
const stats=turnStations.map((_,i)=>({turn:i+1,error:0,g:0,kph:0,steer:0,edge:0}));
car.lapCount=99;assert.equal(car.lapCount,44);
car.lapCount=Number(process.env.SPA_LAPS??1);
const pitBox=track.pit!.point(spaData.grid.s);
for(let start=0;start<2;start++){
 const parked=car.pose();
 assert.ok(parked.position.distanceTo(pitBox)<1e-6);
 car.toggle();
 assert.ok(car.pose().position.distanceTo(parked.position)<1e-6);
 assert.ok(car.pose().quaternion.angleTo(parked.quaternion)<1e-6);
 car.tick(1/60);
 assert.ok(car.pose().position.distanceTo(parked.position)<.01);
 if(start===0)car.reset();
}
// Interpolate timing gates within a frame on the first flying lap.
function referenceSpeed(s:number){const points=raceSpeed.points,w=track.wrap(s);let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].s<w)lo=mid+1;else hi=mid;}const a=points[(lo-1+points.length)%points.length],b=points[lo%points.length],span=track.wrap(b.s-a.s),t=span?track.wrap(w-a.s)/span:0;return a.speed+(b.speed-a.speed)*t;}
const gates=[5023,5200,5982,6430,6588,6637,6750,6900];
let gate=0,previousGateTime=0,busEntry=0,busTime=0,busExit=0;
const fastComplex={minimum:Infinity,peakBrake:0};
const peakRearSlip=[0,0];
let kemmelSamples=0,kemmelFullThrottle=0;
for(let frame=0;frame<18000*(car.lapCount+2) && car.status==='running';frame++){
 const lap=car.lap,station=car.s,time=car.elapsed;
 car.tick(1/60);
 if(car.timed && car.s>=2855 && car.s<=2885 || car.timed && car.s>=3130 && car.s<=3160){
   const d=car.dynamics;
   const rearSlip=Math.abs(Math.atan2(d.vy-1.636*d.yawRate,car.speed))*180/Math.PI;
   const window=car.s<3000?0:1;
   peakRearSlip[window]=Math.max(peakRearSlip[window],rearSlip);
 }
 if(car.timed && car.s>=850 && car.s<1160){fastComplex.minimum=Math.min(fastComplex.minimum,car.speed*3.6);fastComplex.peakBrake=Math.max(fastComplex.peakBrake,car.gearbox.brake);}
 if(car.timed && car.s>=1400 && car.s<1950){
   kemmelSamples++;
   if(car.gearbox.throttle>=.99)kemmelFullThrottle++;
 }
 if(lap===2 && !car.lastLap && station<gates[gate] && car.s>=gates[gate]){
   const fraction=(gates[gate]-station)/(car.s-station);
   const crossing=time+fraction*(car.elapsed-time);
   console.log('S3 gate',gates[gate], 'interval',gate?(crossing-previousGateTime).toFixed(3):'-',
     'km/h',(car.speed*3.6).toFixed(1),'PER reference',(referenceSpeed(gates[gate])*3.6).toFixed(1));
   if(gates[gate]===6430)busEntry=crossing;
   if(gates[gate]===6900){busTime=crossing-busEntry;busExit=car.speed*3.6;}
   previousGateTime=crossing;gate++;
 }
 const i=turnStations.reduce((nearest,s,j)=>Math.abs(s-car.s)<Math.abs(turnStations[nearest]-car.s)?j:nearest,0);
 const stat=stats[i],offset=Math.abs(car.dynamics.offset);
 stat.error=Math.max(stat.error,offset);
 stat.g=Math.max(stat.g,Math.abs(car.dynamics.ay)/9.81);
 stat.steer=Math.max(stat.steer,Math.abs(car.dynamics.steer)*180/Math.PI);
 if(car.timed && Math.abs(car.s-turnStations[i])<2)stat.kph=car.speed*3.6;
 const road=track.pose(car.s),normal=new Vector3(1,0,0).applyQuaternion(road.quaternion);
 const pose=car.pose();
 if(car.lap===1 && car.s<=490)checkExit(pose);
 for(const [key,local] of Object.entries(car.contactCenters)){
   const point=local.clone().applyQuaternion(pose.quaternion).add(pose.position);
   const section=track.pose(car.s+local.z);
   const left=new Vector3(1,0,0).applyQuaternion(section.quaternion);
   const lateral=point.sub(section.position).dot(left);
   const wheelStation=track.wrap(car.s+local.z);
   const kerbWidth=track.curbSide(wheelStation)===Math.sign(lateral)?.8:0;
   const pitStation=car.lastLap?car.s-track.length:car.s;
   let pitEdge=Infinity;
   if(!car.timed && pitStation>=-415 && pitStation<=488){
     const ps=pitStation+local.z,dir=track.pit!.point(ps+1).sub(track.pit!.point(ps-1)).normalize();
     const pitNormal=new Vector3(dir.z,0,-dir.x).normalize();
     const wheel=local.clone().applyQuaternion(pose.quaternion).add(pose.position);
     pitEdge=Math.abs(wheel.sub(track.pit!.point(ps)).dot(pitNormal))-3.2+.19;
   }
   stat.edge=Math.max(stat.edge,Math.min(pitEdge,Math.abs(lateral)-kerbWidth+(key[0]==='F'?.15:.19)-track.width(car.s+local.z,lateral)));
 }
 if(car.timed && Object.values(car.dynamics.suspension.surfaceGrip).some(g=>g<.99))kerbSamples++;
 if(car.timed && car.gearbox.brake>.025 && Math.abs(car.dynamics.steer)>.025 && Math.abs(car.dynamics.ay)>4)trailSamples++;
 assert.ok(Number.isFinite(car.speed+car.dynamics.offset+car.dynamics.suspension.heave));
}
assert.ok(kemmelFullThrottle>kemmelSamples*.6,"Kemmel acceleration should use full throttle");
assert.equal(car.history.length,car.lapCount);

console.log('Eau Rouge–Raidillon',fastComplex);
assert.ok(fastComplex.peakBrake<.15 && fastComplex.minimum>275,'dry flying lap through Eau Rouge–Raidillon');
const fastest=car.history.reduce((best,row)=>row[2]<best[2]?row:best);
console.log('Fastest flying lap',fastest[2].toFixed(3),'sectors',fastest.map((v,i)=>+(v-(fastest[i-1]??0)).toFixed(3)));
assert.ok(fastest[2]<107,'fresh-session Spa attack lap pace regression');
console.log('First lap times', [...car.history.map(row=>row[2]),car.elapsed].slice(0,5));
console.table(stats.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,+v.toFixed(2)]))));
assert.equal(car.status,'complete');assert.equal(car.splits.length,0);
console.log('Last timed lap seconds',car.history.at(-1)![2].toFixed(3));
// Local regression limits, not claimed real-world performance.
assert.ok(stats[17].g<4 && stats[17].error<1.3,'T18 braking or tracking regression');
console.log('Bus Stop 6430–6900 m',busTime.toFixed(3),'s · exit',busExit.toFixed(1),'km/h');
assert.ok(busTime>0 && busTime<22 && busExit>210,'Bus Stop gate time and exit traction');
assert.ok(car.history.every(row=>row.length===3 && row[0]>0 && row[1]>row[0] && row[2]>row[1]));

console.log("Kerb and trail braking samples",kerbSamples,trailSamples);
assert.ok(kerbSamples>0 && trailSamples>0);
assert.ok(stats.every(s=>s.kph>0 && s.g<6 && s.edge<.05),'all 19 corner envelopes');

if(car.history.length>=3){
 const flying=car.history;const mean=flying.reduce((a,r)=>a+r[2],0)/flying.length;
 const sectors=[0,1,2].map(i=>flying.reduce((a,r)=>a+r[i]-(r[i-1]??0),0)/flying.length);
 console.log('Flying mean (excludes start and stop laps)',mean.toFixed(3),'sectors',sectors.map(s=>s.toFixed(3)));
 console.log('Observed delta vs clean race mean (s)',(mean-benchmark.mean).toFixed(3));
}

const restored=new DriverMemory();
assert.equal(restored.laps.length,Math.min(60,car.lapCount));
assert.ok(restored.corners.some(r=>r.time>0 && r.pickup>0));

console.log('T8 entry / T9 rear slip peaks (degrees)',peakRearSlip.map(x=>x.toFixed(1)));
assert.ok(peakRearSlip.every(peak=>peak<9),'repeatable rear stability through Bruxelles and the following left');
assert.ok(restored.slides.length>0,'slide positions survive reload');
car.reset();car.toggle();
for(const mark of restored.slides){
 const index=Math.round(track.wrap(mark.station-car.s)/car.planStep)%car.pathLengths.length;
 assert.ok(car.speedPlan[index]<=mark.safeSpeed+.001,'restored slide constrains the next run');
}
