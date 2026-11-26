import * as T from 'three';
import rig from './suspension-rig.json';
type Hub={pivot:T.Group,base:T.Vector3};

// Each branch pivots at its inboard mount. The upright end follows the same
// hub transform as the wheel, including steering; normals follow the arm frame.
export function bindSuspensionLinks(chassis:T.Group,wheels:Record<string,Hub>){
 const buffers=new Map<T.BufferGeometry,{pos:T.BufferAttribute,normal:T.BufferAttribute}>();
 const links=rig.links.map(link=>{
   const mesh=chassis.getObjectByName(link.group)?.children[link.primitive] as T.Mesh;
   if(!mesh?.isMesh)throw new Error('Suspension rig does not match '+link.group);
   let attributes=buffers.get(mesh.geometry);
   if(!attributes){
     const clone=(name:string)=>{const source=mesh.geometry.getAttribute(name),array=new Float32Array(source.count*3);for(let i=0;i<source.count;i++){array[i*3]=source.getX(i);array[i*3+1]=source.getY(i);array[i*3+2]=source.getZ(i);}const result=new T.BufferAttribute(array,3).setUsage(T.DynamicDrawUsage);mesh.geometry.setAttribute(name,result);return result;};
     attributes={pos:clone('position'),normal:clone('normal')};buffers.set(mesh.geometry,attributes);
   }
   const {pos,normal}=attributes;
   const vertices=link.ranges.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i));
   const rest=vertices.map(i=>new T.Vector3().fromBufferAttribute(pos,i)),normals=vertices.map(i=>new T.Vector3().fromBufferAttribute(normal,i));
   const span=Math.max(.001,link.outer-link.inner),inner=rest.filter(v=>Math.abs(v.x)<link.inner+span*.12),outer=rest.filter(v=>Math.abs(v.x)>link.outer-span*.10);
   const mean=(points:T.Vector3[])=>{const result=new T.Vector3();for(const p of points)result.add(p);return result.divideScalar(Math.max(1,points.length));};
   const end=mean(outer),middle=mean(inner);
   const zs=inner.map(v=>v.z),fork=zs.length>0 && Math.max(...zs)-Math.min(...zs)>.16;
   const anchors=fork?[mean(inner.filter(v=>v.z<=middle.z)),mean(inner.filter(v=>v.z>middle.z))]:[middle];
   const bones=anchors.map(anchor=>({anchor,direction:end.clone().sub(anchor).normalize(),length:end.distanceTo(anchor),rotation:new T.Quaternion(),stretch:1}));
   const branches=rest.map(v=>anchors.length===1?0:Math.abs(v.z-anchors[0].z)<Math.abs(v.z-anchors[1].z)?0:1);
   const weights=rest.map(v=>T.MathUtils.clamp((Math.abs(v.x)-link.inner)/span,0,1));
   return {mesh,pos,normal,vertices,rest,normals,weights,branches,bones,end,upright:link.upright,ranges:link.ranges,last:new T.Matrix4().multiplyScalar(0),wheel:wheels[link.corner]};
 });
 const matrix=new T.Matrix4(),offset=new T.Matrix4(),v=new T.Vector3(),n=new T.Vector3(),end=new T.Vector3(),direction=new T.Vector3(),attached=new T.Vector3();
 const rotation=new T.Matrix3();
 return ()=>{
   for(const link of links){
     const {mesh,pos,normal,vertices,rest,normals,weights,wheel,ranges,last,bones}=link;
     mesh.updateWorldMatrix(true,false);wheel.pivot.updateWorldMatrix(true,false);
     offset.makeTranslation(-wheel.base.x,-wheel.base.y,-wheel.base.z);
     matrix.copy(mesh.matrixWorld).invert().multiply(wheel.pivot.matrixWorld).multiply(offset);
     if(matrix.elements.every((value,i)=>Math.abs(value-last.elements[i])<1e-6))continue;
     last.copy(matrix);rotation.getNormalMatrix(matrix);end.copy(link.end).applyMatrix4(matrix);
     for(const bone of bones){direction.copy(end).sub(bone.anchor);bone.stretch=direction.length()/Math.max(.001,bone.length);bone.rotation.setFromUnitVectors(bone.direction,direction.normalize());}
     for(let i=0;i<vertices.length;i++){
       attached.copy(rest[i]).applyMatrix4(matrix);
       if(link.upright){v.copy(attached);n.copy(normals[i]).applyMatrix3(rotation).normalize();}
       else{
         const bone=bones[link.branches[i]],w=weights[i];
         v.copy(rest[i]).sub(bone.anchor);const axial=v.dot(bone.direction);
         v.addScaledVector(bone.direction,axial*(bone.stretch-1)).applyQuaternion(bone.rotation).add(bone.anchor);
         // Leave chassis sockets fixed and blend the hub socket into its exact transform.
         v.lerp(rest[i],1-T.MathUtils.smoothstep(w,0,.14));v.lerp(attached,T.MathUtils.smoothstep(w,.82,1));
         n.copy(normals[i]);n.addScaledVector(bone.direction,n.dot(bone.direction)*(1/Math.max(.01,bone.stretch)-1)).applyQuaternion(bone.rotation).normalize();
       }
       pos.setXYZ(vertices[i],v.x,v.y,v.z);normal.setXYZ(vertices[i],n.x,n.y,n.z);
     }
     for(const [start,end] of ranges){pos.addUpdateRange(start*3,(end-start+1)*3);normal.addUpdateRange(start*3,(end-start+1)*3);}
     pos.needsUpdate=true;normal.needsUpdate=true;
   }
 };
}
