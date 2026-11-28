import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {RearLight,type RearLightState} from '../../src/scene/vehicle/RearLight';
import {Inspector,defaultView} from '../../src/scene/Inspector';
import {CircuitSession} from '../../src/app/CircuitSession';
import {circuitData} from '../../src/tracks/CircuitRegistry';
import {Gearbox} from '../../src/simulation/vehicle/Gearbox';
import {HelmetLook,helmetLookLimits} from '../../src/scene/camera/HelmetLook';

test('helmet look bounds include automatic corner gaze and tighten pitch at full head rotation',()=>{
 const look=new HelmetLook();
 for(const direction of [-1,1]){
   look.reset();look.drag(direction*10000,direction*10000,800);
   const pose=look.update(10,-direction*.2,-direction*.4);
   assert.ok(Math.abs(pose.yaw)<=helmetLookLimits.yaw);
   assert.ok(pose.pitch<=helmetLookLimits.up*.75+1e-10);
   assert.ok(pose.pitch>=-helmetLookLimits.down*.75-1e-10);
   look.drag(-direction*20,0,800);
   assert.ok(Math.abs(look.update(1,0,0).yaw)<helmetLookLimits.yaw,'reversing at the stop responds immediately without accumulated overshoot');
 }
});
test('helmet drag smoothing is frame-rate independent and recenter/reset do not retain old gaze',()=>{
 const a=new HelmetLook(),b=new HelmetLook();a.drag(210,-80,900);b.drag(210,-80,900);
 for(let i=0;i<30;i++)a.update(1/30,0,0);
 for(let i=0;i<144;i++)b.update(1/144,0,0);
 assert.ok(Math.abs(a.pose.yaw-b.pose.yaw)<1e-10);assert.ok(Math.abs(a.pose.pitch-b.pose.pitch)<1e-10);
 const before=a.pose.yaw;a.recenter();a.update(.016,0,0);
 assert.ok(Math.abs(a.pose.yaw)<Math.abs(before)&&Math.abs(a.pose.yaw)>0,'recenter is damped');
 a.update(2,0,0);assert.ok(Math.abs(a.pose.yaw)<1e-9);
 b.reset();assert.deepEqual(b.update(0,0,0),{pitch:0,yaw:0});
});
const state=(patch:Partial<RearLightState>={}):RearLightState=>({time:0,running:true,consumption:true,pitLimited:false,speed:40,electricKw:60,energyRatio:.8,deploymentAllowed:true,flying:true,brake:0,throttle:.5,...patch});
test('rear warning priority, exact 2/4 Hz edges and immediate dark state',()=>{
 const lamp=new RearLight(),s=state({pitLimited:true,electricKw:-80,energyRatio:.02});
 assert.equal(lamp.update(s),1);assert.equal(lamp.mode,'pit');
 assert.equal(lamp.update({...s,time:.249}),1);assert.equal(lamp.update({...s,time:.25}),0);assert.equal(lamp.update({...s,time:.5}),1);
 s.pitLimited=false;s.time=.6;assert.equal(lamp.update(s),1);assert.equal(lamp.mode,'recovery');
 assert.equal(lamp.update({...s,time:.724}),1);assert.equal(lamp.update({...s,time:.725}),0);assert.equal(lamp.update({...s,time:.85}),1);
 assert.equal(lamp.update(state({time:.9})),0);assert.equal(lamp.mode,'off');
});
test('low energy warning persists through threshold chatter until safe recovery',()=>{
 const lamp=new RearLight();lamp.update(state({energyRatio:.09}));assert.equal(lamp.mode,'low-energy');
 lamp.update(state({energyRatio:.105,time:.2}));assert.equal(lamp.mode,'low-energy');
 lamp.update(state({energyRatio:.12,time:.3}));assert.equal(lamp.mode,'off');
 lamp.update(state({energyRatio:0,time:.4,deploymentAllowed:false}));assert.equal(lamp.mode,'off');
 lamp.update(state({energyRatio:0,time:.5,consumption:false}));assert.equal(lamp.mode,'demo');
 lamp.update(state({energyRatio:0,time:.6,consumption:false,running:false}));assert.equal(lamp.mode,'demo');
 lamp.update(state({time:.7,running:false}));assert.equal(lamp.intensity,0);
});
test('demo rear lamps keep flashing at rest and paused while energy warnings remain gated',()=>{
 const lamp=new RearLight(),s=state({consumption:false,running:false,speed:0});
 assert.equal(lamp.update(s),1);
 assert.equal(lamp.update({...s,time:.4}),0);
 assert.equal(lamp.update({...s,time:.8}),1);
 assert.equal(lamp.update({...s,time:.9,consumption:true}),0);
 assert.equal(lamp.mode,'off');
 assert.equal(lamp.update({...s,time:1}),1);
});
test('fixed-time pulses do not accumulate render-frame drift or fractional brightness',()=>{
 const a=new RearLight(),b=new RearLight();a.update(state({electricKw:-30}));b.update(state({electricKw:-30}));
 for(let i=1;i<=240;i++){const time=i/240,expected=time%.25<.125?1:0;assert.equal(a.update(state({time,electricKw:-30})),expected);if(i%7===0)assert.equal(b.update(state({time,electricKw:-30})),expected);}
 a.reset();assert.equal(a.intensity,0);assert.equal(a.update(state({time:0,consumption:false})),1);
});
test('energy warning uses accepted power; braking remains a separate visual trigger',()=>{
 const gearbox=new Gearbox(),lamp=new RearLight();gearbox.consumption=true;gearbox.brake=1;
 gearbox.account(50,-3000,1/240,-2000);assert.equal(gearbox.electricKw,0);
 lamp.update(state({electricKw:gearbox.electricKw,energyRatio:1}));assert.equal(lamp.mode,'off');
 gearbox.energy=4e6;gearbox.account(50,-3000,1/240,-2000);
 lamp.update(state({time:.1,electricKw:gearbox.electricKw}));assert.equal(lamp.mode,'recovery');
});
test('first-entry and switched-camera resets produce the same car-relative pose',()=>{
 function fixture(previous:string){const inspector=Object.create(Inspector.prototype) as Inspector;const car=new T.Group();car.position.set(50,4,-12);car.rotation.y=.72;Object.assign(inspector,{car,camera:new T.PerspectiveCamera(76,1.6,.02,15000),displayScale:1.25,session:{cruise:{status:'idle'}},controls:{target:new T.Vector3(100,10,200),enableDamping:true,autoRotate:true,update(){}},free:{setEnabled(){}},mode:previous,rotate:true});inspector.camera.position.set(900,400,-100);inspector.resetCamera();return inspector;}
 const first=fixture('follow'),switched=fixture('overview');
 assert.equal(defaultView,'hero');assert.equal(switched.mode,'follow');assert.equal(switched.heroFollow,true);assert.equal(switched.rotate,false);
 assert.deepEqual(first.camera.position,switched.camera.position);assert.deepEqual(first.controls.target,switched.controls.target);assert.equal(switched.camera.fov,42);assert.equal(switched.targetPos,undefined);
});
test('simulation clock pauses and resets; pit limiter excludes a flying lap beside the pits',()=>{
 const session=new CircuitSession(circuitData('cn-2004'),undefined,false),car=session.cruise;
 try{car.status='running';car.tick(1/60);assert.equal(car.simulationTime,1/60);car.status='paused';car.tick(.2);assert.equal(car.simulationTime,1/60);
 const p=car.track.pit;car.distance=(p.limitEntry+p.limitExit)/2-car.track.layout.grid.s;car.lap=1;assert.equal(car.pitLimiterActive,true);
 car.lap=2;assert.equal(car.pitLimiterActive,false);car.reset();assert.equal(car.simulationTime,0);
 }finally{session.dispose();}
});

test('out, in and invalid laps flash mirror and rear lamps in phase, including recovery at rest',()=>{
 for(const consumption of [true,false]){
  const lamp=new RearLight();
  const transit=state({consumption,flying:false,deploymentAllowed:false,speed:0,electricKw:-80});
  for(const time of [0,.1,.25,.49,.5,.75]){
   lamp.update({...transit,time});
   assert.equal(lamp.mode,'transit');assert.equal(lamp.frontIntensity,lamp.intensity);
   assert.equal(lamp.intensity,time%.5<.25?1:0);
  }
  lamp.update({...transit,time:.8,pitLimited:true});
  assert.equal(lamp.mode,'pit');assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
  lamp.update(state({time:1,consumption}));assert.equal(lamp.frontIntensity,0);
  if(consumption)assert.equal(lamp.intensity,0);
 }
});
test('flying-lap mirrors stay dark during normal driving, coast recovery, braking and energy shortage',()=>{
 const lamp=new RearLight();
 const coast=state({throttle:0,electricKw:-60});
 lamp.update(coast);assert.equal(lamp.mode,'coasting');assert.equal(lamp.intensity,1);
 lamp.update({...coast,time:.25});assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
 const braking={...coast,time:.5,brake:.8};
 lamp.update(braking);assert.equal(lamp.mode,'braking');assert.equal(lamp.intensity,1);
 lamp.update({...braking,time:.625});assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
 lamp.update(state({time:.7}));assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
 lamp.update(state({time:.8,energyRatio:.02}));assert.equal(lamp.mode,'low-energy');assert.equal(lamp.frontIntensity,0);
 lamp.update(state({time:.9,brake:1,energyRatio:1,electricKw:0}));assert.equal(lamp.mode,'braking');assert.equal(lamp.frontIntensity,0);
 lamp.update(state({time:1,throttle:0,electricKw:0}));assert.equal(lamp.mode,'off');
});
test('lamp reset clears both outputs and frozen time cannot drift the flashing phase',()=>{
 const lamp=new RearLight(),s=state({flying:false});
 lamp.update(s);lamp.update({...s,time:.25});
 for(let i=0;i<30;i++){lamp.update({...s,time:.25});assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);}
 lamp.reset();assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
 lamp.update({...s,time:0});assert.equal(lamp.intensity,1);assert.equal(lamp.frontIntensity,1);
 lamp.update(state({time:.2,running:false}));assert.equal(lamp.intensity,0);assert.equal(lamp.frontIntensity,0);
});

test('wheel display follows live energy, lap time, delta, tyres and exact rpm at 20 Hz',()=>{
 const fields:string[]=[];
 const ctx={fillRect(){},fillText(text:string){fields.push(text);}};
 const tyres=Object.fromEntries(['FL','FR','RL','RR'].map((k,i)=>[k,{temperature:90+i,pressure:160+i,degradation:.1+i*.01}]));
 const cruise={gearbox:{rpm:10887,index:6,energy:3250000,electricKw:-55},speed:70,energyEnabled:true,wearEnabled:true,currentDelta:-.245,aeroZone:1,elapsed:76.234,flying:true,invalidLap:false,status:'running',lastLap:false,timed:true,dynamics:{tyres}};
 const display:any={wheelLCD:{image:{getContext:()=>ctx},needsUpdate:false},wheelRPM:{value:0},lcdTime:-1000,lastLCD:'',cruise};
 const update=(Inspector.prototype as any).updateWheelLCD;
 update.call(display);
 for(const value of ['252','10887','7','ERS 65%','回收','直道模式','-0.24','1:16.2','90°','磨损 10.0%'])assert.ok(fields.includes(value),value);
 assert.equal(display.wheelRPM.value,10887);
 const count=fields.length;cruise.gearbox.rpm=10901;update.call(display);
 assert.equal(fields.length,count,'texture update is throttled');assert.equal(display.wheelRPM.value,10901,'shift LED rpm remains frame responsive');
 display.lcdTime=-1000;cruise.gearbox.electricKw=120;cruise.aeroZone=0;update.call(display);assert.ok(fields.includes('释放'));assert.ok(fields.includes('基础模式'));
 display.lcdTime=-1000;cruise.gearbox.electricKw=0;cruise.wearEnabled=false;cruise.energyEnabled=false;update.call(display);assert.ok(fields.includes('关闭'));assert.ok(fields.includes('ERS 100%'));assert.ok(fields.includes('磨损 0.0%'));
 fields.length=0;display.lcdTime=-1000;
 update.call(display,{speed:0,rpm:5000,gear:0,t:12.4,telemetry:{energy:.4,electricKw:-12,aeroZone:0,delta:.32,tyres:{FL:{temperature:105,pressure:180,wear:8}}}});
 assert.ok(fields.includes('N'));assert.ok(fields.includes('ERS 40%'));assert.ok(fields.includes('0:12.4'));assert.ok(fields.includes('105°'));
});
