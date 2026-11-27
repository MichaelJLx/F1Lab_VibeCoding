import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import {RearLight,type RearLightState} from '../src/model/RearLight';
import {Inspector,defaultView} from '../src/model/Inspector';
import {CircuitSession} from '../src/tracks/CircuitSession';
import {circuitData} from '../src/tracks/CircuitRegistry';
import {Gearbox} from '../src/motion/Gearbox';
const state=(patch:Partial<RearLightState>={}):RearLightState=>({time:0,running:true,consumption:true,pitLimited:false,speed:40,electricKw:60,energyRatio:.8,deploymentAllowed:true,...patch});
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
test('warning uses accepted recovery power, not brake pedal or battery-full clipping',()=>{
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
