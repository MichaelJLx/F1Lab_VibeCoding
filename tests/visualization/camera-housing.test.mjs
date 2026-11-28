import {build} from 'esbuild';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';
import assert from 'node:assert/strict';
import test from 'node:test';
// Keep Three shared with the test to preserve instanceof across the binding.
const built=await build({entryPoints:['src/scene/vehicle/CameraHousing.ts'],bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const code=built.outputFiles[0].text.replaceAll('from "three"',`from "${new URL('../../node_modules/three/build/three.module.js',import.meta.url)}"`);
const {bindCameraHousing}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('real RB22 camera extraction preserves all triangles and anchors lens ahead of housing',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/vehicles/rb22/model.glb');
 const chassis=new T.Group();let original=0;
 for(const node of doc.getRoot().listNodes()){
  if(node.getName()!=='cockpit')continue;
  const group=new T.Group();group.position.y=-.3;chassis.add(group);
  for(const p of node.getMesh().listPrimitives()){
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(p.getAttribute('POSITION').getArray()),3));
   g.setIndex(Array.from(p.getIndices().getArray()));original+=g.index.count;
   group.add(new T.Mesh(g,new T.MeshStandardMaterial()));
  }
 }
 const originals=new Set();chassis.traverse(n=>{if(n instanceof T.Mesh)originals.add(n.material);});
 const rig=bindCameraHousing(chassis);assert.ok(rig.meshes.length>=3);
 let total=0;chassis.traverse(n=>{if(n instanceof T.Mesh)total+=n.geometry.index.count;});assert.equal(total,original);
 const bounds=new T.Box3();for(const m of rig.meshes)bounds.union(new T.Box3().setFromObject(m));
 assert.ok(rig.lens.z>bounds.max.z);assert.ok(rig.lens.z-bounds.max.z<.02);
 assert.ok(rig.lens.y>=bounds.min.y&&rig.lens.y<=bounds.max.y);
 assert.ok(rig.lens.y<.9,'lens is no longer floating above the pod');
 for(const m of rig.meshes){assert.ok(originals.has(m.material),'housing retains the original GLB material and texture');}
 rig.setVisible(false);assert.ok(rig.meshes.every(m=>!m.visible));rig.setVisible(true);assert.ok(rig.meshes.every(m=>m.visible));
});
