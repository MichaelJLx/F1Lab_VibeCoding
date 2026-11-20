import {DriverMemory,type SlideMark} from './DriverMemory';
import {straightModeZone} from './ActiveAero';
import fastLine from '../tracks/spa-fast-line.json';
import flying from '../tracks/spa-flying-speed.json';
import {Gearbox,plannedForce} from './Gearbox';
import * as T from 'three';
import {SpaTrack,spaData} from '../tracks/SpaTrack';
import {aeroForces,tyreCapacity,corners,suspensionParameters,type Corner} from './Suspension';
import {LateralDynamics,lateralParameters} from './LateralDynamics';
import {splitStations,turnStations} from '../tracks/SpaMarkers';
import racePath from '../tracks/spa-race-path.json';
import {RacingLine,racingLineData} from '../optimizer/RacingLine';
export type PlanRequest={lap:number,count:number,weights:number[],slides:SlideMark[],observations:[number,number][][]};
export type LapPlan=ReturnType<Cruise['planLap']>;
export type CruiseStatus='idle'|'running'|'paused'|'complete';
type DriverTrace={entry:number,minimum:number,brakeRelease:number,turnIn:number,pickup:number,full:number};
type RegionResult={time:number,exit:number,trace:DriverTrace};
export type LapTiming={lap:number,total?:number,regions?:RegionResult[],sectors:{ms:number,color:'purple'|'green'|'yellow'}[]};
function sectorColor(ms:number,personal:number,session:number){
 if(ms<session)return 'purple' as const;
 if(ms<personal)return 'green' as const;
 return 'yellow' as const;
}
export type CruiseSnapshot={power?:{electric:number,wheels:number,energy:number},aero?:{front:number,rear:number,drag:number},tyres?:Record<string,{pressure:number,contact:number,wear:number,locked:boolean}>,station?:number,gear?:number,rpm?:number,throttle?:number,brake?:number,finishHold?:boolean,phase?:"out"|"timed"|"in",status:CruiseStatus,speed:number,progress:number,elapsed:number,distance:number,steer?:number,lateralG?:number,slip?:number,roll?:number,pitch?:number,heave?:number,lap?:number,lastLap?:number,bestLap?:number,timingRows?:LapTiming[],splits?:number[],aeroZone?:number,loads?:Record<string,number>};
// Split linked corners halfway between their mapped apexes. Each window includes entry and exit.
const ends=turnStations.map((s,i)=>(s+(turnStations[i+1]??Infinity))/2);
const region=(s:number)=>ends.findIndex(end=>s<end);
const blank=()=>turnStations.map(()=>0);
const drag=.5*suspensionParameters.airDensity*suspensionParameters.dragArea;
const wheelPower=660000; // Representative peak wheel power, W (estimate).
const topSpeed=Math.cbrt(wheelPower/drag);
// Registered 2024 lap, m/s. Use pace to identify the spatial scale of a bend.
function referenceSpeed(station:number){
 const samples=flying.points;
 let lo=0,hi=samples.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(samples[mid].s<station)lo=mid+1;else hi=mid;}
 const b=samples[lo%samples.length],a=samples[(lo+samples.length-1)%samples.length];
 const wrap=(d:number)=>d<0?d+spaData.geometryLength:d;
 return T.MathUtils.lerp(a.speed,b.speed,wrap(station-a.s)/Math.max(.01,wrap(b.s-a.s)));
}
const fastSections=spaData.nodes.map(n=>T.MathUtils.smoothstep(referenceSpeed(n.s),52,82));
function driveAcceleration(v:number){
 return Math.min(14,(plannedForce(v)-drag*v*v)/lateralParameters.mass);
}
/** Route-constrained automatic tour. Speed/steering/suspension respond continuously; not free driving. */
export class Cruise {
 contactCenters:Partial<Record<Corner,T.Vector3>>={};
 gearbox=new Gearbox(); finishHold=0; exits=blank();
 regionHistory:RegionResult[][]=[];
 splits:number[]=[];
 lap=1; private count=1; history:number[][]=[]; private weights=blank(); private regionTimes=blank();
 private memory=new DriverMemory();
 private incidents=blank();
 private slideBins=new Set<number>();
 private traces=turnStations.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));
 private brakeForce=0;
 private braking=false;
 private pickup=blank();
 private restoreDriver(){
   this.weights=this.memory.corners.map(r=>r.line);
   this.pickup=this.memory.corners.map(r=>r.pickup);
   this.memory.corners.forEach((r,i)=>{if(r.time)this.observations[i].set(r.line,r.time);});
 }
 private observations=turnStations.map(()=>new Map<number,number>());
 private comparable=true;
 get lapCount(){return this.count;}
 set lapCount(n:number){if(this.status==='idle'||this.status==='complete')this.count=Math.max(1,Math.min(44,Math.trunc(n)||1));}
 get timed(){return this.lap>1 && !this.lastLap;}
 get lastLap(){return this.lap===this.lapCount+2;}
 private pathCache=new Map<string,T.CatmullRomCurve3>();
 setPath(weights:number[]){
   const key=weights.join(',');
   const cached=this.pathCache.get(key);
   if(cached){this.racePath=cached;return;}
   const margins=spaData.nodes.map(n=>{
     const side=this.track.curbSide(n.s);
     const j=region(n.s),apex=turnStations[j];
     const apexCurvature=this.track.curvature(apex);
     const use=side===Math.sign(apexCurvature)?Math.exp(-(((n.s-apex)/35)**2)):0;
     // Allow for the axle sweeping inside the centre path on a tight hairpin.
     const cutAllowance=1.06-Math.min(.52,Math.abs(apexCurvature)*lateralParameters.frontArm**2);
     return {left:1.5-(side>0?use:0)*cutAllowance,right:1.5-(side<0?use:0)*cutAllowance,use,side};
   });
   const points=spaData.nodes.map((n,i)=>{
     const seam=Math.min(n.s,this.track.length-n.s);
     const j=region(n.s),start=ends[j-1]??0,end=ends[j];
     const fade=Math.min(35,(turnStations[j]-start)/2,(end-turnStations[j])/2);
     const blend=weights[j]*T.MathUtils.smoothstep(Math.min(n.s-start,end-n.s),0,fade);
     const offset=T.MathUtils.lerp(racePath.offsets[i],racingLineData.offsets[i],blend*T.MathUtils.smoothstep(seam,30,120));
     const apexShift=(weights[j]-.5)*14;
     const apexFraction=Math.exp(-(((n.s-turnStations[j]-apexShift)/24)**2));
     const cut=blend*apexFraction;
     const inside=Math.sign(this.track.curvature(turnStations[j]));
     const reserve=1.5-.30*cut+1.1*Math.exp(-((n.s-238)**2)/6400);
     const m=margins[i];
     const edge=m.side>0?n.widthLeft-m.left:-n.widthRight+m.right;
     const line=T.MathUtils.lerp(offset+inside*.60*cut,edge,m.use*weights[j]);
     return this.track.point(n.s,T.MathUtils.clamp(line,-n.widthRight+Math.min(reserve,m.right),n.widthLeft-Math.min(reserve,m.left)));
   });
   // Fair the reconstructed S3 line laterally within each road cross-section.
   // This removes short kinks without moving the curve along the lap or cutting corners.
   const sections=spaData.nodes.map((n,i)=>{
     const center=this.track.point(n.s),normal=this.track.point(n.s,1).sub(center);
     const weight=T.MathUtils.smoothstep(n.s,4860,4920)*(1-T.MathUtils.smoothstep(n.s,6400,6460));
     return {center,normal,weight,initial:points[i].clone().sub(center).dot(normal)};
   });
   for(let pass=0;pass<24;pass++){
     const offsets=sections.map(({center,normal,weight,initial},i)=>{
       if(!weight)return initial;
       const n=spaData.nodes[i];
       const mean=points[i-1].clone().lerp(points[i+1],.5).sub(center).dot(normal);
       const corrected=T.MathUtils.clamp(mean,Math.max(-n.widthRight+margins[i].right,initial-1.6),Math.min(n.widthLeft-margins[i].left,initial+1.6));
       return T.MathUtils.lerp(points[i].clone().sub(center).dot(normal),corrected,.8*weight);
     });
     sections.forEach(({center,normal,weight},i)=>{if(weight)points[i].copy(center).addScaledVector(normal,offsets[i]);});
   }
   // Fair linked direction changes together inside the sampled road.
   const entry=spaData.nodes.findIndex(n=>n.s>=90);
   const exit=spaData.nodes.findIndex(n=>n.s>=6780);
   const bend=(a:T.Vector3,b:T.Vector3,c:T.Vector3)=>{
     const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z;
     return 2*(ux*vz-uz*vx)/Math.max(.001,Math.hypot(ux,uz)*Math.hypot(vx,vz)*Math.hypot(c.x-a.x,c.z-a.z));
   };
   // Match neighbouring signed curvature using metric distances. Coarse passes
   // place the entry and exit, fine passes smooth the change through each apex.
   const probe=new T.Vector3();
   for(const stride of [10,5,3,2,1]){
     for(let pass=0;pass<55;pass++){
       for(let i=entry;i<exit;i++){
         if(stride===10 && fastSections[i]<.3)continue;
         const a=points[i-stride],b=points[i],c=points[i+stride];
         const target=(bend(points[i-2*stride],a,b)+bend(b,c,points[i+2*stride]))/2;
         const {center,normal}=sections[i],n=spaData.nodes[i];
         const current=bend(a,b,c);
         const derivative=(bend(a,probe.copy(b).addScaledVector(normal,.04),c)-current)/.04;
         if(Math.abs(derivative)<.0001)continue;
         const offset=probe.copy(b).sub(center).dot(normal);
         const correction=T.MathUtils.clamp((target-current)/derivative,-.4,.4);
         const adjust=n.s<4830?(.55+3.2*fastSections[i])*T.MathUtils.smoothstep(Math.abs(n.s-2505),85,200):n.s>6460?8:2;
         const initial=sections[i].initial;
         b.copy(center).addScaledVector(normal,T.MathUtils.clamp(offset+.55*correction,Math.max(-n.widthRight+margins[i].right,initial-adjust),Math.min(n.widthLeft-margins[i].left,initial+adjust)));
       }
     }
   }
   // At sustained high pace optimise the whole entry-to-exit arc. A tight local
   // fit to noisy registered positions can otherwise create a false braking point.
   points.forEach((point,i)=>{
     const pace=fastSections[i],kerb=margins[i].use*weights[region(spaData.nodes[i].s)];
     const s=spaData.nodes[i].s;
     // Keep Bruxelles and the next left on one continuous arc through the change of direction.
     const linked=T.MathUtils.smoothstep(s,2670,2770)*(1-T.MathUtils.smoothstep(s,3190,3300));
     const w=T.MathUtils.lerp((.56+.42*pace)*(1-kerb*(1-pace)),.96,linked);
     if(w>0)point.lerp(this.track.point(spaData.nodes[i].s,fastLine[i]),w);
   });
   this.racePath=new T.CatmullRomCurve3(points,true);
   if(this.pathCache.size>=12)this.pathCache.delete(this.pathCache.keys().next().value!);
   this.pathCache.set(key,this.racePath);
 }
 // Browser builds this in a dedicated worker. Node regression uses the same planner.
 planWorker?:Worker;
 private pendingPlan?:{plan:LapPlan,path:T.CatmullRomCurve3,geometry:T.BufferGeometry};
 private preparePlan(plan:LapPlan){
   const path=new T.CatmullRomCurve3(plan.points.map(p=>new T.Vector3().fromArray(p)),true);
   const geometry=new T.BufferGeometry();
   geometry.setAttribute('position',new T.BufferAttribute(plan.vertices,3));
   geometry.setIndex(new T.BufferAttribute(plan.indices,1));
   geometry.computeBoundingSphere();
   this.pendingPlan={plan,path,geometry};
 }
 private requestedLap=0;
 private generation=0;
 private stageNextLap(){
   const lap=this.lap+1;
   if(this.requestedLap===lap || this.lastLap)return;
   this.requestedLap=lap;
   const observations=this.observations.map((m,j)=>{
     const copy=new Map(m);
     if(this.timed && this.comparable && j<region(this.s) && !this.incidents[j]){
       const w=this.weights[j];
       copy.set(w,Math.min(copy.get(w)??Infinity,this.regionTimes[j]));
     }
     return [...copy];
   });
   const request:PlanRequest={lap,count:this.count,weights:[...this.weights],slides:this.memory.slides,observations};
   if(this.planWorker){
     const generation=this.generation;
     this.planWorker.onmessage=({data})=>{
       if(data.generation===generation && this.generation===generation && data.plan.lap===this.lap+1)this.preparePlan(data.plan);
     };
     this.planWorker.postMessage({generation,request});
   }else{
     const planner=new Cruise(this.track,new RacingLine(this.track));
     this.preparePlan(planner.planLap(request));
     planner.line.mesh.geometry.dispose();
   }
 }
 planLap(request:PlanRequest){
   this.count=request.count;this.lap=request.lap;this.weights=request.weights;this.memory.slides=request.slides.map(mark=>({...mark}));
   this.observations=request.observations.map(entries=>new Map(entries));
   this.nextPath();
   const g=this.line.mesh.geometry;
   return {lap:this.lap,weights:this.weights,points:this.racePath.points.map(p=>p.toArray()),
     speed:this.speedPlan,vertical:this.verticalCurve,lateral:this.lateralCurve,braking:this.brakingLimit,lengths:this.pathLengths,
     vertices:g.getAttribute('position').array as Float32Array,indices:g.index!.array as Uint16Array|Uint32Array};
 }
 private adoptNextLap(){
   const pending=this.pendingPlan;this.pendingPlan=undefined;
   if(!pending || pending.plan.lap!==this.lap){this.applySlideLimits();return;}
   const {plan,path,geometry}=pending;
   this.weights=plan.weights;this.racePath=path;
   this.speedPlan=plan.speed;this.brakingLimit=plan.braking;this.pathLengths=plan.lengths;
   this.verticalCurve=plan.vertical;this.lateralCurve=plan.lateral;
   this.line.mesh.geometry.dispose();this.line.mesh.geometry=geometry;
   this.applySlideLimits();
 }
 nextPath(){
   const best=this.weights.map((weight,j)=>{
     let time=Infinity;
     for(const [tested,actual] of this.observations[j]){
       if(actual<time){time=actual;weight=tested;}
     }
     return weight;
   });
   const busStop=([early,exit]:number[])=>best.map((w,i)=>i===17?early:i===18?exit:w);
   const choices=[best,busStop([1,0]),busStop([0,1]),best.map(()=>1),...[-.2,.2].map(step=>best.map(w=>Math.round(10*T.MathUtils.clamp(w+step,0,1))/10))];
   const scores=choices.map(weights=>{
     this.setPath(weights);this.buildSpeedPlan();
     const times=blank();
     for(let i=0;i<this.speedPlan.length-1;i++){
       const distance=i*this.planStep;
       const j=region(spaData.grid.s+distance);
       times[j]+=2*this.pathLengths[i]/Math.max(1,this.speedPlan[i]+this.speedPlan[i+1]);
     }
     return times;
   });
   this.weights=best.map((base,j)=>{
     let predicted=scores[0][j],selected=base;
     for(let k=1;k<choices.length;k++){
       const candidate=choices[k][j];
       if(!this.observations[j].has(candidate) && scores[k][j]<predicted-.002){
         selected=candidate;predicted=scores[k][j];
       }
     }
     return selected;
   });
   this.setPath(this.weights);this.buildSpeedPlan();
   // Re-evaluate the joined line: a quicker apex can spoil the following exit.
   let joinedTime=0;
   for(let i=0;i<this.pathLengths.length;i++)
     joinedTime+=2*this.pathLengths[i]/Math.max(1,this.speedPlan[i]+this.speedPlan[i+1]);
   const totals=scores.map(regions=>regions.reduce((sum,time)=>sum+time,0));
   const quickest=totals.indexOf(Math.min(...totals));
   if(totals[quickest]+.002<joinedTime){
     this.weights=choices[quickest];this.setPath(this.weights);this.buildSpeedPlan();
   }
   this.showPlan();
 }
 showPlan(){this.line.update(station=>this.point(this.track.wrap(station-spaData.grid.s)));}
 aeroZone=0;wingTravel=0;private previousZone=-1;
 verticalCurve:number[]=[];
 racePath:T.CatmullRomCurve3;
 accelerationCommand=0;
 dynamics=new LateralDynamics();
 status:CruiseStatus='idle';distance=0;travelled=0;speed=0;elapsed=0;limitKmh=Infinity;accumulator=0;
 private brakingLimit:number[]=[];
 private lateralCurve:number[]=[];
 pathLengths:number[]=[];speedPlan:number[]=[];planStep=5;
 constructor(public track:SpaTrack,public line:RacingLine){
   this.restoreDriver();
   this.racePath=new T.CatmullRomCurve3(spaData.nodes.map((n,i)=>track.point(n.s,racePath.offsets[i])),true);
   this.setPath(this.weights);this.buildSpeedPlan();this.showPlan();
 }
 buildSpeedPlan(){const n=Math.ceil(this.track.length/5);this.planStep=this.track.length/n;
 const speeds=this.speedPlan,curvatures:number[]=[];
 const mass=lateralParameters.mass;
 // Estimated lateral acceleration envelope (m/s²), shared by every corner.
 const grip=(v:number,opening:number,vertical:number)=>{
   const staticLoad=mass*9.81/4,aero=aeroForces(v,opening);
   const margin=.835+.06*T.MathUtils.smoothstep(v,45,82);
   // The valley adds normal load; crests take it away. Use the same tyre load law as the suspension.
   const roadLoad=mass*T.MathUtils.clamp(v*v*vertical,-7,10)/4;
   const normal=staticLoad+aero.downforce/4+roadLoad;
   return Math.min(52,16+.0047*v*v+roadLoad*4/mass,4*tyreCapacity(normal,staticLoad,lateralParameters.grip)*margin/mass);
 };
 const openings:number[]=[];
 for(let i=0;i<n;i++){
   const d=i*this.planStep;
   const a=this.point(d-20),b=this.point(d),c=this.point(d+20);
   const ab=b.clone().sub(a),bc=c.clone().sub(b);
   this.verticalCurve[i]=(bc.y/Math.max(.1,bc.length())-ab.y/Math.max(.1,ab.length()))/Math.max(1,(ab.length()+bc.length())/2);
   this.pathLengths[i]=this.point(d).distanceTo(this.point(d+this.planStep));
   // Estimate the path curvature over a car-length scale in hairpins and
   // a longer steering horizon in fast bends to suppress map-sampling kinks.
   const local=Math.abs(this.curvature(d));
   const span=T.MathUtils.clamp(1/Math.sqrt(Math.max(.001,local)),5,18);
   const k=Math.abs(this.curvature(d,span));
   curvatures[i]=k;this.lateralCurve[i]=k;
   openings[i]=straightModeZone(this.track.wrap(spaData.grid.s+d),this.track.length)?1:0;
   let lo=0,hi=topSpeed;
   for(let j=0;j<12;j++){
     const v=(hi+lo)/2;
     const capacity=grip(v,openings[i],this.verticalCurve[i]);
     if(k*v*v<=capacity)lo=v;else hi=v;
   }
   const station=this.track.wrap(spaData.grid.s+d);
   // A measured straight-line speed envelope suppresses unrealistic overspeed
   // before Bus Stop; the backward braking pass still chooses the braking point.
   if(station>=5000 && station<=6800){
     lo=Math.min(lo,referenceSpeed(station)*1.025+1);
   }
   speeds[i]=lo;
 }
 // Two sweeps carry acceleration and braking constraints across the timing line.
 for(let pass=0;pass<2;pass++){
   speeds[n]=this.lastLap?0:this.lap===1?topSpeed:speeds[0];
   for(let i=n-1;i>=0;i--){
     const v=speeds[i+1],capacity=grip(v,openings[i],this.verticalCurve[i]);
     const available=Math.sqrt(Math.max(0,capacity**2-(curvatures[i]*v*v)**2));
     const brakingStation=this.track.wrap(spaData.grid.s+i*this.planStep);
     const straightApproach=T.MathUtils.smoothstep(brakingStation,6350,6410)*(1-T.MathUtils.smoothstep(brakingStation,6500,6580));
     const brake=Math.min(12+.0018*v*v+straightApproach*6,(.78+.12*straightApproach)*available+drag*v*v/mass);
     speeds[i]=Math.min(speeds[i],Math.sqrt(v*v+2*brake*this.pathLengths[i]));
   }
   if(pass===0)this.brakingLimit=speeds.slice();
   if(this.lap===1)speeds[0]=0;
   for(let i=0;i<n;i++){
     const v=speeds[i],capacity=grip(v,openings[i],this.verticalCurve[i]);
     const traction=.55*Math.sqrt(Math.max(0,capacity**2-(curvatures[i]*v*v)**2));
     speeds[i+1]=Math.min(speeds[i+1],Math.sqrt(v*v+2*Math.min(traction,driveAcceleration(v))*this.pathLengths[i]));
   }
   if(!this.lastLap && this.lap!==1)speeds[0]=Math.min(speeds[0],speeds[n]);
 }
 this.applySlideLimits();
 }
 // Reapply at the line as the worker may have started before a late-lap incident.
 // Limit both targets and the driver's full-throttle override before the recorded station.
 private applySlideLimits(){
   const n=this.pathLengths.length;
   for(const mark of this.memory.slides){
     const centre=Math.round(this.track.wrap(mark.station-spaData.grid.s)/this.planStep);
     const approach=Math.ceil(240/this.planStep),exit=Math.ceil(140/this.planStep);
     for(let offset=-approach;offset<=exit;offset++){
       const i=(centre+offset+n)%n;
       const d=this.track.wrap(spaData.grid.s+i*this.planStep-mark.station+this.track.length/2)-this.track.length/2;
       const dv2=d<0?2*9*Math.max(0,-d-16):2*11*Math.max(0,d-10);
       const limit=Math.sqrt(mark.safeSpeed**2+dv2);
       this.speedPlan[i]=Math.min(this.speedPlan[i],limit);
       this.brakingLimit[i]=Math.min(this.brakingLimit[i],limit);
     }
   }
   if(this.timed)this.speedPlan[n]=this.speedPlan[0];
 }
 plannedSpeed(){const t=this.distance/this.planStep,i=Math.min(this.speedPlan.length-2,Math.floor(t));return T.MathUtils.lerp(this.speedPlan[i],this.speedPlan[i+1],t-i);}

 get s(){return spaData.grid.s+this.distance;}
 point(distance=this.distance){const d=this.lap===1 && distance<0?0:this.lastLap && distance>this.track.length?this.track.length:distance,s=spaData.grid.s+d,p=this.racePath.getPoint(this.track.wrap(s)/this.track.length),q=(x:number)=>{x=T.MathUtils.clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};const blend=(this.lap===1?1-q(d/120):0)+(this.lastLap?q((d-(this.track.length-120))/120):0);return blend?p.lerp(this.track.point(s,spaData.grid.lateral),blend):p;}
 pose(){const position=this.point(),forward=this.point(this.distance+2).sub(this.point(this.distance-2)).normalize(),left=new T.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(left).normalize();position.addScaledVector(left,this.dynamics.offset);const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(left,up,forward));quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),this.dynamics.headingError));return {position,quaternion};}
 curvature(distance=this.distance,span=4){const a=this.point(distance-span),b=this.point(distance),c=this.point(distance+span),u=b.clone().sub(a),v=c.clone().sub(b);return Math.atan2(v.x*u.z-v.z*u.x,u.x*v.x+u.z*v.z)/Math.max(.1,(Math.hypot(u.x,u.z)+Math.hypot(v.x,v.z))/2);}
 sampleContacts(h:number,{position,quaternion}=this.pose()){
   const suspension=this.dynamics.suspension;
   for(const key of corners){
     const local=this.contactCenters[key];
     if(!local)continue;
     const hub=local.clone().applyQuaternion(quaternion).add(position);
     const axle=new T.Vector3(1,0,0);
     if(key[0]==='F')axle.applyAxisAngle(new T.Vector3(0,1,0),this.dynamics.wheelAngle(local.x));
     axle.applyQuaternion(quaternion).multiplyScalar(key[0]==='F'?.11:.14);
     const tyre=this.dynamics.tyres[key];
     const rise=this.track.curbRise(this.track.wrap(this.s+local.z),hub,axle);
     suspension.surfaceGrip[key]=1-.14*Math.min(1,rise/.035);
     const height=rise-tyre.wear[tyre.patch];
     // Smooth the road input over the rolling contact patch.
     const change=(height-suspension.ground[key])*(1-Math.exp(-h/.018));
     suspension.ground[key]+=change;
     suspension.groundRate[key]=change/h;
   }
 }
 toggle(){if(this.status==='running'){this.status='paused';return;}if(this.status==='complete')this.reset();if(this.status==='idle'){this.buildSpeedPlan();this.showPlan();}this.status='running';}
 reset(){this.generation++;this.pendingPlan=undefined;this.requestedLap=0;this.brakeForce=0;this.braking=false;this.aeroZone=0;this.previousZone=-1;this.wingTravel=0;this.gearbox=new Gearbox();this.finishHold=0;this.regionHistory=[];this.exits=blank();this.observations.forEach(m=>m.clear());this.restoreDriver();this.traces=turnStations.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));this.slideBins.clear();this.incidents=blank();this.regionTimes=blank();this.comparable=true;this.lap=1;this.history=[];this.setPath(this.weights);this.showPlan();this.splits=[];this.accelerationCommand=0;this.dynamics.reset();this.status='idle';this.distance=0;this.travelled=0;this.speed=0;this.elapsed=0;this.accumulator=0;}
 tick(dt:number){if(this.status==='complete'){for(let t=0;t<dt;t+=1/240)this.dynamics.suspension.step(Math.min(1/240,dt-t),0,0,0,0);return 0;}if(this.status!=='running')return 0;this.accumulator+=dt;let travelled=0;
 if(this.distance>this.track.length*.82)this.stageNextLap();
 while(this.accumulator>=1/240){this.accumulator-=1/240;const h=1/240,remaining=this.track.length-this.distance;let target=Math.min(this.limitKmh/3.6,this.plannedSpeed());
 if(this.lastLap)target=Math.min(target,Math.sqrt(2*7*Math.max(0,remaining-.08)));const index=Math.min(this.speedPlan.length-2,Math.floor(this.distance/this.planStep));
 const v0=this.speedPlan[index],v1=this.speedPlan[index+1];
 const feedforward=target>=this.limitKmh/3.6 || this.lastLap && remaining<300?0:(v1*v1-v0*v0)/(2*Math.max(.1,this.pathLengths[index]));
 const availableForce=this.gearbox.update(h,(this.dynamics.tyres.RL.omega*this.dynamics.tyres.RL.radius+this.dynamics.tyres.RR.omega*this.dynamics.tyres.RR.radius)/2);
 const desiredAcceleration=T.MathUtils.clamp((target-this.speed)*4+feedforward,-40,14);this.accelerationCommand+=T.MathUtils.clamp(desiredAcceleration-this.accelerationCommand,-100*h,100*h);const tangent=this.point(this.distance+2).sub(this.point(this.distance-2)),slope=Math.atan2(tangent.y,Math.hypot(tangent.x,tangent.z));const pose=this.pose();this.sampleContacts(h,pose);const zone=straightModeZone(this.track.wrap(this.s),this.track.length);
 if(this.previousZone>=0 && zone && zone!==this.previousZone)this.aeroZone=zone;
 if(!zone || this.accelerationCommand<-.5)this.aeroZone=0;
 this.previousZone=zone;
 this.wingTravel=T.MathUtils.clamp(this.wingTravel+(this.aeroZone?1:-1)*h/.30,0,1);
 const opening=T.MathUtils.smoothstep(this.wingTravel,0,1);
 const vertical=this.speed**2*T.MathUtils.lerp(this.verticalCurve[index],this.verticalCurve[(index+1)%this.verticalCurve.length],this.distance/this.planStep-index);
 const resistance=aeroForces(this.speed,opening).drag+lateralParameters.mass*9.81*Math.sin(slope);
 const corner=region(this.s);
 const learned=this.memory.corners[corner];
 const frontLock=Math.max(-this.dynamics.tyres.FL.slip,-this.dynamics.tyres.FR.slip);
 const slip=Math.abs(Math.atan2(this.dynamics.vy-lateralParameters.rearArm*this.dynamics.yawRate,Math.max(3,this.speed)));
 const k=this.curvature();
 const yawExcess=Math.abs(this.dynamics.yawRate)-this.speed*Math.abs(k);
 const oversteer=slip>.095 && (yawExcess>.12 || this.dynamics.steer*this.dynamics.yawRate<-.003 || slip>.15);
 if(oversteer && this.speed>12 && !this.lastLap && !Number.isFinite(this.limitKmh)){
   this.incidents[corner]=1;
   const station=this.track.wrap(this.s),bin=Math.floor(station/50);
   if(!this.slideBins.has(bin)){
     this.slideBins.add(bin);
     this.memory.recordSlide(station,this.speed);
   }
 }
 const apex=turnStations[corner],pickup=this.pickup[corner]*(1-learned.caution);
 const nearExit=this.s>=apex-12*pickup && this.s<apex+95;
 let request=this.accelerationCommand*lateralParameters.mass+resistance;
 if(this.timed && !Number.isFinite(this.limitKmh)){
   // On a straight the acceleration forecast is not a speed governor.
   // Preserve room for the next braking point and for lateral tyre force.
   const next=Math.min(index+1,this.brakingLimit.length-1);
   const limit=Math.min(this.brakingLimit[index],this.brakingLimit[next]);
   const lateral=this.lateralCurve[index]*this.speed**2;
   if(lateral<3 && this.speed+1<limit && slip<.035)request=availableForce;
   if(nearExit && this.accelerationCommand>=-.6*pickup){
     request+=pickup*.12*this.dynamics.rearDriveReserve;
   }
   if(request>0)request*=1-T.MathUtils.smoothstep(slip,.065,.14);
   if(request<0 && frontLock>.22)request*=1-.55*T.MathUtils.smoothstep(frontLock,.22,.9);
   if((slip>.085 || frontLock>.6) && this.speed>10)this.incidents[corner]=1;
 }
 // Trail the brake into turn-in. As lateral demand grows, release pressure
 // within the available tyre-force ellipse. Abort the trail on lock or power pickup.
 if(request<0 || (this.brakeForce>0 && nearExit===false && this.s<apex && Math.abs(this.dynamics.steer)>.012 && request<resistance)){
   const susp=this.dynamics.suspension;
   const cap=corners.reduce((sum,key)=>sum+susp.capacity(key,lateralParameters.grip),0);
   const lateralForce=lateralParameters.mass*Math.abs(this.dynamics.ay);
   const reserve=Math.sqrt(Math.max(0,cap*cap-lateralForce*lateralForce));
   const wanted=Math.max(0,-request)*(oversteer?1-.65*T.MathUtils.smoothstep(slip,.08,.20):1);
   const releaseRate=cap*(frontLock>.15 || oversteer?14:3.8);
   this.brakeForce=Math.min(reserve,Math.max(wanted,this.brakeForce-releaseRate*h));
   request=-this.brakeForce;
 }else this.brakeForce=0;
 this.gearbox.throttle=Math.min(1,Math.max(0,request/Math.max(1,availableForce)));
 this.gearbox.brake=Math.min(1,Math.max(0,-request/(40*lateralParameters.mass)));
 this.speed=this.dynamics.longitudinalStep(h,this.speed,Math.min(request,availableForce),slope,vertical,opening);
 this.gearbox.account(h,this.speed,this.dynamics.longitudinalForce);
 this.finishHold=Math.max(0,this.finishHold-h);
 const before=pose.position;
 const a=Math.max(0,this.distance-.5),b=Math.min(this.track.length,this.distance+.5),metric=this.point(b).distanceTo(this.point(a))/Math.max(.01,b-a);
 const look=T.MathUtils.clamp(4+this.speed*.31,5,Math.max(7,24/(1+14*Math.abs(k))));
 const {position,quaternion}=pose;
 const goal=this.point(this.distance+look);
 const inverse=quaternion.invert();
 const demand=(point:T.Vector3)=>{
   const aim=point.sub(position).applyQuaternion(inverse);
   return 2*aim.x/Math.max(1,aim.x*aim.x+aim.z*aim.z);
 };
 // The distant point initiates turn-in; the near point preserves the apex in linked turns.
 const further=this.point(this.distance+look+Math.min(16,this.speed*.23));
 const pursuit=.68*demand(goal)+.32*demand(further);
 const ds=h*this.dynamics.step(h,this.speed,k,pursuit);
 const previousStation=this.s;
 const trace=this.traces[corner];
 if(!trace.entry)trace.entry=this.speed;
 trace.minimum=Math.min(trace.minimum,this.speed);
 if(!trace.turnIn && Math.abs(this.dynamics.steer)>.025)trace.turnIn=this.s;
 if(this.braking && this.gearbox.brake<.02)trace.brakeRelease=this.s;
 this.braking=this.gearbox.brake>.02;
 if(nearExit && !trace.pickup && this.gearbox.throttle>.04)trace.pickup=this.s;
 if(nearExit && this.gearbox.throttle>.99 && !trace.full)trace.full=this.s;
 this.distance+=Math.min(remaining,ds/Math.max(.3,metric));
 const j=region(previousStation),end=ends[j];
 const fraction=this.s>end?(end-previousStation)/(this.s-previousStation):1;
 this.regionTimes[j]+=h*fraction;this.exits[j]=this.speed*3.6;
 if(fraction<1)this.regionTimes[j+1]+=h*(1-fraction);
 if(Number.isFinite(this.limitKmh))this.comparable=false;
 const split=splitStations[this.splits.length];
 if(this.timed && previousStation<split && this.s>=split){
   this.splits.push(this.elapsed+h*(split-previousStation)/(this.s-previousStation));
 }
 const step=before.distanceTo(this.pose().position);travelled+=step;this.travelled+=step;if(this.timed)this.elapsed+=h;
 if(this.distance>=this.track.length && !this.lastLap){
   if(this.timed){this.splits.push(this.elapsed);this.history.push([...this.splits]);this.finishHold=4;this.regionHistory.push(this.regionTimes.map((time,i)=>({time,exit:this.exits[i],trace:{...this.traces[i]}})));}
   if(this.timed && this.comparable){
     this.regionTimes.forEach((time,i)=>{
       const r=this.memory.corners[i];
       if(this.incidents[i])r.caution=Math.min(1,r.caution+.25);
       else{
         r.caution*=.96;
         const old=this.observations[i].get(this.weights[i])??Infinity;
         this.observations[i].set(this.weights[i],Math.min(time,old));
         const similar=!r.trace || Math.abs(this.traces[i].entry-r.trace.entry)<3;
         if(!r.time || (similar && time<r.time))Object.assign(r,{time,line:this.weights[i],pickup:this.pickup[i],trace:{...this.traces[i]}});
       }
     });
     for(const mark of this.memory.slides){
       if(this.incidents[region(mark.station)]){mark.cleanPasses=0;continue;}
       mark.cleanPasses=(mark.cleanPasses??0)+1;
       if(mark.cleanPasses>=3)mark.safeSpeed=Math.min(mark.speed,mark.safeSpeed+.25);
     }
     this.memory.laps.push({date:Date.now(),sectors:this.splits.map((t,i)=>t-(this.splits[i-1]??0))});
     this.memory.laps=this.memory.laps.slice(-60);
     this.memory.save();
   }
   this.traces=turnStations.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));
   this.slideBins.clear();this.incidents=blank();
   this.pickup=this.memory.corners.map(r=>T.MathUtils.clamp(r.pickup+.12-r.caution,0,1));
   this.regionTimes=blank();this.comparable=true;
   this.lap++;this.distance=0;this.elapsed=0;this.splits=[];this.adoptNextLap();continue;
 }
 if(this.lastLap && remaining<.12){this.distance=this.track.length;this.speed=0;this.dynamics.vy=0;this.dynamics.yawRate=0;this.dynamics.ay=0;this.dynamics.acceleration=0;this.status='complete';this.accumulator=0;break;}}
 return travelled;}
 snapshot():CruiseSnapshot{
 const best=[Infinity,Infinity,Infinity];
 const timingRows:LapTiming[]=(this.timed?[...this.history,this.splits]:this.history).map((ends,index)=>({
   lap:index+1,total:ends[2],regions:this.regionHistory[index],sectors:ends.map((end,i)=>{
     const ms=Math.round(1000*(end-(ends[i-1]??0)));
     // One entrant: the session and personal benchmarks coincide.
     const color=sectorColor(ms,best[i],best[i]);
     best[i]=Math.min(best[i],ms);
     return {ms,color};
   })
 }));
 const suspension=this.dynamics.suspension;
 const front=suspension.frontDownforce;
 const tyres=Object.fromEntries(corners.map(k=>{const t=this.dynamics.tyres[k];return [k,{pressure:t.pressure,contact:t.contactPressure,wear:1000*Math.max(...t.wear),locked:t.locked}];}));
 return {power:{electric:this.gearbox.electricKw,wheels:this.gearbox.driveKw,energy:this.gearbox.energy/5e6},aero:{front,rear:suspension.downforce-front,drag:suspension.drag},tyres,station:this.track.wrap(this.s),finishHold:this.finishHold>0,gear:this.gearbox.index+1,rpm:this.gearbox.rpm,throttle:this.gearbox.throttle,brake:this.gearbox.brake,phase:this.lastLap?'in':this.timed?'timed':'out',lap:Math.min(this.count,Math.max(0,this.lap-1)),lastLap:this.history.at(-1)?.[2],bestLap:Math.min(...this.history.map(row=>row[2])),timingRows,splits:[...this.splits],aeroZone:this.aeroZone,status:this.status,speed:this.speed*3.6,progress:this.distance/this.track.length,elapsed:this.elapsed,distance:this.travelled,roll:this.dynamics.suspension.roll*180/Math.PI,pitch:this.dynamics.suspension.pitch*180/Math.PI,heave:this.dynamics.suspension.heave*1000,loads:{...this.dynamics.suspension.loads},steer:this.dynamics.steer*180/Math.PI,lateralG:this.dynamics.ay/9.81,slip:Math.atan2(this.dynamics.vy,Math.max(this.speed,.1))*180/Math.PI};}
}
