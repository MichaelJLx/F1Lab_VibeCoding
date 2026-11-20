import * as T from 'three';

// A lens-aligned halo follows the projected shape of the mirror light.
export function mirrorGlare(lenses:T.Mesh){
 const size=128,rgba=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=(2*x+1)/size-1,v=(2*y+1)/size-1,r=Math.hypot(u,v);
   const halo=.76*Math.exp(-6*r)+.24*Math.exp(-20*r*r);
   const ray=.50*Math.exp(-30*Math.abs(v-.13*u)-3.8*Math.abs(u));
   const cross=.19*Math.exp(-35*Math.abs(u+.13*v)-5*Math.abs(v));
   const i=(y*size+x)*4;
   rgba[i]=255;rgba[i+1]=154+Math.round(77*Math.exp(-9*r));rgba[i+2]=22+Math.round(124*Math.exp(-15*r));
   rgba[i+3]=Math.round(255*Math.min(1,halo+ray+cross)*(1-T.MathUtils.smoothstep(r,.72,1)));
 }
 const texture=new T.DataTexture(rgba,size,size);
 texture.colorSpace=T.SRGBColorSpace;texture.magFilter=texture.minFilter=T.LinearFilter;texture.needsUpdate=true;
 const cameraLocal=new T.Vector3(),direction=new T.Vector3();
 // Centres and outward normals measured on the two emissive GLB primitives in cockpit coordinates.
 // The emitting window is about 38 × 18 mm. The faint fringe fades on a fixed footprint.
 const footprint=new T.PlaneGeometry(.092,.046);
 const lamps=[-1,1].map(side=>{
   const normal=new T.Vector3(side*.64,-.01,.48).normalize();
   const halo=new T.Mesh(footprint,new T.MeshBasicMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false}));
   halo.lookAt(normal);
   halo.position.set(side*.64685,.76064,.66910).addScaledVector(normal,.009);
   halo.raycast=()=>{};halo.renderOrder=5;lenses.add(halo);
   return {halo,normal};
 });
 return {
   update(camera:T.Camera,pulse:number){
     lenses.worldToLocal(camera.getWorldPosition(cameraLocal));
     for(const {halo,normal} of lamps){
       direction.subVectors(cameraLocal,halo.position);
       const facing=direction.normalize().dot(normal);
       halo.material.opacity=T.MathUtils.smoothstep(facing,0,.55)*T.MathUtils.smoothstep(pulse,.15,.90);
       halo.visible=halo.material.opacity>.001;
     }
   },
   dispose(){for(const {halo} of lamps){halo.removeFromParent();halo.material.dispose();}footprint.dispose();texture.dispose();}
 };
}
