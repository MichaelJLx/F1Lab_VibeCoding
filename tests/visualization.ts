import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {pressureMap} from '../src/model/PressureMap';
import {flowBoundary} from '../src/model/FlowBoundary';
import {createFlowSolver} from '../src/model/FlowSolver';
import {Gearbox} from '../src/motion/Gearbox';
import {LateralDynamics} from '../src/motion/LateralDynamics';
import {steps,seeds,ribbonVertices} from '../src/model/FlowLayout';
import {CircuitTrack} from '../src/tracks/CircuitTrack';
import {circuitData} from '../src/tracks/CircuitRegistry';
const circuit=circuitData('be-1925');
import {RibbonFrame} from '../src/model/RibbonFrame';

test('parallel transport stays orthonormal without sign flips through vertical and inflection tangents',()=>{
 const frame=new RibbonFrame(),tangent=new T.Vector3(),previous=new T.Vector3();
 for(let i=0;i<=720;i++){
  const angle=i*Math.PI/180;
  tangent.set(Math.sin(angle),Math.cos(angle),.2*Math.sin(angle*2)).normalize();
  if(i===0)frame.reset(tangent);else frame.advance(tangent);
  assert.ok(Math.abs(frame.normal.length()-1)<1e-10);
  assert.ok(Math.abs(frame.normal.dot(tangent))<1e-10);
  if(i>0)assert.ok(frame.normal.dot(previous)>.999,'ribbon frame flipped');
  previous.copy(frame.normal);
 }
});

test('Cp exclusively colours body surfaces, hides decals and preserves complete wheel assemblies',()=>{
 const car=new T.Group(),wing=new T.Group();wing.name='front-wing';car.add(wing);
 const geometry=new T.BoxGeometry(1,.05,.4),texture=new T.Texture();
 const material=new T.MeshStandardMaterial({map:texture}),body=new T.Mesh(geometry,material);wing.add(body);
 const decal=new T.Mesh(geometry,new T.MeshStandardMaterial({transparent:true}));car.add(decal);
 const wheels=['FL','FR','RL','RR'].map(name=>{const group=new T.Group();group.name=name;car.add(group);const tyre=new T.Mesh(geometry,material),rim=new T.Mesh(geometry,material);group.add(tyre,rim);return [tyre,rim];}).flat();
 let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);
 const pressure=pressureMap(car);
 for(let i=0;i<3;i++){
  pressure.set(true);pressure.update(.4,.03,80,.025,.04);
  assert.notEqual(body.material,material);const override=body.material as unknown as T.ShaderMaterial;
  assert.equal(override.transparent,false);assert.equal(override.depthWrite,true);assert.equal(decal.visible,false);
  for(const wheel of wheels)assert.equal(wheel.material,material);
  pressure.set(false);assert.equal(body.material,material);assert.equal(body.material.map,texture);assert.equal(decal.visible,true);
 }
 pressure.dispose();assert.equal(disposed,false);
});

test('triangle boundaries move with component transforms and repel incoming flow',()=>{
 const root=new T.Group(),part=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial());root.add(part);
 const boundary=flowBoundary(root);
 for(const angle of [0,.48]){
   part.position.set(.25,.15,-.1);part.rotation.y=angle;boundary.sync(root);
   const point=new T.Vector3(.51,0,0).applyMatrix4(part.matrixWorld);
   const normal=new T.Vector3(1,0,0).transformDirection(part.matrixWorld),velocity=normal.clone().negate();
   boundary.repel(point,velocity);
   assert.ok(velocity.dot(normal)>-.01);assert.ok(point.clone().applyMatrix4(part.matrixWorld.clone().invert()).x>=.511);
 }
});

test('flow solves reuse buffers and respond to steering, yaw and wing opening',()=>{
 const count=seeds.length*(steps+1)*ribbonVertices;
 const buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
 const state={speed:85,opening:0,beta:0,frontGap:.025,rearGap:.04,steer:0,poses:[[-.77,.35,1.69,0],[.77,.35,1.69,0],[-.77,.35,-1.69,0],[.77,.35,-1.69,0]],axes:Array.from({length:4},()=>[1,0,0]),matrices:[]};
 const solve=createFlowSolver([],Array.from({length:4},()=>[.35,.18]));
 assert.equal(solve(state,buffers),buffers);
 for(const values of Object.values(buffers))assert.ok(values.every(Number.isFinite));
 const straight=buffers.positions.slice();
 state.beta=.06;state.steer=.1;state.opening=1;
 solve(state,buffers);
 assert.ok(buffers.positions.some((value,i)=>Math.abs(value-straight[i])>.01));
 for(const values of Object.values(buffers))assert.ok(values.every(Number.isFinite));
});

test('allocation-free road queries retain position and curvature results',()=>{
 // Geometry queries need no canvas or full road construction.
 const track=Object.assign(Object.create(CircuitTrack.prototype),{
   layout:circuit,length:circuit.geometryLength,spawn:new T.Vector3(14,2,7),startForward:new T.Vector3(.6,0,.8),startLeft:new T.Vector3(-.8,0,.6),
   sampleScratch:{a:new T.Vector3(),b:new T.Vector3(),p:new T.Vector3(),left:new T.Vector3()},curveScratch:[new T.Vector3(),new T.Vector3(),new T.Vector3()]
 }) as CircuitTrack;
 const original=(s:number,lateral=0)=>{
   const p=track.rawSample(s),f=track.rawSample(s+1).sub(track.rawSample(s-1));f.y=0;f.normalize();p.addScaledVector(new T.Vector3(-f.z,0,f.x),lateral);
   const node=circuit.nodes[Math.floor(track.wrap(s)/track.length*circuit.nodes.length)];
   p.y+=lateral*Math.tan((node.bankAngle??0)*Math.PI/180);p.sub(track.spawn);
   return new T.Vector3(p.dot(track.startLeft),p.y,p.dot(track.startForward));
 };
 const target=new T.Vector3();
 for(let s=-5;s<track.length+5;s+=47){
   for(const lateral of [-5,0,5])assert.ok(track.point(s,lateral,target).distanceTo(original(s,lateral))<1e-10);
   const a=original(s-6),b=original(s),c=original(s+6),u=b.clone().sub(a),v=c.clone().sub(b);
   const curvature=Math.atan2(v.x*u.z-v.z*u.x,u.x*v.x+u.z*v.z)/Math.max(.01,(Math.hypot(u.x,u.z)+Math.hypot(v.x,v.z))/2);
   assert.ok(Math.abs(track.curvature(s)-curvature)<1e-12);
 }
});

test('ERS accounts rear-wheel recovery and caps battery acceptance without free coast charging',()=>{
 const box=new Gearbox();box.consumption=true;box.energy=2e6;box.update(.01,70);
 box.account(70,20000,.1,20000);assert.ok(box.energy<2e6);assert.ok(box.electricKw>0);
 const deployed=box.energy;box.account(70,-12000,.1,-5000);assert.ok(box.energy>deployed);assert.ok(box.electricKw<0);
 box.throttle=1;const accelerating=box.energy;box.account(70,-1000,.1,-500);assert.equal(box.energy,accelerating);assert.equal(box.electricKw,0);box.throttle=0;
 box.energy=5e6;box.account(70,-12000,.1,-5000);assert.equal(box.energy,5e6);assert.equal(box.electricKw,0);
 box.energy=2e6;box.account(70,0,.1,0);assert.equal(box.energy,2e6);
 const dynamics=new LateralDynamics();const force=box.coastRecoveryForce(40);assert.ok(force>0);
 let speed=40;for(let i=0;i<100;i++){speed=dynamics.longitudinalStep(.005,speed,0,0,0,0,force);box.account(speed,dynamics.longitudinalForce,.005,dynamics.wheelFx.RL+dynamics.wheelFx.RR);}
 assert.ok(speed<40);assert.ok(box.energy>2e6);assert.ok(dynamics.wheelFx.RL+dynamics.wheelFx.RR<0);
 box.consumption=false;box.account(70,-12000,.1,-5000);assert.equal(box.energy,5e6);assert.equal(box.electricKw,0);assert.equal(box.coastRecoveryForce(40),0);
});

test('contact-patch streamlines remain outside steered tyres with continuous downstream tangents',()=>{
 const count=seeds.length*(steps+1)*ribbonVertices,buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
 const solve=createFlowSolver([],Array.from({length:4},()=>[.35,.18]));
 const p=new T.Vector3(),prev=new T.Vector3(),next=new T.Vector3(),u=new T.Vector3(),v=new T.Vector3(),d=new T.Vector3(),axis=new T.Vector3();
 let maxTurn=0,minClearance=Infinity,location:unknown;
 for(const steer of [-.35,0,.35]){
 const state={speed:85,opening:.5,beta:.08,frontGap:.025,rearGap:.04,steer,poses:[[-.77,.35,1.69,0],[.77,.35,1.69,0],[-.77,.35,-1.69,0],[.77,.35,-1.69,0]],axes:Array.from({length:4},(_,i)=>i<2?[Math.cos(steer),0,-Math.sin(steer)]:[1,0,0]),matrices:[]};
 solve(state,buffers);
 for(let j=0;j<seeds.length;j++)for(let i=1;i<steps;i++){
   const k=(j*(steps+1)+i)*3*ribbonVertices;p.fromArray(buffers.positions,k);prev.fromArray(buffers.positions,k-3*ribbonVertices);next.fromArray(buffers.positions,k+3*ribbonVertices);
   assert.ok(p.y>=(seeds[j][1]<.1?.0109:.0249));assert.ok(p.z<prev.z&&p.z>next.z);
   const turn=u.copy(p).sub(prev).angleTo(v.copy(next).sub(p));if(turn>maxTurn){maxTurn=turn;location={steer,j,i,prev:prev.toArray(),p:p.toArray(),next:next.toArray()};}
   for(let w=0;w<4;w++){
    d.set(p.x-state.poses[w][0],p.y-.35,p.z-state.poses[w][2]);axis.fromArray(state.axes[w]);const a=d.dot(axis),qa=Math.abs(a)-.18,qr=d.addScaledVector(axis,-a).length()-.35;
    minClearance=Math.min(minClearance,Math.hypot(Math.max(0,qa),Math.max(0,qr))+Math.min(0,Math.max(qa,qr)));
   }
 }
 }
 assert.ok(minClearance>.04,`minimum tyre clearance ${minClearance}`);
 assert.ok(maxTurn<.55,`maximum segment turn ${maxTurn}: ${JSON.stringify(location)}`);
});

test('underfloor probes remain between the road and underside and inside both floor edges',()=>{
 const clearance=new Float32Array(64*160*4);
 for(let row=0;row<160;row++)for(let col=0;col<64;col++){
   const i=4*(row*64+col),z=(row+.5)*6/160-3;
   clearance[i]=.045+.10*T.MathUtils.smoothstep(-z,1.4,2.7);clearance[i+1]=.2;
   clearance[i+2]=-.6;clearance[i+3]=.6;
 }
 const count=seeds.length*(steps+1)*ribbonVertices;
 const buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
 const solve=createFlowSolver([],Array.from({length:4},()=>[.35,.18]),clearance);
 for(const beta of [-.12,0,.12]){
   solve({speed:85,opening:.5,beta,frontGap:.025,rearGap:.04,steer:.2,poses:[[-.77,.35,1.69,0],[.77,.35,1.69,0],[-.77,.35,-1.69,0],[.77,.35,-1.69,0]],axes:Array.from({length:4},()=>[1,0,0]),matrices:[]},buffers);
   for(let j=0;j<seeds.length;j++)if(seeds[j][1]<.1)for(let k=0;k<=steps;k++){
     const i=3*(j*(steps+1)+k)*ribbonVertices,x=buffers.positions[i],y=buffers.positions[i+1],z=buffers.positions[i+2];
     if(z>2.25||z< -2.5)continue;
     const bottom=.045+.10*T.MathUtils.smoothstep(-z,1.4,2.7);
     assert.ok(Math.abs(x)+.023<.6,'ribbon stays inside floor edge');
     assert.ok(Math.abs(x)>.14,'plank remains between channels');
     assert.ok(y>.0109&&y<bottom-.004,'road-to-floor clearance');
   }
 }
});
