import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4,Vector3,Box3} from 'three';
import validator from 'gltf-validator';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const source=await io.read('vehicles/rb22/sources/rb22-community.glb');
const bytes=await readFile('public/vehicles/rb22/model.glb'),model=await io.readBinary(bytes);
const manifest=JSON.parse(await readFile('public/vehicles/rb22/manifest.json','utf8'));
const nodes=model.getRoot().listNodes();
function triangleCount(d){return d.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3,0),0);}
function bounds(d){const b=new Box3();for(const n of d.getRoot().listNodes()){if(!n.getMesh())continue;const m=new Matrix4().fromArray(n.getWorldMatrix());for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)b.expandByPoint(new Vector3().fromArray(a.getElement(i,[])).applyMatrix4(m));}}return b;}
test('Khronos glTF validator: no errors',async()=>{const r=await validator.validateBytes(bytes,{maxIssues:30});assert.equal(r.issues.numErrors,0,JSON.stringify(r.issues.messages));});
test('all original triangles retained across semantic split',()=>{assert.equal(triangleCount(source),triangleCount(model));assert.equal(triangleCount(model),manifest.triangles);});
test('embedded texture byte content unchanged',()=>{const hashes=d=>d.getRoot().listTextures().map(t=>createHash('sha256').update(t.getImage()).digest('hex')).sort();assert.deepEqual(hashes(model),hashes(source));});
test('output has no external binary or texture dependencies',()=>{const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok(json.buffers.every(b=>!b.uri));assert.ok(json.images.every(i=>i.bufferView!==undefined&&!i.uri));});
test('finite geometry, complete triangle indices, consistent UV and normals',()=>{for(const m of model.getRoot().listMeshes())for(const p of m.listPrimitives()){const pos=p.getAttribute('POSITION'),norm=p.getAttribute('NORMAL');assert.ok(norm);assert.equal(norm.getCount(),pos.getCount());assert.equal(p.getIndices().getCount()%3,0);for(const i of p.getIndices().getArray())assert.ok(i<pos.getCount());for(const sem of p.listSemantics()){const a=p.getAttribute(sem);assert.equal(a.getCount(),pos.getCount());assert.ok(a.getArray().every(Number.isFinite));}}});
test('width normalization is uniform and ground plane does not cut tyres',()=>{const a=bounds(source),b=bounds(model),s=manifest.scale;assert.ok(Math.abs(b.min.y)<1e-6);for(const axis of ['x','y','z'])assert.ok(Math.abs((b.max[axis]-b.min[axis])-(a.max[axis]-a.min[axis])*s)<1e-5);assert.ok(Math.abs(b.max.x-b.min.x-1.9)<1e-5);});
test('four independently pivoted wheel assemblies have local centered bounds',()=>{for(const key of ['FL','FR','RL','RR']){const n=nodes.find(n=>n.getName()===key);assert.ok(n?.getMesh());const b=new Box3();for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)b.expandByPoint(new Vector3().fromArray(a.getElement(i,[])));}assert.ok(b.getCenter(new Vector3()).length()<.03);assert.ok(b.getSize(new Vector3()).y>.6);assert.deepEqual(n.getTranslation(),manifest.pivots[key]);}});
test('floor inspection group contains nonzero 3D depth',()=>{const n=nodes.find(n=>n.getName()==='floor');assert.ok(n?.getMesh());const b=new Box3();for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)b.expandByPoint(new Vector3().fromArray(a.getElement(i,[])));}assert.ok(b.getSize(new Vector3()).y>.04);assert.ok(b.getSize(new Vector3()).z>2);});
test('provenance is attached and fidelity target is never reported as measured',()=>{assert.match(model.getRoot().getAsset().copyright,/Tyler_Dave.*CC BY 4.0/);assert.equal(manifest.fidelity.measured,null);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.outputSHA256);});
