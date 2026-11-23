import * as T from 'three';
import rig from './suspension-rig.json';

type Hub={pivot:T.Group,base:T.Vector3};
// Bind original carbon linkage vertices between chassis and upright.
// Mesh coordinates are baked in the prepared car's rest frame.
export function bindSuspensionLinks(chassis:T.Group,wheels:Record<string,Hub>){
 const buffers=new Map<T.BufferGeometry,T.BufferAttribute>();
 const links=rig.links.map(link=>{
   const group=chassis.getObjectByName(link.group);
   const mesh=group?.children[link.primitive] as T.Mesh;
   if(!mesh?.isMesh)throw new Error('Suspension rig does not match '+link.group);
   let pos=buffers.get(mesh.geometry);
   if(!pos){
     const source=mesh.geometry.getAttribute('position'),array=new Float32Array(source.count*3);
     for(let i=0;i<source.count;i++){
       array[i*3]=source.getX(i);array[i*3+1]=source.getY(i);array[i*3+2]=source.getZ(i);
     }
     pos=new T.BufferAttribute(array,3).setUsage(T.DynamicDrawUsage);
     mesh.geometry.setAttribute('position',pos);buffers.set(mesh.geometry,pos);
   }
   const vertices=link.ranges.flatMap(([start,end])=>Array.from({length:end-start+1},(_,i)=>i+start));
   const rest=vertices.map(i=>new T.Vector3().fromBufferAttribute(pos,i));
   const weights=rest.map(v=>link.upright?1:T.MathUtils.clamp((Math.abs(v.x)-link.inner)/(link.outer-link.inner),0,1));
   return {mesh,pos,vertices,rest,weights,ranges:link.ranges,last:new T.Matrix4().multiplyScalar(0),wheel:wheels[link.corner]};
 });
 const matrix=new T.Matrix4(),offset=new T.Matrix4(),v=new T.Vector3();
 return ()=>{
   for(const {mesh,pos,vertices,rest,weights,wheel,ranges,last} of links){
     mesh.updateWorldMatrix(true,false);wheel.pivot.updateWorldMatrix(true,false);
     offset.makeTranslation(-wheel.base.x,-wheel.base.y,-wheel.base.z);
     matrix.copy(mesh.matrixWorld).invert().multiply(wheel.pivot.matrixWorld).multiply(offset);
     if(matrix.elements.every((value,i)=>Math.abs(value-last.elements[i])<1e-6))continue;
     last.copy(matrix);
     for(let n=0;n<vertices.length;n++){
       v.copy(rest[n]).applyMatrix4(matrix).lerp(rest[n],1-weights[n]);
       pos.setXYZ(vertices[n],v.x,v.y,v.z);
     }
     for(const [start,end] of ranges)pos.addUpdateRange(start*3,(end-start+1)*3);
     pos.needsUpdate=true;
   }
 };
}
