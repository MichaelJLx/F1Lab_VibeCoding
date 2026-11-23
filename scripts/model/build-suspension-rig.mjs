// Recover linkage islands from the welded carbon geometry of the prepared asset.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {Vector3, Ray} from 'three';
import {writeFile} from 'node:fs/promises';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/rb22.glb');
const probes=[],links=[];
for(const mesh of doc.getRoot().listMeshes()){
 const group=mesh.getName();
 if(group!=='floor' && group!=='body')continue;
 for(const [primitive,p] of mesh.listPrimitives().entries()){
   const attr=p.getAttribute('POSITION'),indices=p.getIndices().getArray();
   const vertices=Array.from({length:attr.getCount()},(_,i)=>new Vector3().fromArray(attr.getElement(i,[])));
   if(group==='floor'){
     for(const z of [-1.25,-.6,0,.6,1.25])for(const x of [-.09,.09]){
       const ray=new Ray(new Vector3(x,-1,z),new Vector3(0,1,0)),hit=new Vector3();
       let y=Infinity;
       for(let i=0;i<indices.length;i+=3){
         if(ray.intersectTriangle(vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]],false,hit))y=Math.min(y,hit.y);
       }
       if(Number.isFinite(y)){
         const old=probes.find(v=>v[0]===x && v[2]===z);
         if(old)old[1]=Math.min(old[1],y);else probes.push([x,y,z]);
       }
     }
   }
   const carbon=p.getMaterial().getName().includes('carbon');
   const parents=vertices.map((_,i)=>i),weld=new Map();
   const root=i=>parents[i]===i?i:(parents[i]=root(parents[i]));
   vertices.forEach((v,i)=>{const key=v.toArray().join(',');if(weld.has(key))parents[i]=weld.get(key);else weld.set(key,i);});
   for(let i=0;i<indices.length;i+=3){const a=root(indices[i]);parents[root(indices[i+1])]=a;parents[root(indices[i+2])]=a;}
   const parts=new Map();
   vertices.forEach((_,i)=>{const k=root(i);if(!parts.has(k))parts.set(k,[]);parts.get(k).push(i);});
   for(const island of parts.values())for(const side of [-1,1]){
     const ids=island.filter(i=>vertices[i].x*side>0);
     if(!ids.length)continue;
     const points=ids.map(i=>vertices[i]),xs=points.map(v=>Math.abs(v.x)),inner=Math.min(...xs),outer=Math.max(...xs);
     const z=points.reduce((a,v)=>a+v.z,0)/points.length;
     const upright=inner>.45 && outer>.53 && points.every(v=>Math.abs(Math.abs(v.z)-1.693)<.34 && v.y<.72);
     if(!upright && (!carbon || points.some(v=>Math.abs(v.z)<.8 || v.y>.74) || inner>.49 || outer<.52 || outer>.79 || outer-inner<.24 || Math.abs(z)<1.15 || Math.abs(z)>1.94))continue;
     const ranges=[];
     for(const i of ids){const last=ranges.at(-1);if(last && last[1]+1===i)last[1]=i;else ranges.push([i,i]);}
     links.push({group,primitive,upright,corner:(z>0?'F':'R')+(points[0].x>0?'L':'R'),inner,outer,ranges});
   }
 }
}
console.log('Probes',probes,'links',links.map(l=>l.corner));
await writeFile('src/model/suspension-rig.json',JSON.stringify({probes,links})+'\n');
