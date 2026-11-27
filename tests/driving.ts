import assert from 'node:assert/strict';
import test from 'node:test';
import {Cruise} from '../src/motion/Cruise';
import {DriverMemory} from '../src/motion/DriverMemory';
import {CircuitTrack} from '../src/tracks/CircuitTrack';
import {circuitData} from '../src/tracks/CircuitRegistry';
const circuit=circuitData('be-1925');
import {RacingLine} from '../src/optimizer/RacingLine';
import {Gearbox} from '../src/motion/Gearbox';
const stored=new Map<string,string>();
Object.assign(globalThis,{localStorage:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)},
 document:{createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})}});
const track=new CircuitTrack(circuit);
function driver(){stored.clear();const car=new Cruise(track,new RacingLine(track));car.lapCount=3;car.lap=2;return car;}

test('different T4/T5 strategies join without a false steering reversal on Kemmel',()=>{
 const car=driver();
 for(const pair of [[1,0],[0,1],[.25,.85]]){
   const weights=Array(19).fill(0);weights[3]=pair[0];weights[4]=pair[1];car.setPath(weights);
   let peak=0,jump=0,previous=0;
   for(let s=1680;s<=1720;s++){
     const k=car.curvature(s-circuit.grid.s);
     peak=Math.max(peak,Math.abs(k));if(s>1680)jump=Math.max(jump,Math.abs(k-previous));previous=k;
   }
   assert.ok(peak<.0004,`false chicane curvature ${peak}`);
   assert.ok(jump<.00004,`curvature discontinuity ${jump}`);
 }
});

test('old controller learning cannot impose stale braking limits; history survives',()=>{
 stored.clear();const laps=[{date:1,sectors:[29,46,30]}];
 stored.set(circuit.driving.memoryKey,JSON.stringify({laps,corners:Array.from({length:19},()=>({time:8,line:1,pickup:.5,caution:1})),slides:[{station:1700,speed:30,safeSpeed:28}]}));
 const memory=new DriverMemory(circuit.driving.memoryKey,circuit.driving.turns.length,circuit.driving.groups.length);
 assert.deepEqual(memory.laps,laps);assert.equal(memory.slides.length,0);
 assert.ok(memory.corners.every(c=>c.caution===0 && c.line===0));
 memory.recordSlide(2330,45);
 assert.deepEqual(new DriverMemory(circuit.driving.memoryKey,circuit.driving.turns.length,circuit.driving.groups.length).slides,memory.slides,'current confirmed learning survives reload');
});

test('brief yaw transients do not poison next-lap speeds; sustained incidents still do',()=>{
 const car=driver(),internal=car as any;car.distance=2330-circuit.grid.s;car.speed=45;
 for(let frame=0;frame<20;frame++){
   for(let i=0;i<12;i++)internal.observeIncident('oversteer',1/240);
   internal.observeIncident(undefined,1/240);
 }
 assert.equal(internal.memory.slides.length,0,'separate 50 ms transients must not accumulate');
 for(let i=0;i<60;i++)internal.observeIncident('oversteer',1/240);
 assert.equal(internal.memory.slides.length,1);
 assert.ok(Math.abs(internal.memory.slides[0].station-2330)<1e-8);
 assert.ok(internal.memory.slides[0].safeSpeed<45);
 car.reset();assert.equal(internal.incident,undefined);
});

test('cruise or reduced pace cannot write a low-speed racing constraint',()=>{
 const car=driver(),internal=car as any;car.speed=20;car.distance=1700-circuit.grid.s;
 for(const limited of [true,false]){
   car.limitKmh=limited?60:Infinity;car.pace=limited?1:.94;
   for(let i=0;i<240;i++)internal.observeIncident('oversteer',1/240);
 }
 assert.equal(internal.memory.slides.length,0);
});

test('line switches are independent scene visibility and leave driving bit-for-bit identical',()=>{
 const a=driver(),b=driver();
 for(const car of [a,b]){
   car.planWorker={postMessage(){}} as unknown as Worker;
   car.setPath(Array(19).fill(0));car.buildSpeedPlan();car.showPlan();
   car.distance=1600-circuit.grid.s;car.speed=70;car.status='running';
   for(const tyre of Object.values(car.dynamics.tyres))tyre.omega=70/tyre.radius;
   car.line.setAlternatives([0,0,0,0,0,5]);
 }
 for(let i=0;i<120;i++){
   a.line.setVisible(i%2===0,i%3===0);b.line.setVisible(false,true);
   a.tick(1/60);b.tick(1/60);
 }
 assert.deepEqual(a.snapshot(),b.snapshot());
 assert.deepEqual(a.speedPlan,b.speedPlan);assert.equal(a.distance,b.distance);
 const visible:unknown[]=[];b.line.group.traverseVisible(o=>visible.push(o));
 assert.ok(visible.includes(b.line.alternatives));assert.ok(!visible.includes(b.line.mesh));
});

test('selected and alternative paths sit above the rendered road and have usable buffers',()=>{
 const car=driver();car.showPlan();
 const g=car.line.mesh.geometry,p=g.getAttribute('position');
 assert.ok(p.count>100 && g.getAttribute('color').count===p.count);
 for(let i=0;i<p.count;i+=29){
   const point=car.line.mesh.position.clone().fromBufferAttribute(p,i),road=track.getSurfaceHeightAt(point);
   if(road!==undefined)assert.ok(Math.abs(point.y-road-.03)<.0001,`wrong surface clearance at vertex ${i}`);
 }
 car.line.setVisible(true,true);const a=track.point(1700),b=track.point(1705);car.line.setAlternatives([...a.toArray(),...b.toArray()]);
 const alt=car.line.alternatives.geometry.getAttribute('position');
 assert.ok(Math.abs(alt.getY(0)-(track.getSurfaceHeightAt(a)??a.y)-.03)<.0001);assert.ok(car.line.alternatives.geometry.getAttribute('lineDistance'));
 car.reset();assert.equal(car.line.alternatives.geometry.getAttribute('position').count,0,'no stale candidates after reset');
});

function runningAt(car:Cruise,s:number,speed=40){
 car.planWorker={postMessage(){}} as unknown as Worker;
 car.distance=s-circuit.grid.s;car.speed=speed;car.status='running';car.accumulator=0;
 car.dynamics.reset();for(const tyre of Object.values(car.dynamics.tyres))tyre.omega=speed/tyre.radius;
 car.setPath(Array(19).fill(0));car.buildSpeedPlan();
}

test('out-lap, in-lap and invalid laps cannot deploy ERS or open wings, including unlimited battery',()=>{
 for(const consumption of [false,true])for(const phase of ['out','in','invalid','flying']){
   const car=driver();car.energyEnabled=consumption;
   car.lap=phase==='out'?1:phase==='in'?5:2;car.invalidLap=phase==='invalid';
   // Cross the real activation line, rather than injecting a wing mode.
   runningAt(car,1180,60);car.gearbox.energy=2e6;
   let deployed=false,opened=false;
   for(let i=0;i<100;i++){car.tick(1/60);deployed ||= car.gearbox.electricKw>1;opened ||= car.wingTravel>0;}
   if(phase==='flying'){assert.ok(deployed);assert.ok(opened);}
   else{assert.equal(deployed,false,phase);assert.equal(opened,false,phase);assert.equal(car.aeroZone,0);}
 }
});

test('four wheels outside trigger recovery without refilling resources or counting an invalid lap',()=>{
 const car=driver();car.lap=2;car.lapCount=1;car.energyEnabled=true;car.wearEnabled=true;
 runningAt(car,1700);car.gearbox.energy=2e6;car.dynamics.tyres.FL.degradation=.25;car.dynamics.tyres.FL.temperature=105;car.dynamics.tyres.FL.wear[3]=.004;
 car.elapsed=30;car.splits=[29];car.dynamics.offset=30;
 const travelled=car.travelled;car.tick(1/60);
 assert.ok(car.invalidLap && car.recovering);assert.equal(car.elapsed,0);assert.deepEqual(car.splits,[]);
 assert.equal(car.snapshot().validLaps,0);assert.equal(car.snapshot().timingRows?.length,0);
 assert.equal(car.travelled,travelled,'relocation is not driven distance');
 const resetPosition=car.pose().position,centre=track.point(car.s);
 assert.ok(Math.hypot(resetPosition.x-centre.x,resetPosition.z-centre.z)<1e-6,'reset on centreline');
 assert.ok(Math.abs(resetPosition.y-track.getSurfaceHeightAt(resetPosition,false)!)<1e-6,'supported by rendered road');
 assert.equal(car.dynamics.offset,0);assert.equal(car.dynamics.headingError,0);
 assert.equal(car.gearbox.energy,2e6);assert.equal(car.dynamics.tyres.FL.degradation,.25);
 assert.equal(car.dynamics.tyres.FL.temperature,105);assert.equal(car.dynamics.tyres.FL.wear[3],0);
 car.tick(.7);for(let i=0;i<120;i++)car.tick(1/60);
 assert.ok(car.speed>0 && car.speed<25 && car.invalidLap && !car.recovering);
 assert.equal(car.gearbox.electricKw,0);assert.equal(car.wingTravel,0);
 for(let i=0;i<1200 && car.s<1840;i++){car.tick(1/60);assert.equal(car.recovering,false,'rejoin must not cause another recovery');}
 assert.ok(car.s>=1840,'smoothly rejoined the selected route');
 // Finish the invalid attempt; the next attempt must still be flying lap 1.
 (car as any).rejoin=undefined;runningAt(car,circuit.grid.s+track.length-.1,25);
 for(let i=0;i<5&&car.invalidLap;i++)car.tick(1/60);
 assert.equal(car.invalidLap,false);assert.equal(car.lap,2);assert.equal(car.history.length,0);
 assert.equal(car.snapshot().validLaps,0);assert.equal(car.snapshot().lap,1);
 // A subsequent valid completion is accepted and only then starts the in-lap.
 runningAt(car,circuit.grid.s+track.length-.1,25);car.elapsed=105;car.splits=[29,75];
 car.tick(1/60);
 assert.equal(car.history.length,1);assert.equal(car.lastLap,true);assert.equal(car.snapshot().validLaps,1);
 assert.equal(car.gearbox.deploymentAllowed,false);assert.equal(car.wingTravel,0);assert.equal(car.gearbox.electricKw,0);
});

test('deployment lock still permits physical braking recovery',()=>{
 const gearbox=new Gearbox();gearbox.consumption=true;gearbox.deploymentAllowed=false;gearbox.energy=2e6;
 gearbox.update(1/60,60);gearbox.brake=.8;gearbox.account(60,-12000,1/60,-5000);
 assert.ok(gearbox.electricKw<0 && gearbox.energy>2e6);
 const charged=gearbox.energy;gearbox.brake=0;gearbox.throttle=1;
 gearbox.account(60,gearbox.update(1/60,60),1/60);
 assert.equal(gearbox.energy,charged);assert.equal(gearbox.electricKw,0);
});

test('invalidating a lap discards stale worker results and plans a replacement valid lap',()=>{
 const car=driver(),internal=car as any;let request:any;
 car.planWorker={postMessage(message:any){request=message;}} as unknown as Worker;
 internal.stageNextLap();const stale=request;
 assert.equal(stale.request.lap,3);
 internal.invalidateLap();
 car.planWorker.onmessage!({data:{generation:stale.generation,plan:{lap:3}}} as MessageEvent);
 assert.equal(internal.pendingPlan,undefined,'stale plan cannot be adopted after invalidation');
 internal.stageNextLap();assert.equal(request.request.lap,2,'retry the same effective flying-lap number');
 assert.notEqual(request.generation,stale.generation);
 const out=driver();out.lap=1;out.invalidLap=true;
 out.planWorker={postMessage(message:any){request=message;}} as unknown as Worker;
 (out as any).stageNextLap();assert.equal(request.request.lap,2,'an invalid out-lap still prepares the first flying lap');
});

test('inside tyres on asphalt or kerb do not trigger recovery',()=>{
 const car=driver();runningAt(car,1700);const internal=car as any;
 const center=car.racePath.getPoint(track.wrap(car.s)/track.length).sub(track.point(car.s));
 const side=track.point(car.s,1).sub(track.point(car.s)).normalize();
 car.dynamics.offset=track.width(car.s,1)-center.dot(side);
 assert.equal(internal.outsideRoad(car.pose()),false,'inside pair still supported');
 car.dynamics.offset+=3;assert.equal(internal.outsideRoad(car.pose()),true);
});

test('a pit-area recovery stays on the main road without snapping back across the divider',()=>{
 const car=driver();car.lap=1;runningAt(car,100);car.dynamics.offset=40;car.tick(1/60);
 assert.ok(car.recovering);
 const end=(car as any).rejoin.end;
 assert.ok(car.point(end-.01).distanceTo(car.point(end+.01))<.05);
 const expected=car.racePath.getPoint(track.wrap(circuit.grid.s+end)/track.length);
 assert.ok(car.point(end).distanceTo(expected)<1e-6);
});
