import * as T from 'three';
import rig from '../../../vehicles/rb22/rig/cameras.json';

function selectTriangles(source:T.BufferGeometry,indices:number[]){
 const geometry=new T.BufferGeometry(),remap=new Map<number,number>(),vertices:number[]=[];
 const compact=indices.map(i=>{if(!remap.has(i)){remap.set(i,vertices.length);vertices.push(i);}return remap.get(i)!;});
 for(const [name,attribute] of Object.entries(source.attributes)){
  const values=new Float32Array(vertices.length*attribute.itemSize);
  vertices.forEach((v,i)=>{for(let k=0;k<attribute.itemSize;k++)values[i*attribute.itemSize+k]=attribute.getComponent(v,k);});
  geometry.setAttribute(name,new T.BufferAttribute(values,attribute.itemSize));
 }
 geometry.setIndex(compact);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Split the camera from shared livery primitives once, without changing the GLB. */
export function bindCameraHousing(chassis:T.Object3D){
 const meshes:T.Mesh[]=[],bounds=new T.Box3(),point=new T.Vector3();
 const candidates:T.Mesh[]=[];chassis.traverse(o=>{if(o instanceof T.Mesh)candidates.push(o);});
 for(const mesh of candidates){
  const source=mesh.geometry,pos=source.getAttribute('position'),index=source.index;
  if(!pos || Array.isArray(mesh.material))continue;
  const keep:number[]=[],camera:number[]=[];
  const inHousing=(i:number)=>pos.getX(i)>=rig.housing.min[0] && pos.getX(i)<=rig.housing.max[0] && pos.getY(i)>=rig.housing.min[1] && pos.getY(i)<=rig.housing.max[1] && pos.getZ(i)>=rig.housing.min[2] && pos.getZ(i)<=rig.housing.max[2];
  for(let i=0;i<(index?.count??pos.count);i+=3){
   const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
   (inHousing(a)&&inHousing(b)&&inHousing(c)?camera:keep).push(a,b,c);
  }
  if(!camera.length)continue;
  const isolated=selectTriangles(source,camera);
  const shell=new T.Mesh(isolated,mesh.material);shell.name='tcam-housing';shell.position.copy(mesh.position);shell.quaternion.copy(mesh.quaternion);shell.scale.copy(mesh.scale);mesh.parent!.add(shell);meshes.push(shell);
  mesh.geometry=selectTriangles(source,keep);
  // All source primitives have baked model coordinates. Convert their selected
  // vertices to chassis space so the mount follows the actual isolated housing.
  chassis.updateWorldMatrix(true,true);
  for(const i of camera){point.fromBufferAttribute(pos,i);mesh.localToWorld(point);chassis.worldToLocal(point);bounds.expandByPoint(point);}
  source.dispose();
 }
 const lens=new T.Vector3();
 if(!bounds.isEmpty()){
  bounds.getCenter(lens);lens.x=rig.lens.lateral; lens.y=bounds.max.y-rig.lens.verticalFromTop; lens.z=bounds.max.z+rig.lens.forwardClearance;
 }else lens.fromArray(rig.lens.fallback);
 return {meshes,lens,setVisible(visible:boolean){for(const mesh of meshes)mesh.visible=visible;}};
}
