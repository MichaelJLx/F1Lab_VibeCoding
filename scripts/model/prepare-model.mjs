import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Box3,Matrix4,Matrix3,Vector3} from 'three';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const input='data/models/rb22/rb22-community.glb';
const doc=await io.read(input),root=doc.getRoot(),oldNodes=root.listNodes(),oldMeshes=root.listMeshes(),oldAccessors=root.listAccessors(),oldScenes=root.listScenes();
const buffer=doc.createBuffer('RB22 geometry'),scene=doc.createScene('RB22 · community reconstruction');root.setDefaultScene(scene);
const groups=new Map(),bounds=new Box3(),source=[];let triangles=0;
for(const n of oldNodes){if(!n.getMesh())continue;const m=new Matrix4().fromArray(n.getWorldMatrix()),normal=new Matrix3().getNormalMatrix(m);
for(const p of n.getMesh().listPrimitives()){
 const attrs={};for(const semantic of p.listSemantics()){const a=p.getAttribute(semantic),size=a.getElementSize(),arr=new Float32Array(a.getCount()*size);for(let i=0;i<a.getCount();i++){const v=a.getElement(i,[]);if(semantic==='POSITION') {const t=new Vector3().fromArray(v).applyMatrix4(m);v.splice(0,3,...t.toArray());bounds.expandByPoint(t);}else if(semantic==='NORMAL') {const t=new Vector3().fromArray(v).applyMatrix3(normal).normalize();v.splice(0,3,...t.toArray());}else if(semantic==='TANGENT'){const t=new Vector3().fromArray(v).transformDirection(m);v.splice(0,3,...t.toArray());}arr.set(v,i*size);}attrs[semantic]={arr,size,type:a.getType()};}
 const idx=p.getIndices()?.getArray()??Uint32Array.from({length:attrs.POSITION.arr.length/3},(_,i)=>i);triangles+=idx.length/3;source.push({name:n.getName(),attrs,idx,material:p.getMaterial()});
}}
// Preserve source proportions; normalize width to a reference envelope, NOT a measured RB22 dimension.
const scale=1.9/(bounds.max.x-bounds.min.x),cx=(bounds.min.x+bounds.max.x)/2,ground=bounds.min.y;
const tyreBounds={};
for(const s of source)if(s.material.getName().startsWith('sidewall'))for(let i=0;i<s.attrs.POSITION.arr.length;i+=3){const a=s.attrs.POSITION.arr,x=(a[i]-cx)*scale,y=(a[i+1]-ground)*scale,z=a[i+2]*scale;const key=(z>0?'F':'R')+(x>0?'L':'R');(tyreBounds[key]??=new Box3()).expandByPoint(new Vector3(x,y,z));}
const pivots=Object.fromEntries(Object.entries(tyreBounds).map(([k,b])=>[k,b.getCenter(new Vector3()).toArray()]));
const getGroup=(key)=>{if(!groups.has(key)){const node=doc.createNode(key);node.setExtras({part:key,confidence:'public-reconstruction'});if(pivots[key])node.setTranslation(pivots[key]);node.setMesh(doc.createMesh(key));scene.addChild(node);groups.set(key,node);}return groups.get(key);};
for(const s of source){const pos=s.attrs.POSITION.arr;for(let i=0;i<pos.length;i+=3){pos[i]=(pos[i]-cx)*scale;pos[i+1]=(pos[i+1]-ground)*scale;pos[i+2]*=scale;}
 const buckets=new Map(),isWheel=/^(sidewall|discs|redbull_wheel_hub)/.test(s.material.getName());
 for(let i=0;i<s.idx.length;i+=3){const ids=[s.idx[i],s.idx[i+1],s.idx[i+2]],c=[0,0,0];for(const id of ids)for(let k=0;k<3;k++)c[k]+=pos[id*3+k]/3;
 let key=isWheel?(c[2]>0?'F':'R')+(c[0]>0?'L':'R'):c[2]>2.08?'front-wing':c[2]<-1.92?'rear-wing':c[1]<0.19?'floor':c[1]>0.51&&c[2]>-0.4&&c[2]<0.95?'cockpit':'body';
 if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(...ids);
 }
 for(const [key,indices] of buckets){const node=getGroup(key),pivot=pivots[key]??[0,0,0],remap=new Map(),old=[],newIdx=[];for(const id of indices){if(!remap.has(id)){remap.set(id,old.length);old.push(id);}newIdx.push(remap.get(id));}
 const p=doc.createPrimitive().setMaterial(s.material).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(newIdx)).setBuffer(buffer));
 for(const [sem,a] of Object.entries(s.attrs)){const arr=new Float32Array(old.length*a.size);for(let j=0;j<old.length;j++)for(let k=0;k<a.size;k++)arr[j*a.size+k]=a.arr[old[j]*a.size+k]-(sem==='POSITION'?pivot[k]:0);p.setAttribute(sem,doc.createAccessor().setType(a.type).setArray(arr).setBuffer(buffer));}node.getMesh().addPrimitive(p);
 }}
for(const n of oldNodes)n.dispose();for(const m of oldMeshes)m.dispose();for(const a of oldAccessors)a.dispose();for(const s of oldScenes)s.dispose();
for(const e of root.listExtensionsUsed())if(['EXT_meshopt_compression','KHR_mesh_quantization'].includes(e.extensionName))e.dispose();
const attribution='2026 Redbull RB22 by Dave Love SketchFab / Tyler_Dave, CC BY 4.0. Via AgentiLoop/F1 (detail texture modified upstream). F1Lab: transforms baked, uniform reference scaling, wheel pivots and illustrative inspection groups; original livery retained.';
root.getAsset().copyright=attribution;
for(const b of root.listBuffers())if(b!==buffer)b.dispose();
const output = 'public/models/rb22.glb';
await mkdir('public/models', {recursive: true});
await io.write(output, doc);
const report={model:'2026 Redbull RB22',author:'Dave Love SketchFab / Tyler_Dave',license:'CC BY 4.0',licenseURL:'https://creativecommons.org/licenses/by/4.0/',source:'https://sketchfab.com/3d-models/2026-redbull-rb22-0a3d24a58e0549d591a5a48c22eec383',mirror:'https://github.com/AgentiLoop/F1/blob/main/models/rb22.glb',sourceSHA256:createHash('sha256').update(await readFile(input)).digest('hex'),outputSHA256:createHash('sha256').update(await readFile(output)).digest('hex'),triangles,materials:root.listMaterials().length,textures:root.listTextures().length,groups:[...groups.keys()],pivots,scale,dimensions:{width:1.9,length:(bounds.max.z-bounds.min.z)*scale,height:(bounds.max.y-bounds.min.y)*scale,wheelbase:Math.abs(pivots.FL[2]-pivots.RL[2])},coordinateSystem:'metres; +Y up, +Z forward, +X driver left; y=0 tyre bottom',geometrySplit:'triangle centroid inspection regions; not factory component seams; wheel-only source materials split per corner',fidelity:{target:'95% ±3% visual target',measured:null,reason:'No factory CAD, point cloud or calibrated multi-view references. Target is not a measured result.'},limits:['Exact race/upgrade specification is unspecified by asset author.','Scale is uniform normalization to a 1.90 m reference width, not measured RB22 size.','Source bottom surfaces are retained; hidden internal structures are not reconstructed.','No FIA full geometry compliance claim.','Wheel rotation and steering are inspection demonstrations, not vehicle dynamics.']};
await writeFile('public/models/manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
