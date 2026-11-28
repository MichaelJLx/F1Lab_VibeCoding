import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {pressureMap} from '../../src/scene/pressure/PressureMap';
import {flowBoundary} from '../../src/scene/airflow/FlowBoundary';
import {createFlowSolver} from '../../src/scene/airflow/FlowSolver';
import {Gearbox} from '../../src/simulation/vehicle/Gearbox';
import {LateralDynamics} from '../../src/simulation/vehicle/LateralDynamics';
import {steps,seeds,ribbonVertices} from '../../src/scene/airflow/FlowLayout';
import {CircuitTrack} from '../../src/tracks/CircuitTrack';
import {circuitData} from '../../src/tracks/CircuitRegistry';
const circuit=circuitData('be-1925');
import {RibbonFrame} from '../../src/scene/airflow/RibbonFrame';

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
     const halfWidth=buffers.frames[(j*(steps+1)+k)*ribbonVertices*4+3];
     assert.ok(Math.abs(x)+halfWidth<.6,'full smoke ribbon stays inside floor edge');
     assert.ok(Math.abs(x)>.14,'plank remains between channels');
     assert.ok(y>.0109&&y<bottom-.004,'road-to-floor clearance');
   }
 }
});


test('confined smoke responds to local incidence and evolves continuously without random reseeding',()=>{
 const count=seeds.length*(steps+1)*ribbonVertices;
 const buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
 const solve=createFlowSolver([],Array.from({length:4},()=>[.35,.18]));
 const state={speed:70,opening:0,beta:0,yawRate:0,time:0,frontGap:.03,rearGap:.045,steer:0,poses:[[-.77,.35,1.69,0],[.77,.35,1.69,0],[-.77,.35,-1.69,0],[.77,.35,-1.69,0]],axes:Array.from({length:4},()=>[1,0,0]),matrices:[]};
 solve(state,buffers);const straight=buffers.positions.slice(),ratios=buffers.ratios.slice();
 const probes=seeds.map((seed,j)=>({seed,j})).filter(({seed})=>seed[1]<.1);
 const station=Math.round(steps*.4);
 state.beta=.10;state.yawRate=.4;solve(state,buffers);
 let movement=0,speedChange=0;
 for(const {j} of probes){const k=(j*(steps+1)+station)*ribbonVertices;movement+=Math.abs(buffers.positions[k*3]-straight[k*3]);speedChange+=Math.abs(buffers.ratios[k]-ratios[k]);}
 assert.ok(movement/probes.length>.01,'floor flow must respond to incidence before the diffuser');
 assert.ok(speedChange/probes.length>.01,'pressure imbalance must change channel speed');
 state.beta=0;solve(state,buffers);
 assert.ok(probes.some(({j})=>{const k=(j*(steps+1)+station)*ribbonVertices*3;return Math.abs(buffers.positions[k]-straight[k])>.001;}),'yaw rate matters even without sideslip');
 const before=buffers.positions.slice();state.time=1/60;solve(state,buffers);
 let motion=0;
 for(const {j} of probes)for(let i=0;i<=steps;i++){
   const k=(j*(steps+1)+i)*ribbonVertices*3;
   for(let axis=0;axis<3;axis++)motion=Math.max(motion,Math.abs(buffers.positions[k+axis]-before[k+axis]));
 }
 assert.ok(motion>0&&motion<.003,`continuous smoke evolution: ${motion} m`);
 const repeated=buffers.positions.slice();solve(state,buffers);assert.deepEqual(buffers.positions,repeated);
 const widths=probes.map(({j})=>buffers.frames[((j*(steps+1)+station)*ribbonVertices)*4+3]);
 assert.ok(Math.max(...widths)>.05,'smoke has a visible cross section');
 assert.ok(Math.max(...widths)-Math.min(...widths)>.008,'plumes do not share identical widths');
});

test('baked RB22 boundary follows chassis pose and active wings without triangle traversal',async()=>{
 const {readFileSync}=await import('node:fs');
 const {distanceBoundary}=await import('../../src/scene/airflow/DistanceBoundary');
 const layout=(await import('../../vehicles/rb22/rig/airflow-boundary.json')).default;
 const raw=readFileSync('public/vehicles/rb22/airflow-boundary.bin');
 const distance=new Int16Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
 assert.equal(distance.length,layout.volumes.reduce((n,v)=>n+v.length,0));
 assert.equal(layout.volumes.length,5);
 const boundary=distanceBoundary(distance);
 const state={speed:70,opening:0,beta:0,frontGap:.03,rearGap:.04,steer:0,poses:[],axes:[],matrices:[]};
 boundary.sync(state);
 const samples:Array<{p:T.Vector3;v:T.Vector3}> = [];
 for(let z=-2.6;z<2.6;z+=.13)for(let x=-.75;x<=.75;x+=.15){
  const p=new T.Vector3(x+.0013,.3517,z+.0031),v=new T.Vector3(0,0,-1);boundary.repel(p,v);samples.push({p,v});
 }
 const pose=new T.Matrix4().makeRotationZ(.04);pose.setPosition(.02,.32,0);
 const toChassis=pose.clone().invert();
 const modelToCar=pose.clone().multiply(new T.Matrix4().makeTranslation(0,-.30,0));
 boundary.sync({...state,toChassis:toChassis.toArray()});let i=0;
 for(let z=-2.6;z<2.6;z+=.13)for(let x=-.75;x<=.75;x+=.15){
  const p=new T.Vector3(x+.0013,.3517,z+.0031).applyMatrix4(modelToCar),v=new T.Vector3(0,0,-1).transformDirection(modelToCar);
  boundary.repel(p,v);
  assert.ok(p.distanceTo(samples[i].p.clone().applyMatrix4(modelToCar))<1e-8);
  assert.ok(v.distanceTo(samples[i].v.clone().applyMatrix3(new T.Matrix3().setFromMatrix4(modelToCar)))<1e-8);i++;
 }
 const response=(opening:number)=>{
  boundary.sync({...state,opening});const result:number[]=[];
  for(let z=-2.6;z< -2.1;z+=.03)for(let y=.8;y<1.2;y+=.03){const p=new T.Vector3(.2,y,z),v=new T.Vector3(0,0,-1);boundary.repel(p,v);result.push(v.x,v.y,v.z);}
  return result;
 };
 const closed=response(0),open=response(1);
 assert.ok(open.some((v,i)=>Math.abs(v-closed[i])>.08),'moving flaps must move the pressure boundary');
});
