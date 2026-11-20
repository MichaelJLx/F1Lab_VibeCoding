import * as T from 'three';

import ranges from './flap-ranges.json';

// Whole welded surfaces and their livery layers are selected offline from this GLB.
export function splitFlap(root:T.Object3D,front:boolean){
  const assembly=new T.Group();
  const meshes:T.Mesh[]=[];
  root.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
  const table=front?ranges['front-wing']:ranges['rear-wing'];
  const hinges=Array.from({length:front?2:1},()=>new T.Group());
  const points:T.Vector3[][]=hinges.map(()=>[]);
  meshes.forEach((mesh,i)=>{
    const geometry=mesh.geometry,index=geometry.index,pos=geometry.getAttribute('position');
    const count=(index?.count??pos.count)/3,which=new Int8Array(count).fill(-1);
    for(const [start,end,side] of table[i]??[])which.fill(side,start,end);
    const fixed:number[]=[],moving:number[][]=hinges.map(()=>[]);
    for(let t=0;t<count;t++){
      const out=which[t]<0?fixed:moving[which[t]];
      for(let j=t*3;j<t*3+3;j++)out.push(index?index.getX(j):j);
    }
    moving.forEach((ids,side)=>{
      if(!ids.length)return;
      for(const id of new Set(ids))points[side].push(new T.Vector3().fromBufferAttribute(pos,id));
      const panel=geometry.clone();panel.setIndex(ids);hinges[side].add(new T.Mesh(panel,mesh.material));
    });
    geometry.setIndex(fixed);
  });
  hinges.forEach((hinge,i)=>{
    const vertices=points[i];
    if(!vertices.length)return;
    const box=new T.Box3().setFromPoints(vertices),span=box.max.x-box.min.x;
    const mount=(right:boolean)=>{
      const end=vertices.filter(v=>right?v.x>box.max.x-.08*span:v.x<box.min.x+.08*span);
      const edge=(front?Math.max:Math.min)(...end.map(v=>v.z));
      const near=end.filter(v=>Math.abs(v.z-edge)<.012);
      return near.reduce((sum,v)=>sum.add(v),new T.Vector3()).divideScalar(near.length);
    };
    const left=mount(false),right=mount(true);
    hinge.position.copy(left);hinge.userData.axis=right.sub(left).normalize();
    // Estimate chord at several span stations so sweep and camber do not bias the angle.
    const angles:number[]=[];
    for(const fraction of [.25,.4,.5,.6,.75]){
      const x=box.min.x+span*fraction;
      const section=vertices.filter(v=>Math.abs(v.x-x)<span*.065);
      if(section.length<4)continue;
      const bounds=new T.Box3().setFromPoints(section);
      const depth=bounds.max.z-bounds.min.z;
      if(depth<.025)continue;
      const edgeCenter=(z:number)=>{
        const band=section.filter(v=>Math.abs(v.z-z)<depth*.14);
        return band.reduce((sum,v)=>sum.add(v),new T.Vector3()).divideScalar(band.length);
      };
      const chord=edgeCenter(bounds.max.z).sub(edgeCenter(bounds.min.z));
      const axis:T.Vector3=hinge.userData.axis;
      chord.addScaledVector(axis,-chord.dot(axis));
      const lever=axis.clone().cross(chord).y;
      if(Math.abs(lever)>.01)angles.push(Math.atan(-chord.y/lever));
    }
    angles.sort((a,b)=>a-b);
    hinge.userData.openAngle=T.MathUtils.clamp((angles[Math.floor(angles.length/2)]??0)*.85,-.8,.8);
    hinge.children.forEach(panel=>panel.position.copy(left).negate());
    assembly.add(hinge);
  });
  root.add(assembly);return assembly;
}
export function setFlap(assembly:T.Group|undefined,blend:number){
  if(assembly)for(const hinge of assembly.children)hinge.quaternion.setFromAxisAngle(hinge.userData.axis,hinge.userData.openAngle*blend);
}

// FIA Spa 2026 Doc 7 p.2 normal-grip activations, relative to local estimated turn stations.
// End gates conservatively precede the next corner. The driver also closes on braking.
export function contactShadow(){
  const geometry=new T.PlaneGeometry(2.28,5.5);geometry.rotateX(-Math.PI/2);
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
    vertexShader:'varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec2 st;void main(){vec2 e=abs(st*2.-1.);float d=dot(e,e);float a=exp(-2.6*d)*(1.-smoothstep(.60,1.,d));gl_FragColor=vec4(.04,.033,.025,.34*a);}'});
  const shadow=new T.Mesh(geometry,mat);shadow.raycast=()=>{};shadow.position.y=.006;shadow.renderOrder=1;return shadow;
}
