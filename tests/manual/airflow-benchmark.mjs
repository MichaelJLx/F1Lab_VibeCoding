import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';
const built=await build({stdin:{contents:`export {createFlowSolver} from './src/scene/airflow/FlowSolver';export {splitFlap} from './src/scene/vehicle/ActiveWings';export {bodyClearance} from './src/scene/airflow/FlowClearance';export {steps,seeds,ribbonVertices} from './src/scene/airflow/FlowLayout';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const code=built.outputFiles[0].text.replaceAll('from "three"',`from "${new URL('../../node_modules/three/build/three.module.js',import.meta.url)}"`);
const {createFlowSolver,splitFlap,bodyClearance,steps,seeds,ribbonVertices}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/vehicles/rb22/model.glb'),chassis=new T.Group(),car=new T.Group();car.add(chassis);
for(const n of doc.getRoot().listNodes()){
 if(!n.getMesh()||/^(FL|FR|RL|RR)$/.test(n.getName()))continue;
 const group=new T.Group();group.name=n.getName();chassis.add(group);
 for(const p of n.getMesh().listPrimitives()){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()),3));g.setIndex(Array.from(p.getIndices().getArray()));const m=new T.MeshStandardMaterial();m.transparent=p.getMaterial()?.getAlphaMode()==='BLEND';group.add(new T.Mesh(g,m));
 }
 if(/^(front|rear)-wing$/.test(n.getName()))splitFlap(group,n.getName()==='front-wing');
}
car.updateMatrixWorld(true);const parts=[];
chassis.traverse(o=>{if(o instanceof T.Mesh&&!o.material.transparent)parts.push({positions:o.geometry.getAttribute('position').array,indices:Uint32Array.from(o.geometry.index.array),matrix:o.matrixWorld.toArray()});});
const start=performance.now(),clearance=bodyClearance(chassis).image.data;
const solve=createFlowSolver(parts,Array.from({length:4},()=>[.35,.18]),clearance,new Int16Array(new Uint8Array(readFileSync('public/vehicles/rb22/airflow-boundary.bin')).buffer)),initMs=performance.now()-start;
const count=seeds.length*(steps+1)*ribbonVertices,buffers={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
const state={speed:60,opening:0,beta:0,yawRate:0,time:0,steer:0,frontGap:.03,rearGap:.04,poses:[[-.77,.35,1.69,0],[.77,.35,1.69,0],[-.77,.35,-1.69,0],[.77,.35,-1.69,0]],axes:Array.from({length:4},()=>[1,0,0]),matrices:parts.map(p=>p.matrix)};
const times=[];
for(let i=0;i<8;i++){const t=performance.now();solve(state,buffers);times.push(performance.now()-t);state.beta=.04;state.yawRate=.3;state.time+=.1;}
console.log(JSON.stringify({parts:parts.length,triangles:parts.reduce((s,p)=>s+p.indices.length/3,0),streams:seeds.length,vertices:count,initMs,solveMs:times},null,2));
