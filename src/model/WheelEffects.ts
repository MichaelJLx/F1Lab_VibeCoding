import * as T from 'three';
import {contactShadow} from './ActiveWings';

export function wheelEffects(pivot:T.Group,spin:T.Group,side:number,radius:number){
  const shadow=contactShadow();
  shadow.scale.set(.64/2.28,1,.88/5.5);
  pivot.add(shadow);
  // Short exposure arcs on the outer sidewall follow the wheel's true spin phase.
  const box=new T.Box3();
  spin.traverse(o=>{
    if(o instanceof T.Mesh){o.geometry.computeBoundingBox();const local=o.geometry.boundingBox!.clone();
      local.translate(o.position.clone().add(o.parent?.position??new T.Vector3()));box.union(local);}
  });
  const face=side>0?box.max.x:box.min.x;
  const mat=new T.MeshBasicMaterial({color:0xc6bdaa,transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide});
  const streaks=new T.Group();
  for(const phase of [0,2.65,4.7]){
    const arc=new T.Mesh(new T.RingGeometry(radius*.835,radius*.866,40,1,phase,.72),mat);
    arc.rotation.y=Math.PI/2;streaks.add(arc);
  }
  streaks.position.x=face+side*.002;spin.add(streaks);
  return {shadow,streaks,mat};
}
