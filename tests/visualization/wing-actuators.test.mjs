import {build} from 'esbuild';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';

const built=await build({entryPoints:['src/scene/vehicle/ActiveWings.ts'],bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const code=built.outputFiles[0].text.replaceAll('from "three"',`from "${new URL('../../node_modules/three/build/three.module.js',import.meta.url)}"`);
const {splitFlap,setFlap}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/vehicles/rb22/model.glb');
function fixture(name){
 const node=doc.getRoot().listNodes().find(n=>n.getName()===name),root=new T.Group(),source=[];
 for(const [i,p] of node.getMesh().listPrimitives().entries()){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()),3));
  g.setIndex(Array.from(p.getIndices().getArray()));source.push(g.index.array.slice());
  const material=new T.MeshStandardMaterial();material.name=String(i);root.add(new T.Mesh(g,material));
 }
 const assembly=splitFlap(root,name==='front-wing');
 function owner(primitive,triangle){
  const ids=source[primitive].slice(triangle*3,triangle*3+3);let result;
  root.traverse(mesh=>{
   if(!(mesh instanceof T.Mesh)||mesh.material.name!==String(primitive))return;
   const ix=mesh.geometry.index.array;
   for(let i=0;i<ix.length;i+=3)if(ids.every((v,k)=>v===ix[i+k])){assert.ok(!result,'triangle duplicated');result=mesh;}
  });
  assert.ok(result,'triangle lost');return result;
 }
 return {root,source,assembly,links:assembly.userData.links,owner};
}
function atSocket(point,hinge){return hinge?point.clone().sub(hinge.position).applyQuaternion(hinge.quaternion).add(hinge.position):point.clone();}

test('complete RB22 wing triangles and material islands survive splitting and return to the source pose',()=>{
 for(const name of ['front-wing','rear-wing']){
  const {root,source,assembly}=fixture(name);
  const expected=source.map(ids=>{
   const entries=[];for(let i=0;i<ids.length;i+=3)entries.push(Array.from(ids.slice(i,i+3)).join(','));return entries.sort();
  });
  const actual=source.map(()=>[]);
  root.traverse(mesh=>{if(mesh instanceof T.Mesh){const ids=mesh.geometry.index.array;for(let i=0;i<ids.length;i+=3)actual[+mesh.material.name].push(Array.from(ids.slice(i,i+3)).join(','));}});
  assert.deepEqual(actual.map(a=>a.sort()),expected,'every source triangle has exactly one owner');
  setFlap(assembly,1);setFlap(assembly,0);
  root.position.set(2,-.3,4);root.rotation.y=.4;root.updateMatrixWorld(true);
  const inverse=root.matrixWorld.clone().invert();
  root.traverse(mesh=>{if(mesh instanceof T.Mesh){
   const local=new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
   assert.ok(local.elements.every((v,i)=>Math.abs(v-new T.Matrix4().elements[i])<1e-7),'closed parts retain their exact original placement');
  }});
 }
});

test('rear flap pack opens about one trailing axis without changing its internal slot or hanger length',()=>{
 const {assembly,links,owner}=fixture('rear-wing');
 assert.equal(assembly.children.length,2);
 assert.deepEqual(assembly.children[0].position,assembly.children[1].position);
 assert.deepEqual(assembly.children[0].userData.axis,new T.Vector3(1,0,0));
 // Actual carbon skins, mounting pads and their paint layers from the GLB.
 for(const [primitive,triangle,hinge] of [[2,11330,0],[2,10360,1],[0,222,0],[2,11904,0],[3,2942,0],[1,5350,1]]){
  assert.equal(owner(primitive,triangle).parent,assembly.children[hinge],'surface fitting must move with its supporting wing');
 }
 assert.equal(links[0].anchorHinge,assembly.children[0]);assert.equal(links[0].hinge,assembly.children[0]);
 for(const blend of [0,.1,.25,.5,.75,1,.75,.5,.25,0]){
  setFlap(assembly,blend);
  assert.ok(assembly.children[0].quaternion.equals(assembly.children[1].quaternion));
  for(const link of links){
   const start=atSocket(link.anchor,link.anchorHinge),end=atSocket(link.attachment,link.hinge);
   for(const mesh of link.meshes){
    assert.ok(link.anchor.clone().applyMatrix4(mesh.matrix).distanceTo(start)<1e-8);
    assert.ok(link.attachment.clone().applyMatrix4(mesh.matrix).distanceTo(end)<1e-8);
    assert.ok(mesh.matrix.elements.every(Number.isFinite));
   }
  }
  if(blend===1){
   const leading=new T.Vector3(0,.85,-2.17),trailing=new T.Vector3(0,.963,-2.315);
   const openedLeading=atSocket(leading,assembly.children[0]);
   assert.ok(openedLeading.y-leading.y>.07,'raise the leading edge to open the mainplane slot');
   assert.ok(atSocket(trailing,assembly.children[1]).distanceTo(trailing)<.003,'trailing edge stays near the hinge');
   assert.ok(Math.abs(atSocket(trailing,assembly.children[1]).y-openedLeading.y)<.025,'open pack presents a shallow frontal profile');
   assert.ok(atSocket(links[0].anchor,links[0].anchorHinge).distanceTo(links[0].anchor)>.005);
   assert.ok(atSocket(links[0].attachment,links[0].hinge).distanceTo(links[0].attachment)>.005);
  }
 }
});

test('front primary flap packs include both rear profiles, rigid hangers and complete nose actuators',()=>{
 const {assembly,links,owner}=fixture('front-wing');assert.equal(links.length,8);
 // These lower collars and covers were previously left behind by the narrow rod selector.
 const sets=[[[0,4999],[0,5107],[0,5127],[0,5151],[0,5223],[2,3407]],[[0,5463],[0,5571],[0,5591],[0,5615],[0,5687],[2,3360]]];
 for(const [triangle,side] of [[11390,0],[10700,0],[10056,1],[9360,1]])assert.equal(owner(1,triangle).parent,assembly.children[side]);
 for(const [side,pieces] of sets.entries()){
  const link=links[side*4];
  for(const [primitive,triangle] of pieces)assert.ok(link.meshes.includes(owner(primitive,triangle)),'every collar and material island must belong to the complete adjuster');
 }
 for(const blend of [0,.2,.5,1,.4,0]){
  setFlap(assembly,blend);
  for(const link of links)for(const mesh of link.meshes){
   assert.ok(link.anchor.clone().applyMatrix4(mesh.matrix).distanceTo(atSocket(link.anchor,link.anchorHinge))<1e-8);
   assert.ok(link.attachment.clone().applyMatrix4(mesh.matrix).distanceTo(atSocket(link.attachment,link.hinge))<1e-8);
   assert.ok(mesh.matrix.equals(link.meshes[0].matrix),'multi-material pieces cannot separate');
   if(link.anchorHinge===link.hinge){
    const x=new T.Vector3().setFromMatrixColumn(mesh.matrix,0),y=new T.Vector3().setFromMatrixColumn(mesh.matrix,1),z=new T.Vector3().setFromMatrixColumn(mesh.matrix,2);
    assert.ok(Math.abs(x.length()-1)<1e-8&&Math.abs(y.length()-1)<1e-8&&Math.abs(z.length()-1)<1e-8,'inter-profile hangers remain rigid');
   }
  }
 }
});
