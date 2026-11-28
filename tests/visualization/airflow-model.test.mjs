import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
const built=await build({stdin:{contents:`export {distanceBoundary} from './src/scene/airflow/DistanceBoundary';export {createFlowSolver} from './src/scene/airflow/FlowSolver';export {bodyClearance} from './src/scene/airflow/FlowClearance';export {steps,seeds,ribbonVertices} from './src/scene/airflow/FlowLayout';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const code=built.outputFiles[0].text.replaceAll('from "three"',`from "${new URL('../../node_modules/three/build/three.module.js',import.meta.url)}"`);
const {distanceBoundary,createFlowSolver,bodyClearance,steps,seeds,ribbonVertices}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/vehicles/rb22/model.glb');
const rig=JSON.parse(readFileSync('vehicles/rb22/rig/wheels.json','utf8')).wheels;
const chassis=new T.Group();chassis.position.y=.30;
const poses=[],axes=[],shapes=[];
for(const n of doc.getRoot().listNodes()){
 if(!n.getMesh())continue;
 if(rig[n.getName()])continue;
 const group=new T.Group();group.name=n.getName();group.position.y=-.30;chassis.add(group);
 for(const p of n.getMesh().listPrimitives()){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()),3));g.setIndex(Array.from(p.getIndices().getArray()));group.add(new T.Mesh(g,new T.MeshBasicMaterial()));
 }
}
for(const name of ['FL','FR','RL','RR']){
 const node=doc.getRoot().listNodes().find(n=>n.getName()===name),wheel=rig[name];
 const centre=new T.Vector3().fromArray(node.getTranslation()).add(new T.Vector3().fromArray(wheel.center));poses.push([...centre.toArray(),0]);axes.push(wheel.axis);
 let lo=Infinity,hi=-Infinity;const axis=new T.Vector3().fromArray(wheel.axis),p=new T.Vector3();
 for(const primitive of node.getMesh().listPrimitives()){
  const vertices=primitive.getAttribute('POSITION').getArray();for(let i=0;i<vertices.length;i+=3){const d=p.fromArray(vertices,i).dot(axis);lo=Math.min(lo,d);hi=Math.max(hi,d);}
 }
 shapes.push([wheel.radius,(hi-lo)/2]);
}
chassis.updateMatrixWorld(true);const clearance=bodyClearance(chassis).image.data;
const bytes=readFileSync('public/vehicles/rb22/airflow-boundary.bin'),sdf=new Int16Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const solve=createFlowSolver([],shapes,clearance,sdf),count=seeds.length*(steps+1)*ribbonVertices;
const buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
const state={speed:60,opening:0,beta:0,yawRate:0,time:0,steer:0,frontGap:.03,rearGap:.04,poses,axes,matrices:[],toChassis:chassis.matrixWorld.clone().invert().toArray()};
test('real RB22 smoke paths remain smooth at tyres and below the nose/floor transition',()=>{
 const p=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),u=new T.Vector3(),v=new T.Vector3();let maxTurn=0,location;
 for(const beta of [0,.08,-.08]){
  solve({...state,beta},buffers);
  for(let j=0;j<seeds.length;j++)for(let i=1;i<steps;i++){
   const k=(j*(steps+1)+i)*ribbonVertices*3;
   p.fromArray(buffers.positions,k);a.fromArray(buffers.positions,k-3*ribbonVertices);b.fromArray(buffers.positions,k+3*ribbonVertices);
   assert.ok(Number.isFinite(p.x+p.y+p.z));
   if(p.z>2.9||p.z< -2.7)continue;
   const turn=u.copy(p).sub(a).angleTo(v.copy(b).sub(p));if(turn>maxTurn){maxTurn=turn;location={j,i,beta,p:p.toArray()};}
   if(seeds[j][1]<.1&&p.z>-.8&&p.z<2.8)assert.ok(p.y<.045,`underfloor must not rise into the nose: ${p.y}`);
  }
 }
 assert.ok(maxTurn<.30,`RB22 segment turn ${maxTurn}: ${JSON.stringify(location)}`);
});

test('baked collision skin matches first-hit outer surfaces of the rendered RB22',()=>{
 const boundary=distanceBoundary(sdf);boundary.sync(state);const ray=new T.Raycaster();let maximum=0,samples=0;
 for(const side of [-1,1])for(let z=-2.5;z<2.8;z+=.17)for(const y of [.05,.16,.35,.55,.8,1.0]){
  ray.set(new T.Vector3(side*2,y,z),new T.Vector3(-side,0,0));
  const hit=ray.intersectObject(chassis,true)[0];if(!hit)continue;
  const distance=boundary.distanceAt(hit.point);maximum=Math.max(maximum,Math.abs(distance));samples++;
 }
 assert.ok(samples>100);assert.ok(maximum<.05,`outer collision skin error ${maximum} m`);
});
