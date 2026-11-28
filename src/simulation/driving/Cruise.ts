import {tyreCompounds,type TyreCompound} from '../vehicle/TyreCompound';
import {nextStrategy,rememberGroup,type GroupMemory} from './LapLearning';
import {nominalGap,platformForces} from '../vehicle/AeroPlatform';
import {advanceWing,wingOpening} from '../vehicle/ActiveAero';
import {DriverMemory,type SlideMark} from './DriverMemory';
import {Gearbox,plannedForce} from '../vehicle/Gearbox';
import * as T from 'three';
import {CircuitTrack} from '../../tracks/CircuitTrack';
import {aeroForces,tyreCapacity,corners,suspensionParameters,type Corner} from '../vehicle/Suspension';
import {LateralDynamics,lateralParameters} from '../vehicle/LateralDynamics';
import {RacingLine} from './RacingLine';
export type PlanRequest={circuitId:string,anchors?:GroupMemory[],lap:number,count:number,weights:number[],slides:SlideMark[],energyEnabled:boolean,wearEnabled:boolean,compound:TyreCompound,wear:number[],energy:number,entrySpeeds:number[],pickup:number[],caution:number[],observations:[number,number][][]};
export type LapPlan=ReturnType<Cruise['planLap']>;
export type CruiseStatus='idle'|'running'|'paused'|'complete';
type DriverTrace={entry:number,minimum:number,brakeRelease:number,turnIn:number,pickup:number,full:number};
type RegionResult={time:number,exit:number,trace:DriverTrace,incident:boolean};
export type WheelTelemetry={energy:number,electricKw:number,aeroZone:number,delta?:number,tyres:Record<Corner,{temperature:number,pressure:number,wear:number}>};
export type ReviewFrame={telemetry?:WheelTelemetry,s:number,t:number,position:T.Vector3,rotation:T.Quaternion,rack:number,curve:number,yaw:number,rear:number,speed:number,throttle:number,brake:number,rpm:number,gear:number,roll:number,pitch:number,heave:number,hubs:Record<Corner,number>};
export type CornerReport={i:number,delta?:number,exitDelta?:number,pickupDelta?:number,previousSlide:boolean,limited:boolean};
export type LapTiming={lap:number,total?:number,regions?:RegionResult[],sectors:{ms:number,color:'purple'|'green'|'yellow'}[]};
function sectorColor(ms:number,personal:number,session:number){
 if(ms<session)return 'purple' as const;
 if(ms<personal)return 'green' as const;
 return 'yellow' as const;
}
export type CruiseSnapshot={invalidLap?:boolean,recovering?:boolean,attempt?:number,validLaps?:number,flowRatio?:number,liveDelta?:number,report?:CornerReport,power?:{electric:number,wheels:number,energy:number},platform?:{wing:number,frontGap:number,rearGap:number},aero?:{front:number,rear:number,drag:number},tyres?:Record<string,{pressure:number,contact:number,wear:number,degradation:number,locked:boolean}>,station?:number,gear?:number,rpm?:number,throttle?:number,brake?:number,finishHold?:boolean,phase?:"out"|"timed"|"in",status:CruiseStatus,speed:number,progress:number,elapsed:number,distance:number,steer?:number,lateralG?:number,slip?:number,roll?:number,pitch?:number,heave?:number,lap?:number,lastLap?:number,bestLap?:number,timingRows?:LapTiming[],splits?:number[],aeroZone?:number,loads?:Record<string,number>};
// Split linked corners halfway between their mapped apexes. Each window includes entry and exit.
// Blend neighbouring strategies across the inter-corner boundary, including the
// final fast-line mix. A discrete weight here creates an artificial chicane.
function lineWeightAt(station:number,weights:number[],turns:number[],ends:number[]){
 const j=ends.findIndex(end=>station<end),start=ends[j-1]??0,end=ends[j];
 const before=j>0?Math.min(70,(turns[j]-start)*.65):0;
 const after=j<weights.length-1?Math.min(70,(end-turns[j])*.65):0;
 if(before && station<start+before){
   const span=Math.min(before,(start-turns[j-1])*.65);
   return T.MathUtils.lerp(weights[j-1],weights[j],T.MathUtils.smootherstep(station,start-span,start+span));
 }
 if(after && station>end-after){
   const span=Math.min(after,(turns[j+1]-end)*.65);
   return T.MathUtils.lerp(weights[j],weights[j+1],T.MathUtils.smootherstep(station,end-span,end+span));
 }
 return weights[j];
}
type TrialResult={pickup:number,apexGain:number,entry:number,apex:number,exitOffset:number,cut:number,late:number,time:number,exit:number,brake:number,kerb:boolean,valid:boolean};
const wheelPower=660000; // Representative peak wheel power, W (estimate).
const topSpeed=Math.cbrt(wheelPower/aeroForces(1,1).drag);
function driveAcceleration(v:number,opening:number,deployment=true){
 return Math.min(14,(plannedForce(v,deployment)-aeroForces(v,opening).drag)/lateralParameters.mass);
}
/** Route-constrained automatic tour. Speed/steering/suspension respond continuously; not free driving. */
export class Cruise {
 private get turns(){return this.track?.profile.turns??[];}
 private get splitsAt(){return this.track.profile.splits;}
 private get groups(){return this.track?.profile.groups??[];}
 get reviewSections(){return this.track?.layout.driving.reviewSections??[];}
 private ends:number[]=[];
 private region(s:number){const station=this.track?this.track.wrap(s):s;return this.ends.findIndex(end=>station<end);}
 private blank(){return this.turns.map(()=>0);}
 private referenceSpeed(s:number){
   const samples=this.track.layout.reference?.speed;
   if(!samples?.length)return Math.min(topSpeed,Math.sqrt(25/Math.max(.002,Math.abs(this.track.curvature(s,18)))));
   let lo=0,hi=samples.length;while(lo<hi){const mid=(lo+hi)>>>1;if(samples[mid].s<s)lo=mid+1;else hi=mid;}
   const b=samples[lo%samples.length],a=samples[(lo+samples.length-1)%samples.length];
   return T.MathUtils.lerp(a.speed,b.speed,this.track.wrap(s-a.s)/Math.max(.01,this.track.wrap(b.s-a.s)));
 }
 dispose(){this.planWorker?.terminate();this.pendingPlan=undefined;this.pathCache.clear();}
 private setGeometryPath(weights:number[],key:string){
   const n=Math.ceil(this.track.length/5),ds=this.track.length/n;
   const points=Array.from({length:n},(_,i)=>{
     const s=i*ds,j=this.region(s),apex=this.turns[j]+8*this.apex[j],side=Math.sign(this.track.curvature(apex,18));
     const width=this.track.width(s,side),k=Math.abs(this.track.curvature(apex,18));
     const reach=Math.min(110,Math.max(35,1/Math.sqrt(Math.max(.0001,k))*5));
     const d=s-apex,inside=Math.exp(-((d/(reach*.48))**2)),outside=Math.exp(-(((Math.abs(d)-reach)/(reach*.65))**2));
     const amplitude=Math.min(width-1.55,1.2+weights[j]*1.4);
     const shift=.25*(this.entry[j]*Math.exp(-(((d+reach)/50)**2))+this.exitOffset[j]*Math.exp(-(((d-reach)/50)**2)));
     const offset=side*amplitude*(inside-.6*outside)+shift;
     return this.track.point(s,T.MathUtils.clamp(offset,-this.track.width(s,-1)+1.35,this.track.width(s,1)-1.35));
   });
   // Smooth in road cross-sections; longitudinal stations and height remain registered.
   const scratch=new T.Vector3();
   for(let pass=0;pass<12;pass++){
     const offsets=points.map((p,i)=>{const s=i*ds,center=this.track.point(s),normal=this.track.point(s,1).sub(center);return T.MathUtils.clamp(scratch.copy(points[(i+n-1)%n]).lerp(points[(i+1)%n],.5).sub(center).dot(normal),-this.track.width(s,-1)+1.35,this.track.width(s,1)-1.35);});
     points.forEach((p,i)=>p.lerp(this.track.point(i*ds,offsets[i]),.45));
   }
   this.racePath=new T.CatmullRomCurve3(points,true);
   if(this.pathCache.size>=12)this.pathCache.delete(this.pathCache.keys().next().value!);
   this.pathCache.set(key,this.racePath);
 }

 contactCenters:Partial<Record<Corner,T.Vector3>>={};
 private contactProbe=new T.Vector3();
 private contactHub=new T.Vector3();
 private contactAxle=new T.Vector3();
 private contactPoint=new T.Vector3();
 private contactDefault=new T.Vector3();
 private contactUp=new T.Vector3(0,1,0);
 gearbox=new Gearbox(); finishHold=0; exits=this.blank();
 regionHistory:RegionResult[][]=[];
 splits:number[]=[];
 lap=1; attempt=0;invalidLap=false;
 private recoveryHold=0;
 private rejoin?:{start:number,end:number};
 private recoveredToMain=false;
 private spinTime=0;
 get flying(){return this.timed && !this.invalidLap && this.recoveryHold<=0;}
 get recovering(){return this.recoveryHold>0;}
 private count=1; history:number[][]=[]; private weights=this.blank(); private regionTimes=this.blank();
 private entry=this.blank();private apex=this.blank();private exitOffset=this.blank();
 private cut=this.blank();
 private apexGain=this.blank();
 private late=this.blank();
 private energyOption=false;private wearOption=false;
 get energyEnabled(){return this.energyOption;}
 set energyEnabled(value:boolean){if(value===this.energyOption)return;this.energyOption=value;this.invalidatePlan();}
 get wearEnabled(){return this.wearOption;}
 set wearEnabled(value:boolean){if(value===this.wearOption)return;this.wearOption=value;this.invalidatePlan();}
 get tyreCompound():TyreCompound{return this.dynamics.tyres.FL.compound;}
 set tyreCompound(value:TyreCompound){if(value===this.tyreCompound)return;for(const k of corners)this.dynamics.tyres[k].compound=value;this.comparable=false;this.invalidatePlan();}
 replaceTyres(){for(const k of corners){this.dynamics.tyres[k].replace();this.dynamics.suspension.runout[k]=0;this.dynamics.suspension.runoutRate[k]=0;}this.comparable=false;this.invalidatePlan();}
 private invalidatePlan(){this.generation++;this.requestedLap=0;this.pendingPlan=undefined;if(this.racePath){this.buildSpeedPlan();this.showPlan();}}

 private entrySpeeds=this.groups.map(()=>0);
 private trial=false;
 comparisons:TrialResult[][]=[];
 private memory:DriverMemory;
 private incidents=this.blank();
 private incident?:{kind:string,time:number,station:number,speed:number,recorded:boolean};
 private observeIncident(kind:string|undefined,h:number){
   // A single physics sample (kerb unload or the natural yaw reversal between
   // linked bends) must not become a permanent braking point on later laps.
   if(!kind || this.trial || !this.flying || Number.isFinite(this.limitKmh) || this.pace<1){this.incident=undefined;return;}
   if(this.incident?.kind!==kind)this.incident={kind,time:0,station:this.track.wrap(this.s),speed:this.speed,recorded:false};
   const event=this.incident;event.time+=h;
   if(event.time<.18 || event.recorded)return;
   event.recorded=true;
   const corner=this.region(event.station),bin=Math.floor(event.station/50);
   this.memory.corners[corner].lastError=kind;this.incidents[corner]=1;
   if(kind==='oversteer')this.slidesThisLap.add(corner);
   if(!this.slideBins.has(bin)){this.slideBins.add(bin);this.memory.recordSlide(event.station,event.speed);}
 }
 private slidesThisLap=new Set<number>();
 report?:CornerReport;
 private bestStamps:number[]=[];
 private stamps:number[]=[0];
 get currentDelta(){return this.liveDelta();}
 private liveDelta(){
   if(!this.flying||!this.bestStamps.length)return;
   const t=this.distance/10,i=Math.floor(t),a=this.bestStamps[i],b=this.bestStamps[i+1];
   if(a!==undefined && b!==undefined)return this.elapsed-T.MathUtils.lerp(a,b,t-i);
 }
 private samples:ReviewFrame[][]=this.reviewSections.map(()=>[]);
 reviews:{lap:number,clips:ReviewFrame[][]}[]=[];
 private nextSample=0;
 private slideBins=new Set<number>();
 private traces=this.turns.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));
 private brakeForce=0;
 private braking=false;
 private pickup=this.blank();
 private restoreDriver(){
   this.weights=this.memory.corners.map(r=>r.line);
   this.pickup=this.memory.corners.map(r=>r.pickup);
   this.memory.corners.forEach((r,i)=>{if(r.time)this.observations[i].set(r.line,r.time);});
 }
 private observations=this.turns.map(()=>new Map<number,number>());
 private comparable=true;
 private displayedLoads={FL:0,FR:0,RL:0,RR:0};
 get lapCount(){return this.count;}
 set lapCount(n:number){if(this.status==='idle'||this.status==='complete')this.count=Math.max(1,Math.min(this.track.layout.raceLaps,Math.trunc(n)||1));}
 get timed(){return this.lap>1 && !this.lastLap;}
 get lastLap(){return this.lap===this.lapCount+2;}
 private pathCache=new Map<string,T.CatmullRomCurve3>();
 setPath(weights:number[]){
   const key=Number(this.timed)+':'+weights.join(',')+':'+this.cut.join(',')+':'+this.entry.join(',')+':'+this.apex.join(',')+':'+this.exitOffset.join(',');
   const cached=this.pathCache.get(key);
   if(cached){this.racePath=cached;return;}
   const reference=this.track.layout.reference;
   if(!reference){this.setGeometryPath(weights,key);return;}
   const fastSections=this.track.layout.nodes.map(n=>T.MathUtils.smoothstep(this.referenceSpeed(n.s),52,82));
   const margins=this.track.layout.nodes.map(n=>{
     const side=this.track.curbSide(n.s);
     const j=this.region(n.s),apex=this.turns[j];
     const apexCurvature=this.track.curvature(apex);
     const use=side===Math.sign(apexCurvature)?Math.exp(-(((n.s-apex)/35)**2)):0;
     // Allow for the axle sweeping inside the centre path on a tight hairpin.
     const cutAllowance=1.06-Math.min(.52,Math.abs(apexCurvature)*lateralParameters.frontArm**2);
     return {left:1.5-(side>0?use:0)*cutAllowance,right:1.5-(side<0?use:0)*cutAllowance,use,side};
   });
   const points=this.track.layout.nodes.map((n,i)=>{
     const seam=Math.min(n.s,this.track.length-n.s);
     const j=this.region(n.s),start=this.ends[j-1]??0,end=this.ends[j];
     const fade=Math.min(35,(this.turns[j]-start)/2,(end-this.turns[j])/2);
     const blend=weights[j]*T.MathUtils.smoothstep(Math.min(n.s-start,end-n.s),0,fade);
     const offset=T.MathUtils.lerp(reference.raceOffsets[i],reference.lineOffsets[i],blend*T.MathUtils.smoothstep(seam,30,120));
     const apexShift=(weights[j]-.5)*14;
     const apexFraction=Math.exp(-(((n.s-this.turns[j]-apexShift)/24)**2));
     const cut=blend*apexFraction;
     const inside=Math.sign(this.track.curvature(this.turns[j]));
     const reserve=1.5-.30*cut+reference.smoothing[i].reserve;
     const m=margins[i];
     const edge=m.side>0?n.widthLeft-m.left:-n.widthRight+m.right;
     const line=T.MathUtils.lerp(offset+inside*.60*cut,edge,m.use*weights[j]);
     return this.track.point(n.s,T.MathUtils.clamp(line,-n.widthRight+Math.min(reserve,m.right),n.widthLeft-Math.min(reserve,m.left)));
   });
   // Fair the reconstructed S3 line laterally within each road cross-section.
   // This removes short kinks without moving the curve along the lap or cutting corners.
   const sections=this.track.layout.nodes.map((n,i)=>{
     const center=this.track.point(n.s),normal=this.track.point(n.s,1).sub(center);
     const weight=reference.smoothing[i].section;
     return {center,normal,weight,initial:points[i].clone().sub(center).dot(normal)};
   });
   for(let pass=0;pass<24;pass++){
     const offsets=sections.map(({center,normal,weight,initial},i)=>{
       if(!weight)return initial;
       const n=this.track.layout.nodes[i];
       const mean=points[i-1].clone().lerp(points[i+1],.5).sub(center).dot(normal);
       const corrected=T.MathUtils.clamp(mean,Math.max(-n.widthRight+margins[i].right,initial-1.6),Math.min(n.widthLeft-margins[i].left,initial+1.6));
       return T.MathUtils.lerp(points[i].clone().sub(center).dot(normal),corrected,.8*weight);
     });
     sections.forEach(({center,normal,weight},i)=>{if(weight)points[i].copy(center).addScaledVector(normal,offsets[i]);});
   }
   // Fair linked direction changes together inside the sampled road.
   const entry=this.track.layout.nodes.findIndex(n=>n.s>=reference.fairingRange[0]);
   const exit=this.track.layout.nodes.findIndex(n=>n.s>=reference.fairingRange[1]);
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
         const a=points[i-stride],b=points[i],c=points[i+stride];
         const target=(bend(points[i-2*stride],a,b)+bend(b,c,points[i+2*stride]))/2;
         const {center,normal}=sections[i],n=this.track.layout.nodes[i];
         const current=bend(a,b,c);
         const derivative=(bend(a,probe.copy(b).addScaledVector(normal,.04),c)-current)/.04;
         if(Math.abs(derivative)<.0001)continue;
         const offset=probe.copy(b).sub(center).dot(normal);
         const correction=T.MathUtils.clamp((target-current)/derivative,-.4,.4);
         const transitLimit=reference.smoothing[i].transit || (.55+3.2*fastSections[i])*reference.smoothing[i].transitFade;
         const adjust=this.timed?8:transitLimit;
         const initial=sections[i].initial;
         b.copy(center).addScaledVector(normal,T.MathUtils.clamp(offset+.55*correction,Math.max(-n.widthRight+margins[i].right,initial-adjust),Math.min(n.widthLeft-margins[i].left,initial+adjust)));
       }
     }
   }
   // At sustained high pace optimise the whole entry-to-exit arc. A tight local
   // fit to noisy registered positions can otherwise create a false braking point.
   points.forEach((point,i)=>{
     const pace=fastSections[i],kerb=margins[i].use*weights[this.region(this.track.layout.nodes[i].s)];
     const s=this.track.layout.nodes[i].s;
     // Keep Bruxelles and the next left on one continuous arc through the change of direction.
     const linked=reference.smoothing[i].linked;
     const paired=reference.smoothing[i].pair;
     // Change both apexes coherently; keep alternatives inside the same track corridor.
     const compromise=(weights[reference.pairedTurns[0]]+weights[reference.pairedTurns[1]])*.5;
     const w=T.MathUtils.lerp(T.MathUtils.lerp((.56+.42*pace)*(1-kerb*(1-pace)),.96,linked),.96-.40*compromise,paired);
     const lineWeight=this.timed ? .98-.18*lineWeightAt(s,weights,this.turns,this.ends) : w;
     point.lerp(this.track.point(s,reference.fastOffsets[i]),lineWeight);
     if(this.timed && kerb>0){
       const side=margins[i].side;
       const apex=this.track.point(s,side*(this.track.width(s,side)-.48));
       point.lerp(apex,.45*kerb);
     }
     const hairpin=reference.hairpin;
     if(this.timed && s>hairpin.start && s<hairpin.end){
       const cut=Math.exp(-(((s-hairpin.apex)/30)**2))*T.MathUtils.smoothstep(Math.min(s-hairpin.start,hairpin.end-s),0,15);
       const inside=hairpin.side*(this.track.width(s,hairpin.side)-.48);
       point.lerp(this.track.point(s,inside),cut*(.90+.1*weights[hairpin.turn]));
     }
     const j=this.region(s),side=this.track.curbSide(s);
     if(this.timed && s>reference.shiftRange[0] && s<reference.shiftRange[1] && (this.entry[j] || this.exitOffset[j])){
       const apex=this.turns[j]+this.apex[j]*8;
       const shift=this.entry[j]*Math.exp(-(((s-apex+65)/50)**2))+this.exitOffset[j]*Math.exp(-(((s-apex-65)/50)**2));
       const center=this.track.point(s),normal=this.track.point(s,1).sub(center);
       const fade=T.MathUtils.smootherstep(Math.min(s-reference.shiftRange[0],reference.shiftRange[1]-s,s-(this.ends[j-1]??0),(this.ends[j]??this.track.length)-s),0,40);
       const offset=point.clone().sub(center).dot(normal)+shift*.35*fade;
       point.lerp(center.addScaledVector(normal,T.MathUtils.clamp(offset,-this.track.width(s,-1)+.48,this.track.width(s,1)-.48)),fade);
     }
     if(this.timed && this.cut[j] && side && side===Math.sign(this.track.curvature(this.turns[j]))){
       const fraction=Math.exp(-(((s-this.turns[j]-this.apex[j]*8)/28)**2));
       const edge=side*(this.track.width(s,side)-.30);
       point.lerp(this.track.point(s,edge),this.cut[j]*fraction*T.MathUtils.smootherstep(margins[i].use,0,.6)*[-8,-4,4,8].filter(d=>this.track.curbSide(s+d)===side).length/4);
     }
   });
   this.racePath=new T.CatmullRomCurve3(points,true);
   if(this.pathCache.size>=12)this.pathCache.delete(this.pathCache.keys().next().value!);
   this.pathCache.set(key,this.racePath);
 }
 // Browser builds this in a dedicated worker. Node regression uses the same planner.
 planWorker?:Worker;
 private pendingPlan?:{plan:LapPlan,path:T.CatmullRomCurve3};
 private preparePlan(plan:LapPlan){
   const path=new T.CatmullRomCurve3(plan.points.map(p=>new T.Vector3().fromArray(p)),true);
   this.pendingPlan={plan,path};
 }
 private requestedLap=0;
 private generation=0;
 private stageNextLap(){
   const lap=this.lap+(this.timed&&this.invalidLap?0:1);
   if(this.requestedLap===lap || this.lastLap || this.recovering)return;
   this.requestedLap=lap;
   const observations=this.observations.map((m,j)=>{
     const copy=new Map(m);
     if(this.timed && this.comparable && j<this.region(this.s) && !this.incidents[j]){
       const w=this.weights[j];
       copy.set(w,Math.min(copy.get(w)??Infinity,this.regionTimes[j]));
     }
     return [...copy];
   });
   const anchors=this.memory.groups.map(r=>({...r,best:r.best?{...r.best}:undefined,weights:r.weights?[...r.weights]:undefined}));
   if(this.flying&&this.comparable)this.groups.forEach(({turn,last},i)=>{
     if(this.s>this.ends[last])rememberGroup(anchors[i],this.strategyAt(turn),this.regionTimes.slice(turn,last+1).reduce((a,b)=>a+b,0),this.traces[turn].entry,this.incidents.slice(turn,last+1).some(Boolean),this.weights.slice(turn,last+1));
   });
   const request:PlanRequest={circuitId:this.track.id,anchors,lap,count:this.count,weights:[...this.weights],slides:this.memory.slides,energyEnabled:this.energyEnabled,wearEnabled:this.wearEnabled,compound:this.tyreCompound,wear:corners.map(k=>this.dynamics.tyres[k].degradation),energy:this.gearbox.energy,entrySpeeds:this.entrySpeeds,pickup:this.pickup,caution:this.memory.corners.map(r=>r.caution),observations};
   if(this.planWorker){
     const generation=this.generation;
     this.planWorker.onmessage=({data})=>{
       if(data.generation===generation && this.generation===generation && data.plan.lap===this.lap+(this.timed&&this.invalidLap?0:1))this.preparePlan(data.plan);
     };
     this.planWorker.postMessage({generation,request});
   }else{
     const planner=new Cruise(this.track,new RacingLine(this.track,false));
     this.preparePlan(planner.planLap(request));
     planner.dispose();planner.line.dispose();
   }
 }
 planLap(request:PlanRequest){
   if(request.anchors)this.memory.groups=request.anchors;
   this.invalidLap=false;this.rejoin=undefined;this.recoveredToMain=false;this.recoveryHold=0;this.count=request.count;this.lap=request.lap;this.weights=request.weights;this.memory.slides=request.slides.map(mark=>({...mark}));
   this.observations=request.observations.map(entries=>new Map(entries));
   this.pickup=[...request.pickup];this.memory.corners.forEach((r,i)=>r.caution=request.caution[i]);
   this.energyOption=request.energyEnabled;this.wearOption=request.wearEnabled;this.gearbox.energy=request.energy;
   corners.forEach((k,i)=>{this.dynamics.tyres[k].degradation=request.wear[i];this.dynamics.tyres[k].compound=request.compound;});
   this.entry=this.blank();this.apex=this.blank();this.exitOffset=this.blank();
   this.cut=this.blank();this.late=this.blank();
   this.nextPath();
   this.comparisons=[];
   if(this.timed){this.applyAnchors();this.compareCorners(request.entrySpeeds);}
   this.showPlan();
   // The live driver applies current slide memory when adopting this geometry.
   this.memory.slides=[];
   this.buildSpeedPlan();
   return {lap:this.lap,entry:this.entry,apex:this.apex,exitOffset:this.exitOffset,cut:this.cut,late:this.late,comparisons:this.comparisons,weights:this.weights,points:this.racePath.points.map(p=>p.toArray()),
     apexGain:this.apexGain,pickup:this.pickup,speed:this.speedPlan,vertical:this.verticalCurve,lateral:this.lateralCurve,braking:this.brakingLimit,lengths:this.pathLengths};
 }
 private adoptNextLap(){
   const pending=this.pendingPlan;this.pendingPlan=undefined;
   if(!pending || pending.plan.lap!==this.lap){this.applyAnchors(true);this.setPath(this.weights);this.buildSpeedPlan();this.showPlan();return;}
   const {plan,path}=pending;
   this.apexGain=plan.apexGain;this.pickup=plan.pickup;this.entry=plan.entry;this.apex=plan.apex;this.exitOffset=plan.exitOffset;this.comparisons=plan.comparisons;this.cut=plan.cut;this.late=plan.late;this.weights=plan.weights;this.racePath=path;
   this.speedPlan=plan.speed;this.brakingLimit=plan.braking;this.pathLengths=plan.lengths;
   this.verticalCurve=plan.vertical;this.lateralCurve=plan.lateral;
   this.applyAnchors(true);this.setPath(this.weights);this.buildSpeedPlan();this.showPlan();
 }

 private strategyAt(j:number){return {entry:this.entry[j],apex:this.apex[j],exitOffset:this.exitOffset[j],cut:this.cut[j],late:this.late[j],pickup:this.pickup[j],apexGain:this.apexGain[j]};}
 private applyAnchors(keepSelection=false){
   if(!this.timed)return;
   this.groups.forEach(({turn,last},i)=>{const record=this.memory.groups[i];if(!record?.best)return;const strategy=nextStrategy(record);
     if(keepSelection&&!record.failed)return;
     for(let j=turn;j<=last;j++){this.weights[j]=record.weights?.[j-turn]??this.weights[j];this.entry[j]=strategy.entry;this.apex[j]=strategy.apex;this.exitOffset[j]=strategy.exitOffset;this.cut[j]=strategy.cut;this.late[j]=strategy.late;this.pickup[j]=strategy.pickup;this.apexGain[j]=strategy.apexGain;}
   });
 }
 private compareCorners(entries:number[]){
   const probe=new Cruise(this.track,new RacingLine(this.track,false));
   probe.lap=this.lap;probe.count=this.count;probe.trial=true;
   probe.pickup=[...this.pickup];probe.memory.corners=this.memory.corners;probe.memory.groups=this.memory.groups;
   probe.weights=[...this.weights];probe.memory.slides=this.memory.slides;
   for(const k of corners)probe.contactCenters[k]=new T.Vector3(
     (k[1]==='L'?1:-1)*(k[0]==='F'?.771:.733),0,k[0]==='F'?1.693:-1.693);
   this.comparisons=this.groups.map(()=>[]);
   probe.energyOption=this.energyEnabled;probe.wearOption=this.wearEnabled;for(const k of corners){probe.dynamics.tyres[k].compound=this.tyreCompound;probe.dynamics.tyres[k].degradation=this.dynamics.tyres[k].degradation;}
   for(const entry of [-1,0,1])for(const apex of [-1,0,1])for(const exitOffset of [-1,0,1]){
     const choices=this.groups.map((group,i)=>{
       const memory=this.memory.groups[i],step=memory.best?memory.step:1;
       // Keep the exact measured incumbent in the comparison: an exploratory
       // lap is adopted only if its complete group rollout is faster.
       if(entry===0&&apex===0&&exitOffset===0&&memory.best)return {...memory.best};
       const anchor=nextStrategy(memory);
       return {...anchor,entry:T.MathUtils.clamp(anchor.entry+entry*step,-2,2),apex:T.MathUtils.clamp(anchor.apex+apex*step,-2,2),exitOffset:T.MathUtils.clamp(anchor.exitOffset+exitOffset*step,-2,2),cut:apex===0?anchor.cut:Math.min(.45,anchor.cut+.25*step),late:T.MathUtils.clamp(anchor.late+(entry>0?.15*step:entry<0?-.1*step:0),0,1.25)};
     });
     this.groups.forEach(({turn,last},i)=>{const choice=choices[i];for(let j=turn;j<=last;j++){
       probe.entry[j]=choice.entry;probe.apex[j]=choice.apex;probe.exitOffset[j]=choice.exitOffset;
       probe.cut[j]=choice.cut;probe.late[j]=choice.late;probe.apexGain[j]=choice.apexGain;probe.pickup[j]=choice.pickup;
     }});
     probe.setPath(probe.weights);probe.buildSpeedPlan();
     this.groups.forEach(({turn,start,end},i)=>{
       probe.distance=start-this.track.layout.grid.s;
       probe.speed=entries[i] || this.referenceSpeed(start);
       probe.gearbox=new Gearbox();probe.dynamics.reset();
       probe.gearbox.energy=this.gearbox.energy;
       for(const k of corners){const t=probe.dynamics.tyres[k];t.degradation=this.dynamics.tyres[k].degradation;t.omega=probe.speed/t.radius;}
       for(let j=0;j<10;j++)probe.gearbox.update(.1,probe.speed);
       probe.status='running';probe.accumulator=probe.elapsed=probe.brakeForce=probe.accelerationCommand=0;
       probe.braking=false;probe.aeroZone=probe.routeAeroZone(start);probe.previousZone=probe.aeroZone;probe.wingTravel=Number(!!probe.aeroZone);
       let time=0,brake=0,kerb=false,valid=true;
       while(probe.s<end && time<60){
         const before=probe.s;
         probe.tick(1/60);
         time+=Math.min(1,(end-before)/Math.max(.00001,probe.s-before))/60;
         if(!brake && probe.gearbox.brake>.1)brake=probe.s;
         const pose=probe.pose();
         for(const k of corners){
           const local=probe.contactCenters[k]!,s=probe.s+local.z;
           const section=this.track.pose(s);
           const offset=local.clone().applyQuaternion(pose.quaternion).add(pose.position)
             .sub(section.position).applyQuaternion(section.quaternion.invert()).x;
           const side=this.track.curbSide(s),onSide=side!==0 && side===Math.sign(offset);
           if(Math.abs(offset)+(k[0]==='F'?.15:.19)>this.track.width(s,offset)+(onSide?.8:0)+.05)valid=false;
           if(Math.abs(probe.s-this.turns[turn])<65 && probe.dynamics.suspension.surfaceGrip[k]<.99)kerb=true;
         }
       }
       this.comparisons[i].push({...choices[i],time,exit:probe.speed*3.6,brake,kerb,valid:valid && probe.s>=end});
     });
   }
   this.comparisons.forEach((results,i)=>{
     const best=results.filter(r=>r.valid).sort((a,b)=>a.time-b.time)[0];
     if(best)for(let j=this.groups[i].turn;j<=this.groups[i].last;j++){
       this.entry[j]=best.entry;this.apex[j]=best.apex;this.exitOffset[j]=best.exitOffset;
       this.cut[j]=best.cut;this.late[j]=Number(best.late)*(1-this.memory.corners[j].caution);this.pickup[j]=best.pickup;this.apexGain[j]=best.apexGain;
     }
   });
   probe.dispose();probe.line.dispose();
   this.setPath(this.weights);this.buildSpeedPlan();
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
   const linked=(a:number,b:number)=>best.map((v,i)=>i===a?.25:i===b?.85:v);
   const choices=[best,linked(7,8),linked(9,10),busStop([1,0]),busStop([0,1]),best.map(()=>1),...[-.2,.2].map(step=>best.map(w=>Math.round(10*T.MathUtils.clamp(w+step,0,1))/10))];
   const forecast=(weights:number[])=>{
     this.setPath(weights);this.buildSpeedPlan();
     const times=this.blank();
     for(let i=0;i<this.speedPlan.length-1;i++){
       const distance=i*this.planStep;
       const j=this.region(this.track.layout.grid.s+distance);
       times[j]+=2*this.pathLengths[i]/Math.max(1,this.speedPlan[i]+this.speedPlan[i+1]);
     }
     return times;
   };
   const baseline=forecast(best);
   // Compare measured split deltas on tested lines. For an untested line,
   // compare its physics forecast with the same reference geometry.
   const score=(weights:number[])=>forecast(weights).map((time,j)=>{
     const observed=this.observations[j].get(weights[j]);
     const reference=this.observations[j].get(best[j]);
     return observed!==undefined && reference!==undefined ? observed-reference : time-baseline[j];
   });
   const scores=choices.map(score);
   // Score linked corners through their common exit using one complete candidate.
   this.weights=[...best];
   const groups=this.groups.map(g=>Array.from({length:g.last-g.turn+1},(_,i)=>g.turn+i));
   for(const group of groups){
     const cost=(k:number)=>group.reduce((sum,j)=>sum+scores[k][j],0);
     let selected=0;
     for(let k=1;k<choices.length;k++){
       if(cost(k)<cost(selected)-.002)selected=k;
     }
     for(const j of group)this.weights[j]=choices[selected][j];
   }
   const joinedTime=score(this.weights).reduce((sum,time)=>sum+time,0);
   const totals=scores.map(regions=>regions.reduce((sum,time)=>sum+time,0));
   const quickest=totals.indexOf(Math.min(...totals));
   if(totals[quickest]+.002<joinedTime)this.weights=choices[quickest];
   this.setPath(this.weights);this.buildSpeedPlan();
 }
 showPlan(){this.line.update(station=>this.point(this.track.wrap(station-this.track.layout.grid.s)),station=>this.timed || station<this.track.wrap(this.track.layout.grid.s));this.shadeLine();}
 private shadeLine(){
   this.line.shade(station=>{
     const i=Math.floor(this.track.wrap(station-this.track.layout.grid.s)/this.planStep);
     const decel=(this.speedPlan[i]**2-this.speedPlan[i+1]**2)/(2*this.pathLengths[i]);
     return decel;
   });
 }
 aeroZone=0;wingTravel=0;private previousZone=-1;
 verticalCurve:number[]=[];
 racePath:T.CatmullRomCurve3;
 accelerationCommand=0;
 dynamics=new LateralDynamics();
 status:CruiseStatus='idle';distance=0;travelled=0;speed=0;elapsed=0;limitKmh=Infinity;pace=1;accumulator=0;
 private brakingLimit:number[]=[];
 private lateralCurve:number[]=[];
 pathLengths:number[]=[];speedPlan:number[]=[];planStep=5;
 constructor(public track:CircuitTrack,public line:RacingLine){
   this.ends=this.turns.map((s,i)=>(s+(this.turns[i+1]??Infinity))/2);
   this.memory=new DriverMemory(this.track.layout.driving.memoryKey,this.turns.length,this.groups.length);
   this.apexGain=this.blank();this.weights=this.blank();this.regionTimes=this.blank();this.entry=this.blank();this.apex=this.blank();this.exitOffset=this.blank();this.cut=this.blank();this.late=this.blank();this.incidents=this.blank();this.exits=this.blank();this.pickup=this.blank();
   this.observations=this.turns.map(()=>new Map<number,number>());this.traces=this.turns.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));this.entrySpeeds=this.groups.map(()=>0);this.samples=this.reviewSections.map(()=>[]);
   this.restoreDriver();
   this.racePath=new T.CatmullRomCurve3(track.layout.nodes.map((n,i)=>track.point(n.s,track.layout.reference?.raceOffsets[i]??0)),true);
   this.setPath(this.weights);this.buildSpeedPlan();this.showPlan();
 }
 buildSpeedPlan(){const n=Math.ceil(this.track.length/5);this.planStep=this.track.length/n;
 const speeds=this.speedPlan,curvatures:number[]=[];
 const mass=lateralParameters.mass;
 // Estimated lateral acceleration envelope (m/s²), shared by every corner.
 const frontShare=lateralParameters.rearArm/(lateralParameters.frontArm+lateralParameters.rearArm);
 const wheelbase=lateralParameters.frontArm+lateralParameters.rearArm;
 const envelope=(v:number,opening:number,vertical:number,ax=0)=>{
   const normal=mass*(9.81+T.MathUtils.clamp(v*v*vertical,-7,10));
   const transfer=mass*ax*suspensionParameters.cgHeight/wheelbase;
   const baseline=aeroForces(v,opening);
   const deflection=(force:number,spring:number)=>T.MathUtils.clamp(force/(2*spring),-.038,.038);
   const aero=platformForces(v,opening,
     nominalGap.front-deflection(baseline.frontDownforce-transfer+(normal-mass*9.81)*frontShare,suspensionParameters.frontSpring),
     nominalGap.rear-deflection(baseline.rearDownforce+transfer+(normal-mass*9.81)*(1-frontShare),suspensionParameters.rearSpring));
   const midSpeed=T.MathUtils.smoothstep(v,29,45)*(1-T.MathUtils.smoothstep(v,58,75));
   const margin=this.timed?.84+.065*T.MathUtils.smoothstep(v,22,60)+.020*midSpeed:.84;
   const axle=(share:number,load:number)=>2*tyreCapacity(load/2,mass*9.81*share/2,lateralParameters.grip*tyreCompounds[this.tyreCompound].grip*(1-(this.wearEnabled?.3*Math.max(...corners.map(k=>this.dynamics.tyres[k].degradation)):0)))*margin/mass;
   const front=axle(frontShare,normal*frontShare-transfer+aero.frontDownforce);
   const rear=axle(1-frontShare,normal*(1-frontShare)+transfer+aero.rearDownforce);
   let lateral=Math.min(front/frontShare,rear/(1-frontShare));
   if(!this.timed)lateral=Math.min(lateral,16+.0047*v*v+normal/mass-9.81);
   return {front,rear,lateral,drag:aero.drag};
 };
 const remaining=(capacity:number,lateral:number)=>Math.sqrt(Math.max(0,capacity**2-lateral**2));
 let travel=this.routeAeroZone(this.track.layout.grid.s-1)?1:0;
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
   travel=advanceWing(travel,!!this.routeAeroZone(this.track.layout.grid.s+d),this.pathLengths[i]/Math.max(5,this.referenceSpeed(this.track.wrap(this.track.layout.grid.s+d))));
   openings[i]=wingOpening(travel);
   let lo=0,hi=topSpeed;
   for(let j=0;j<12;j++){
     const v=(hi+lo)/2;
     const capacity=envelope(v,openings[i],this.verticalCurve[i]).lateral;
     if(k*v*v<=capacity)lo=v;else hi=v;
   }
   const station=this.track.wrap(this.track.layout.grid.s+d);
   // A measured straight-line speed envelope suppresses unrealistic overspeed
   // before Bus Stop; the backward braking pass still chooses the braking point.
   for(const cap of this.track.layout.driving.speedCaps)if(station>=cap.start && station<=cap.end){
     lo=Math.min(lo,this.referenceSpeed(station)*cap.multiplier+cap.offset);
   }
   const pitStation=this.pitStation(this.track.layout.grid.s+d);
   if(pitStation>=this.track.pit!.limitEntry && pitStation<=this.track.pit!.limitExit){
     // Pit walls leave little recovery space. Budget lateral acceleration on
     // the local exit radius before the braking sweep places the turn-in point.
     lo=Math.min(lo,this.track.pit!.speedLimit/3.6,Math.sqrt(4.5/Math.max(.001,local,k)));
   }
   const corner=this.region(station);
   speeds[i]=lo*(1+this.apexGain[corner]*Math.exp(-(((station-this.turns[corner])/60)**2)))*(1-.035*this.memory.corners[corner].caution*Math.exp(-(((station-this.turns[corner])/60)**2)));
 }
 // Two sweeps carry acceleration and braking constraints across the timing line.
 for(let pass=0;pass<2;pass++){
   if(pass>0){
     let previous=this.routeAeroZone(this.track.layout.grid.s-this.planStep),enabled=!!previous;
     travel=enabled?1:0;
     for(let i=0;i<n;i++){
       const zone=this.routeAeroZone(this.track.layout.grid.s+i*this.planStep);
       if(zone!==previous)enabled=!!zone;
       if((speeds[(i+1)%n]**2-speeds[i]**2)/(2*this.pathLengths[i])<-.5)enabled=false;
       travel=advanceWing(travel,enabled,this.pathLengths[i]/Math.max(3,speeds[i]));
       openings[i]=wingOpening(travel);previous=zone;
     }
   }
   speeds[n]=this.lastLap?0:this.lap===1?topSpeed:speeds[0];
   for(let i=n-1;i>=0;i--){
     const v=speeds[i+1],ay=curvatures[i]*v*v;
     const capacity=envelope(v,openings[i],this.verticalCurve[i],-Math.min(30,12+.0029*v*v));
     const available=Math.min(remaining(capacity.front,ay*frontShare)/.57,remaining(capacity.rear,ay*(1-frontShare))/.43);
     const pit=this.pitStation(this.track.layout.grid.s+i*this.planStep);
     const attack=this.timed ? 1-T.MathUtils.smoothstep(curvatures[i]*v*v,2,10) : 0;
     const brake=Math.min(pit>=this.track.pit!.limitEntry && pit<=this.track.pit!.limitExit ? 4 : 12+(5+2*this.late[this.region(this.track.layout.grid.s+i*this.planStep)])*attack+.0029*v*v,
       (.80+(.15+.04*this.late[this.region(this.track.layout.grid.s+i*this.planStep)])*attack)*available+capacity.drag/mass);
     speeds[i]=Math.min(speeds[i],Math.sqrt(v*v+2*brake*this.pathLengths[i]));
   }
   if(pass===0)this.brakingLimit=speeds.slice();
   if(this.lap===1)speeds[0]=0;
   for(let i=0;i<n;i++){
     const v=speeds[i],capacity=envelope(v,openings[i],this.verticalCurve[i],driveAcceleration(v,openings[i],this.flying));
     const traction=remaining(capacity.rear,curvatures[i]*v*v*(1-frontShare));
     speeds[i+1]=Math.min(speeds[i+1],Math.sqrt(v*v+2*Math.min(traction,(plannedForce(v,this.flying)-capacity.drag)/mass)*this.pathLengths[i]));
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
     const centre=Math.round(this.track.wrap(mark.station-this.track.layout.grid.s)/this.planStep);
     const approach=Math.ceil(240/this.planStep),exit=Math.ceil(140/this.planStep);
     for(let offset=-approach;offset<=exit;offset++){
       const i=(centre+offset+n)%n;
       const d=this.track.wrap(this.track.layout.grid.s+i*this.planStep-mark.station+this.track.length/2)-this.track.length/2;
       const dv2=d<0?2*Math.min(45,15+.003*this.speedPlan[i]**2)*Math.max(0,-d-8):2*11*Math.max(0,d-10);
       const limit=Math.sqrt(mark.safeSpeed**2+dv2);
       this.speedPlan[i]=Math.min(this.speedPlan[i],limit);
       this.brakingLimit[i]=Math.min(this.brakingLimit[i],limit);
     }
   }
   if(this.timed)this.speedPlan[n]=this.speedPlan[0];
 }
 plannedSpeed(){const t=this.distance/this.planStep,i=Math.min(this.speedPlan.length-2,Math.floor(t));return T.MathUtils.lerp(this.speedPlan[i],this.speedPlan[i+1],t-i);}

 private routeAeroZone(station:number){
   if(!this.flying)return 0;
   const zone=this.track.aeroZone(station);
   const pit=this.pitStation(station);
   if(pit>=this.track.pit!.entry && pit<=this.track.pit!.exit)return 0;
   return zone;
 }
 private simulationSteps=0;
 get simulationTime(){return this.simulationSteps/240;}
 get pitLimiterActive(){const station=this.pitStation(this.s),pit=this.track.pit;return !this.recoveredToMain&&station>=pit.limitEntry&&station<=pit.limitExit;}
 private pitStation(station:number){
   if(!this.track.pit)return Infinity;
   if(this.lap===1)return station;
   return this.lastLap?station-this.track.length:Infinity;
 }
 get s(){return this.track.layout.grid.s+this.distance;}
 point(distance=this.distance){
   const station=this.track.layout.grid.s+distance;
   const path=this.racePath.getPoint(this.track.wrap(station)/this.track.length);
   if(this.rejoin && distance>=this.rejoin.start && distance<this.rejoin.end){
     return this.track.point(station).lerp(path,T.MathUtils.smootherstep(distance,this.rejoin.start,this.rejoin.end));
   }
   // After a centreline reset, stay on the main road instead of crossing the pit wall.
   if(this.recoveredToMain)return path;
   const pitStation=this.pitStation(station);
   const pit=this.track.pit;
   if(pit && this.track.layout.pit.approach.kind==='junction'){
     // Blend lateral position on the main road before the junction. Pit station
     // advances at a different arc-length rate; blending both roads after the
     // junction can overtake the pit path and then reverse direction.
     if(pitStation>=pit.entry-(this.track.layout.pit.approach.distance??0) && pitStation<pit.entry)
       return path.lerp(this.track.point(station),T.MathUtils.smootherstep(pitStation,pit.entry-(this.track.layout.pit.approach.distance??0),pit.entry));
     if(pitStation>=pit.entry && pitStation<=pit.exit)return pit.point(pitStation);
     if(this.lap===1 && pitStation>pit.exit && pitStation<pit.exitEnd)return pit.exitLine(pitStation,path);
     return path;
   }
   if(this.lap===1 && pitStation>=this.track.pit!.exitBlendStart && pitStation<this.track.pit!.exitEnd && this.track.pit)return this.track.pit.exitLine(pitStation,path);
   if(pitStation>=this.track.pit!.entry && pitStation<=this.track.pit!.exit && this.track.pit){
     return path.lerp(this.track.pit.point(pitStation),this.track.pit.blend(pitStation));
   }
   return path;
 }
 pose(){const position=this.point(),forward=this.point(this.distance+2).sub(this.point(this.distance-2)).normalize(),left=new T.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(left).normalize();position.addScaledVector(left,this.dynamics.offset);position.y=this.track.getSurfaceHeightAt(position,false)??position.y;const quaternion=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(left,up,forward));quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),this.dynamics.headingError));return {position,quaternion};}
 curvature(distance=this.distance,span=4){const a=this.point(distance-span),b=this.point(distance),c=this.point(distance+span),u=b.clone().sub(a),v=c.clone().sub(b);return Math.atan2(v.x*u.z-v.z*u.x,u.x*v.x+u.z*v.z)/Math.max(.1,(Math.hypot(u.x,u.z)+Math.hypot(v.x,v.z))/2);}
 sampleContacts(h:number,{position,quaternion}=this.pose()){
   const suspension=this.dynamics.suspension;
   for(const z of [-1.25,1.25]){
     let relative=0;
     for(const x of [-.09,.09]){
       const probe=this.contactProbe.set(x,0,z).applyQuaternion(quaternion).add(position);
       relative+=((this.track.getSurfaceHeightAt(probe)??probe.y)-probe.y)*.5;
     }
     if(z>0)suspension.frontRoad=relative;else suspension.rearRoad=relative;
   }
   for(const key of corners){
     const local=this.contactCenters[key];
     if(!local)continue;
     const hub=this.contactHub.copy(local).applyQuaternion(quaternion).add(position);
     const axle=this.contactAxle.set(1,0,0);
     if(key[0]==='F')axle.applyAxisAngle(this.contactUp,this.dynamics.wheelAngle(local.x));
     axle.applyQuaternion(quaternion).multiplyScalar(key[0]==='F'?.11:.14);
     const rise=this.track.curbRise(this.track.wrap(this.s+local.z),hub,axle);
     suspension.surfaceGrip[key]=1-.14*Math.min(1,rise/.035);
     const asphalt=this.track.getSurfaceHeightAt(hub);
     const height=asphalt===undefined?rise:asphalt-hub.y;
     // Smooth the road input over the rolling contact patch.
     const change=(height-suspension.ground[key])*(1-Math.exp(-h/.018));
     suspension.ground[key]+=change;
     suspension.groundRate[key]=change/h;
   }
 }
 private outsideRoad(pose:ReturnType<Cruise['pose']>){
   for(const key of corners){
     const local=this.contactCenters[key]??this.contactDefault.set((key[1]==='L'?1:-1)*(key[0]==='F'?.771:.733),0,key[0]==='F'?1.693:-1.693);
     const hub=this.contactHub.copy(local).applyQuaternion(pose.quaternion).add(pose.position);
     const across=this.contactAxle.set(1,0,0).applyQuaternion(pose.quaternion).multiplyScalar(key[0]==='F'?.15:.19);
     for(const side of [-1,0,1]){
       const contact=this.contactPoint.copy(hub).addScaledVector(across,side);
       if(this.track.getSurfaceHeightAt(contact)!==undefined)return false;
     }
   }
   return true;
 }
 private invalidateLap(refresh=true){
   if(this.invalidLap)return;
   if(this.timed){const corner=this.region(this.s),group=this.groups.findIndex(g=>corner>=g.turn&&corner<=g.last);if(group>=0){rememberGroup(this.memory.groups[group],this.strategyAt(corner),0,this.speed,true);this.memory.save();}}
   this.invalidLap=true;this.elapsed=0;this.splits=[];this.stamps=[0];this.report=undefined;this.finishHold=0;
   this.comparable=false;this.aeroZone=0;this.wingTravel=0;this.gearbox.deploymentAllowed=false;this.gearbox.electricKw=0;
   this.generation++;this.requestedLap=0;this.pendingPlan=undefined;
   if(refresh){this.buildSpeedPlan();this.showPlan();}
 }
 private recoverToTrack(){
   this.invalidateLap(false);
   // Never teleport across the timing line or count the relocation as distance driven.
   this.distance+=Math.min(12,Math.max(0,(this.track.length-this.distance)*.5));
   this.rejoin={start:this.distance,end:Math.min(this.track.length,this.distance+100)};
   this.recoveredToMain=true;
   const tyres={...this.dynamics.tyres},energy=this.gearbox.energy;
   this.dynamics.reset();this.dynamics.tyres=tyres;
   for(const key of corners){tyres[key].omega=0;tyres[key].slip=0;tyres[key].locked=false;tyres[key].clearFlatSpots();}
   this.gearbox=new Gearbox();this.gearbox.energy=energy;this.gearbox.consumption=this.energyEnabled;this.gearbox.deploymentAllowed=false;
   this.speed=0;this.accelerationCommand=0;this.brakeForce=0;this.braking=false;this.incident=undefined;
   this.aeroZone=0;this.previousZone=-1;this.wingTravel=0;this.spinTime=0;
   this.recoveryHold=.65;this.accumulator=0;
   this.buildSpeedPlan();this.showPlan();
 }
 toggle(){if(this.status==='running'){this.status='paused';return;}if(this.status==='complete')this.reset();if(this.status==='idle'){this.buildSpeedPlan();this.showPlan();}this.status='running';}
 reset(){this.simulationSteps=0;this.recoveredToMain=false;this.invalidLap=false;this.attempt=0;this.recoveryHold=0;this.rejoin=undefined;this.spinTime=0;this.incident=undefined;this.entry=this.blank();this.apex=this.blank();this.exitOffset=this.blank();this.cut=this.blank();this.late=this.blank();this.apexGain=this.blank();this.entrySpeeds.fill(0);this.comparisons=[];this.generation++;this.pendingPlan=undefined;this.requestedLap=0;this.brakeForce=0;this.braking=false;this.aeroZone=0;this.previousZone=-1;this.wingTravel=0;this.gearbox=new Gearbox();this.finishHold=0;this.stamps=[0];this.bestStamps=[];this.regionHistory=[];this.samples=this.reviewSections.map(()=>[]);this.reviews=[];this.report=undefined;this.nextSample=0;this.slidesThisLap.clear();this.exits=this.blank();this.observations.forEach(m=>m.clear());this.restoreDriver();this.traces=this.turns.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));this.slideBins.clear();this.incidents=this.blank();this.regionTimes=this.blank();this.comparable=true;this.lap=1;this.history=[];this.setPath(this.weights);this.showPlan();this.splits=[];this.accelerationCommand=0;this.dynamics.reset();this.status='idle';this.distance=0;this.travelled=0;this.speed=0;this.elapsed=0;this.accumulator=0;}
 tick(dt:number){if(this.status==='complete'){for(let t=0;t<dt;t+=1/240)this.dynamics.suspension.step(Math.min(1/240,dt-t),0,0,0,0);return 0;}if(this.status!=='running')return 0;if(this.recoveryHold>0){this.recoveryHold=Math.max(0,this.recoveryHold-dt);return 0;}this.accumulator+=dt;let travelled=0;
 if(!this.trial && this.distance>this.track.length*.60)this.stageNextLap();
 while(this.accumulator>=1/240){this.accumulator-=1/240;this.simulationSteps++;const h=1/240,remaining=this.track.length-this.distance;let target=Math.min(this.limitKmh/3.6,this.plannedSpeed()*this.pace);
 const localPitS=this.pitStation(this.s);
 if(localPitS>=this.track.pit!.entry && localPitS<=this.track.pit!.limitExit){
   const distanceToLimit=Math.max(0,this.track.pit!.limitEntry-localPitS);
   target=Math.min(target,Math.sqrt((this.track.pit!.speedLimit/3.6)**2+2*7*distanceToLimit));
 }
 // Keep enough creep torque to overcome rolling resistance until inside the
 // parking tolerance, then follow the final stopping envelope.
 if(this.lastLap)target=Math.min(Math.max(target,remaining>.12?.65:0),Math.sqrt(2*7*Math.max(0,remaining-.08)));const index=Math.min(this.speedPlan.length-2,Math.floor(this.distance/this.planStep));
 const v0=this.speedPlan[index]*this.pace,v1=this.speedPlan[index+1]*this.pace;
 const feedforward=target>=this.limitKmh/3.6 || this.lastLap && remaining<300?0:(v1*v1-v0*v0)/(2*Math.max(.1,this.pathLengths[index]));
 const {RL,RR}=this.dynamics.tyres;
 const drivenSpeed=(RL.omega*RL.radius+RR.omega*RR.radius)/2;
 this.gearbox.deploymentAllowed=this.flying;this.gearbox.consumption=this.energyEnabled;this.dynamics.wearEnabled=this.wearEnabled;
 const availableForce=this.gearbox.update(h,drivenSpeed);
 const desiredAcceleration=T.MathUtils.clamp((target-this.speed)*4+feedforward,-40,14);this.accelerationCommand+=T.MathUtils.clamp(desiredAcceleration-this.accelerationCommand,-180*h,100*h);const tangent=this.point(this.distance+2).sub(this.point(this.distance-2)),slope=Math.atan2(tangent.y,Math.hypot(tangent.x,tangent.z));const pose=this.pose();
 if(!this.trial && this.outsideRoad(pose)){this.recoverToTrack();return travelled;}
 this.spinTime=Math.abs(this.dynamics.headingError)>Math.PI/3 && this.speed>12?this.spinTime+h:0;
 if(!this.trial && this.spinTime>.25 && !this.invalidLap){this.invalidateLap();continue;}
 this.sampleContacts(h,pose);const zone=this.routeAeroZone(this.s);
 if(this.previousZone>=0 && zone && zone!==this.previousZone)this.aeroZone=zone;
 if(!zone || this.accelerationCommand<-.5)this.aeroZone=0;
 this.previousZone=zone;
 this.wingTravel=this.flying?advanceWing(this.wingTravel,!!this.aeroZone,h):0;
 const opening=wingOpening(this.wingTravel);
 const vertical=this.speed**2*T.MathUtils.lerp(this.verticalCurve[index],this.verticalCurve[(index+1)%this.verticalCurve.length],this.distance/this.planStep-index);
 const suspension=this.dynamics.suspension;
 const resistance=platformForces(this.speed,opening,suspension.frontGap,suspension.rearGap,suspension.beta).drag+lateralParameters.mass*9.81*Math.sin(slope);
 const corner=this.region(this.s);
 const learned=this.memory.corners[corner];
 const frontLock=Math.max(-this.dynamics.tyres.FL.slip,-this.dynamics.tyres.FR.slip);
 const slip=Math.abs(Math.atan2(this.dynamics.vy-lateralParameters.rearArm*this.dynamics.yawRate,Math.max(3,this.speed)));
 const k=this.curvature();
 const yawExcess=Math.abs(this.dynamics.yawRate)-this.speed*Math.abs(k);
 const oversteer=slip>.095 && (yawExcess>.12 || this.dynamics.steer*this.dynamics.yawRate<-.003 || slip>.15);
 const locked=this.gearbox.brake>.05 && this.dynamics.tyres.FL.locked && this.dynamics.tyres.FR.locked;
 this.observeIncident(this.speed<=12?undefined:oversteer?'oversteer':
   Math.abs(this.dynamics.offset)>2.5?'missed-apex':locked?'front-lock':undefined,h);
 const apex=this.turns[corner],pickup=this.pickup[corner]*(1-learned.caution);
 const nearExit=this.s>=apex-12*pickup && this.s<apex+95;
 let request=this.accelerationCommand*lateralParameters.mass+resistance;
 if(this.timed && !Number.isFinite(this.limitKmh)){
   // On a straight the acceleration forecast is not a speed governor.
   // Preserve room for the next braking point and for lateral tyre force.
   const next=Math.min(index+1,this.brakingLimit.length-1);
   const limit=Math.min(this.brakingLimit[index],this.brakingLimit[next]);
   const lateral=this.lateralCurve[index]*this.speed**2;
   if(lateral<3 && this.speed+1<limit && slip<.035 && (feedforward>=0 || request<0 && this.speed+2<limit))request=availableForce;
   if(nearExit && this.accelerationCommand>=-.6*pickup){
     request+=pickup*.12*this.dynamics.rearDriveReserve;
   }
   const settledYaw=yawExcess<.08 && this.dynamics.steer*this.dynamics.yawRate>=0;
   if(request>0)request*=1-T.MathUtils.smoothstep(slip,settledYaw?.075:.065,.14);
   if(request<0 && frontLock>.22)request*=1-.55*T.MathUtils.smoothstep(frontLock,.22,.9);
 }
 // Trail the brake into turn-in. As lateral demand grows, release pressure
 // within the available tyre-force ellipse. Abort the trail on lock or power pickup.
 if(request<0 || (this.brakeForce>0 && nearExit===false && this.s<apex && Math.abs(this.dynamics.steer)>.012 && request<resistance)){
   const susp=this.dynamics.suspension;
   const cap=corners.reduce((sum,key)=>sum+susp.capacity(key,lateralParameters.grip*this.dynamics.tyres[key].grip),0);
   const lateralForce=lateralParameters.mass*Math.abs(this.dynamics.ay);
   const reserve=Math.sqrt(Math.max(0,cap*cap-lateralForce*lateralForce));
   const wanted=Math.max(0,-request)*(oversteer?1-.65*T.MathUtils.smoothstep(slip,.08,.20):1);
   const releaseRate=cap*(frontLock>.15 || oversteer?14:3.8);
   this.brakeForce=Math.min(reserve,Math.max(wanted,this.brakeForce-releaseRate*h));
   request=-this.brakeForce;
 }else this.brakeForce=0;
 if(localPitS>=this.track.pit!.entry && localPitS<=this.track.pit!.limitExit && request<0){
   // Ease the pedal when an inside tyre unloads on the narrow pit approach.
   const wheelSlip=Math.max(frontLock,-this.dynamics.tyres.RL.slip,-this.dynamics.tyres.RR.slip);
   request*=1-T.MathUtils.smoothstep(wheelSlip,.08,.35);
 }
 const coasting=this.accelerationCommand<-.15&&request>=0&&request<availableForce*.035;
 const coastRegen=coasting?this.gearbox.coastRecoveryForce(this.speed):0;
 if(coastRegen>0)request=0;
 this.gearbox.throttle=Math.min(1,Math.max(0,request/Math.max(1,availableForce)));
 this.gearbox.brake=Math.min(1,Math.max(0,-request/(40*lateralParameters.mass)));
 this.speed=this.dynamics.longitudinalStep(h,this.speed,Math.min(request,availableForce),slope,vertical,opening,coastRegen);
 this.gearbox.account(this.speed,this.dynamics.longitudinalForce,h,this.dynamics.wheelFx.RL+this.dynamics.wheelFx.RR);
 for(const k of corners)this.displayedLoads[k]+=(T.MathUtils.clamp(this.dynamics.suspension.loads[k],0,30000)-this.displayedLoads[k])*(1-Math.exp(-h/.06));
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
 const transition=this.track.layout.driving.lookTransitions.reduce((value,w)=>Math.max(value,T.MathUtils.smoothstep(this.s,...w.start)*(1-T.MathUtils.smoothstep(this.s,...w.end))),0);
 const distantWeight=.32+.13*transition;
 const pursuit=(1-distantWeight)*demand(goal)+distantWeight*demand(further);
 const ds=h*this.dynamics.step(h,this.speed,k,pursuit);
 if(this.flying && this.s>=this.nextSample){
   this.nextSample=this.s+5;
   const clip=this.reviewSections.findIndex(r=>this.s>=r.start && this.s<=r.end);
   if(clip>=0){
     const sus=this.dynamics.suspension;
     this.samples[clip].push({s:this.s,t:this.elapsed,position:before.clone(),rotation:pose.quaternion.clone().invert(),
       rack:this.dynamics.steer,curve:k,yaw:this.dynamics.yawRate,rear:Math.atan2(this.dynamics.vy-lateralParameters.rearArm*this.dynamics.yawRate,Math.max(3,this.speed)),
       speed:this.speed*3.6,throttle:this.gearbox.throttle,brake:this.gearbox.brake,rpm:this.gearbox.rpm,gear:this.gearbox.index+1,telemetry:{energy:this.energyEnabled?this.gearbox.energy/5e6:1,electricKw:this.gearbox.electricKw,aeroZone:this.aeroZone,delta:this.liveDelta(),tyres:Object.fromEntries(corners.map(k=>{const t=this.dynamics.tyres[k];return [k,{temperature:t.temperature,pressure:t.pressure,wear:this.wearEnabled?t.degradation*100:0}];})) as WheelTelemetry['tyres']},roll:sus.roll,pitch:sus.pitch,heave:sus.heave,hubs:{...sus.hub}});
   }
 }
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
 if(this.flying){
   const gate=this.stamps.length*10,previous=previousStation-this.track.layout.grid.s;
   if(previous<gate && this.distance>=gate)this.stamps.push(this.elapsed+h*(gate-previous)/(this.distance-previous));
 }
 if(this.flying && !this.trial)this.groups.forEach(({start},i)=>{if(previousStation<start && this.s>=start)this.entrySpeeds[i]=this.speed;});
 const j=this.region(previousStation),end=this.ends[j];
 const fraction=this.s>end?(end-previousStation)/(this.s-previousStation):1;
 this.regionTimes[j]+=h*fraction;this.exits[j]=this.speed*3.6;
 if(fraction<1 || this.distance>=this.track.length){
   if(fraction<1)this.regionTimes[j+1]+=h*(1-fraction);
   if(this.flying){
     const best=this.history.reduce((winner,row,i)=>row[2]<(this.history[winner]?.[2]??Infinity)?i:winner,0);
     const ref=this.regionHistory[best]?.[j],last=this.regionHistory.at(-1)?.[j];
     this.report={i:j,delta:ref?this.regionTimes[j]-ref.time:undefined,exitDelta:ref?this.exits[j]-ref.exit:undefined,
       pickupDelta:last?.trace.pickup && trace.pickup?trace.pickup-last.trace.pickup:undefined,previousSlide:!!last?.incident,
       limited:this.memory.slides.some(mark=>this.region(mark.station)===j && mark.safeSpeed<mark.speed)};
   }
 }
 if(Number.isFinite(this.limitKmh)||this.pace<1)this.comparable=false;
 const split=this.splitsAt[this.splits.length];
 if(this.flying && previousStation<split && this.s>=split){
   this.splits.push(this.elapsed+h*(split-previousStation)/(this.s-previousStation));
 }
 const step=before.distanceTo(this.pose().position);travelled+=step;this.travelled+=step;if(this.flying)this.elapsed+=h;
 if(this.rejoin && this.distance>=this.rejoin.end){this.rejoin=undefined;this.showPlan();}
 if(this.distance>=this.track.length && !this.lastLap){
   if(this.flying){if(this.history.every(row=>row[2]>this.elapsed))this.bestStamps=this.stamps;this.splits.push(this.elapsed);this.history.push([...this.splits]);this.finishHold=4;this.reviews.push({lap:this.lap-1,clips:this.samples});this.reviews=this.reviews.slice(-2);this.regionHistory.push(this.regionTimes.map((time,i)=>({time,exit:this.exits[i],incident:this.slidesThisLap.has(i),trace:{...this.traces[i]}})));}
   if(this.flying && this.comparable){
     this.groups.forEach(({turn,last},i)=>{
       const incident=this.incidents.slice(turn,last+1).some(Boolean);
       rememberGroup(this.memory.groups[i],this.strategyAt(turn),this.regionTimes.slice(turn,last+1).reduce((a,b)=>a+b,0),this.traces[turn].entry,incident,this.weights.slice(turn,last+1));
     });
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
       if(this.slideBins.has(Math.floor(mark.station/50))){mark.cleanPasses=0;continue;}
       mark.cleanPasses=(mark.cleanPasses??0)+1;
       if(mark.cleanPasses>=2)mark.safeSpeed=Math.min(mark.speed,mark.safeSpeed+mark.speed*.02);
     }
     this.memory.slides=this.memory.slides.filter(mark=>mark.safeSpeed<mark.speed);
     this.memory.laps.push({date:Date.now(),sectors:this.splits.map((t,i)=>t-(this.splits[i-1]??0))});
     this.memory.laps=this.memory.laps.slice(-60);
     this.memory.save();
   }
   this.traces=this.turns.map(()=>({entry:0,minimum:Infinity,brakeRelease:0,turnIn:0,pickup:0,full:0}));
   this.incident=undefined;this.slideBins.clear();this.slidesThisLap.clear();this.nextSample=0;this.samples=this.reviewSections.map(()=>[]);this.incidents=this.blank();
   this.pickup=this.memory.corners.map(r=>T.MathUtils.clamp(r.pickup+.12-r.caution,0,1));
   this.regionTimes=this.blank();this.comparable=true;
   this.stamps=[0];if(!this.timed || !this.invalidLap)this.lap++;this.attempt++;this.invalidLap=false;this.rejoin=undefined;this.spinTime=0;this.distance=0;this.elapsed=0;this.splits=[];
   this.recoveredToMain=false;this.gearbox.deploymentAllowed=this.flying;
   if(!this.flying){this.aeroZone=0;this.wingTravel=0;this.gearbox.electricKw=0;}
   this.adoptNextLap();continue;
 }
 if(this.lastLap && (remaining<.12 || remaining<.35 && this.speed<.2)){this.distance=this.track.length;this.speed=0;this.dynamics.vy=0;this.dynamics.yawRate=0;this.dynamics.ay=0;this.dynamics.acceleration=0;this.status='complete';this.accumulator=0;break;}}
 return travelled;}
 snapshot():CruiseSnapshot{
 const best=[Infinity,Infinity,Infinity];
 const timingRows:LapTiming[]=(this.flying?[...this.history,this.splits]:this.history).map((ends,index)=>({
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
 const tyres=Object.fromEntries(corners.map(k=>{const t=this.dynamics.tyres[k];return [k,{degradation:this.wearEnabled?t.degradation*100:0,pressure:t.pressure,contact:t.contactPressure,wear:1000*Math.max(...t.wear),locked:t.locked}];}));
 return {invalidLap:this.invalidLap,recovering:this.recovering,attempt:this.attempt,validLaps:this.history.length,platform:{wing:wingOpening(this.wingTravel),frontGap:suspension.frontGap,rearGap:suspension.rearGap},liveDelta:this.liveDelta(),report:this.flying||this.finishHold>0?this.report:undefined,power:{electric:this.gearbox.electricKw,wheels:this.gearbox.driveKw,energy:this.energyEnabled?this.gearbox.energy/5e6:1},aero:{front,rear:suspension.downforce-front,drag:suspension.drag},tyres,station:this.track.wrap(this.s),finishHold:this.finishHold>0,gear:this.gearbox.index+1,rpm:this.gearbox.rpm,throttle:this.gearbox.throttle,brake:this.gearbox.brake,phase:this.lastLap?'in':this.timed?'timed':'out',lap:Math.min(this.count,Math.max(0,this.lap-1)),lastLap:this.history.at(-1)?.[2],bestLap:Math.min(...this.history.map(row=>row[2])),timingRows,splits:[...this.splits],aeroZone:this.aeroZone,status:this.status,speed:this.speed*3.6,progress:this.distance/this.track.length,elapsed:this.elapsed,distance:this.travelled,roll:this.dynamics.suspension.roll*180/Math.PI,pitch:this.dynamics.suspension.pitch*180/Math.PI,heave:this.dynamics.suspension.heave*1000,loads:{...this.displayedLoads},steer:this.dynamics.steer*180/Math.PI,lateralG:this.dynamics.ay/9.81,slip:Math.atan2(this.dynamics.vy,Math.max(this.speed,.1))*180/Math.PI};}
}
