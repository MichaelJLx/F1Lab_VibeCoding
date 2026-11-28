import * as T from 'three';
import ranges from '../../../vehicles/rb22/rig/active-wings.json';
import actuators from '../../../vehicles/rb22/rig/wing-actuators.json';
import hingeRig from '../../../vehicles/rb22/rig/wing-hinges.json';

type Link={meshes:T.Mesh[];hinge:T.Group;anchorHinge:T.Group|undefined;anchor:T.Vector3;attachment:T.Vector3;axis:T.Vector3;length:number;frame:T.Matrix4;inverseFrame:T.Matrix4;start:T.Vector3;target:T.Vector3;rotation:T.Quaternion;scale:T.Vector3;matrix:T.Matrix4};
const linkRotation=new T.Matrix4(),linkTranslation=new T.Matrix4();

// Triangle ownership is generated from complete welded components, across all
// material layers. Every source triangle belongs to exactly one rigid part/link.
export function splitFlap(root:T.Object3D,front:boolean){
  const name=front?'front-wing':'rear-wing',assembly=new T.Group();assembly.name='active-wing';
  const meshes:T.Mesh[]=[];root.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
  const table=ranges[name],rods=actuators[name];
  const hinges=hingeRig[name].map(config=>{
    const hinge=new T.Group();hinge.position.fromArray(config.pivot);
    hinge.userData.axis=new T.Vector3().fromArray(config.axis).normalize();hinge.userData.openAngle=config.openAngle;
    assembly.add(hinge);return hinge;
  });
  const links:Link[]=rods.map(rod=>{
    const anchor=new T.Vector3().fromArray(rod.anchor),attachment=new T.Vector3().fromArray(rod.attachment);
    const axis=attachment.clone().sub(anchor),length=axis.length();axis.normalize();
    const frame=new T.Matrix4().compose(anchor,new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),axis),new T.Vector3(1,1,1));
    return {meshes:[],hinge:hinges[rod.hinge],anchorHinge:hinges[rod.anchorHinge],anchor,attachment,axis,length,frame,inverseFrame:frame.clone().invert(),start:new T.Vector3(),target:new T.Vector3(),rotation:new T.Quaternion(),scale:new T.Vector3(1,1,1),matrix:new T.Matrix4()};
  });
  meshes.forEach((mesh,i)=>{
    const geometry=mesh.geometry,index=geometry.index,pos=geometry.getAttribute('position');
    const count=(index?.count??pos.count)/3,which=new Int8Array(count).fill(-1);
    for(const [start,end,side] of table[i]??[])which.fill(side,start,end);
    const rodOwner=new Int8Array(count).fill(-1);
    rods.forEach((rod,r)=>{for(const piece of rod.pieces)if(piece.primitive===i)for(const [start,end] of piece.ranges)rodOwner.fill(r,start,end);});
    const fixed:number[]=[],moving:number[][]=hinges.map(()=>[]),rodsIndices:number[][]=rods.map(()=>[]);
    for(let t=0;t<count;t++){
      const out=rodOwner[t]>=0?rodsIndices[rodOwner[t]]:which[t]<0?fixed:moving[which[t]];
      for(let j=t*3;j<t*3+3;j++)out.push(index?index.getX(j):j);
    }
    moving.forEach((ids,side)=>{
      if(!ids.length)return;
      const geometryPart=geometry.clone();geometryPart.setIndex(ids);
      const panel=new T.Mesh(geometryPart,mesh.material);panel.name='wing-flap';panel.position.copy(hinges[side].position).negate();hinges[side].add(panel);
    });
    rodsIndices.forEach((ids,r)=>{
      if(!ids.length)return;
      const geometryPart=geometry.clone();geometryPart.setIndex(ids);
      const part=new T.Mesh(geometryPart,mesh.material);part.name='wing-actuator';part.matrixAutoUpdate=false;root.add(part);links[r].meshes.push(part);
    });
    geometry.setIndex(fixed);
  });
  assembly.userData.links=links;root.add(assembly);return assembly;
}
function socket(point:T.Vector3,hinge:T.Group|undefined,target:T.Vector3){
  target.copy(point);
  if(hinge)target.sub(hinge.position).applyQuaternion(hinge.quaternion).add(hinge.position);
  return target;
}
export function setFlap(assembly:T.Group|undefined,blend:number){
  if(!assembly)return;
  if(assembly.userData.blend===blend)return;assembly.userData.blend=blend;
  for(const hinge of assembly.children)hinge.quaternion.setFromAxisAngle(hinge.userData.axis,hinge.userData.openAngle*blend);
  for(const link of assembly.userData.links as Link[]){
    const {hinge,anchorHinge,anchor,attachment,start,target,axis,length,rotation,scale,matrix,frame,inverseFrame}=link;
    // Hangers within a rigid flap pack share its complete rotation, including
    // twist about their own axis. Only casing-mounted actuators change length.
    if(anchorHinge===hinge){
      matrix.makeTranslation(hinge.position.x,hinge.position.y,hinge.position.z)
        .multiply(linkRotation.makeRotationFromQuaternion(hinge.quaternion))
        .multiply(linkTranslation.makeTranslation(-hinge.position.x,-hinge.position.y,-hinge.position.z));
      for(const mesh of link.meshes){mesh.matrix.copy(matrix);mesh.matrixWorldNeedsUpdate=true;}
      continue;
    }
    socket(anchor,anchorHinge,start);socket(attachment,hinge,target).sub(start);
    scale.y=target.length()/length;rotation.setFromUnitVectors(axis,target.normalize());
    matrix.makeTranslation(start.x,start.y,start.z).multiply(linkRotation.makeRotationFromQuaternion(rotation));
    matrix.multiply(linkTranslation.makeTranslation(-anchor.x,-anchor.y,-anchor.z));
    matrix.multiply(frame).scale(scale).multiply(inverseFrame);
    for(const mesh of link.meshes){mesh.matrix.copy(matrix);mesh.matrixWorldNeedsUpdate=true;}
  }
}

export function contactShadow(){
  const geometry=new T.PlaneGeometry(2.28,5.5);geometry.rotateX(-Math.PI/2);
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;void main(){vec2 e=abs(st*2.-1.);float d=dot(e,e);float a=exp(-2.6*d)*(1.-smoothstep(.60,1.,d));gl_FragColor=vec4(.04,.033,.025,.34*a);}'});
  const shadow=new T.Mesh(geometry,mat);shadow.raycast=()=>{};shadow.position.y=.006;shadow.renderOrder=1;return shadow;
}
