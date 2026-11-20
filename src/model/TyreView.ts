import * as T from 'three';
import type {Tyre} from '../motion/Tyre';
// A one-dimensional material-space tread map rotates with the rubber.
export function tyreView(spin:T.Group,radius:number){
 const bytes=new Uint8Array(48*4),tex=new T.DataTexture(bytes,48,1);
 tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearFilter;tex.wrapS=T.RepeatWrapping;
 tex.needsUpdate=true;
 const wheel=spin.children[0];
 wheel.traverse(obj=>{
   if(!(obj instanceof T.Mesh)||!obj.material.name.startsWith('sidewall'))return;
   const mat=obj.material.clone() as T.MeshStandardMaterial;
   const center=wheel.position.clone().negate();
   mat.onBeforeCompile=shader=>{
     shader.uniforms.treadMap={value:tex};shader.uniforms.treadCenter={value:center};shader.uniforms.radius={value:radius};
     shader.vertexShader='uniform sampler2D treadMap; uniform vec3 treadCenter; uniform float radius; varying vec2 treadUV;\n'+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       vec2 radial=position.yz-treadCenter.yz;
       float u=fract(atan(radial.y,-radial.x)/6.2831853);
       treadUV=vec2(u,smoothstep(radius*.88,radius*.97,length(radial)));
       float cut=0.;
       for(int j=-2;j<=2;j++){
         float sector=floor(u*48.)+float(j);
         float depth=texture2D(treadMap,vec2((sector+.5)/48.,.5)).g*.009;
         float angle=((sector+.5)/48.-u)*6.2831853;
         if(depth>0.) cut=max(cut,length(radial)-(radius-depth)/max(.01,cos(angle)));
       }
       transformed.yz-=normalize(radial+vec2(1e-7))*cut*treadUV.y;`);
     shader.fragmentShader='uniform sampler2D treadMap; varying vec2 treadUV;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
       float heat=texture2D(treadMap,vec2(treadUV.x,.5)).r*treadUV.y;
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.023,.008),heat);`);
   };
   obj.material=mat;
 });
 return {dispose:()=>tex.dispose(),update(t:Tyre){
   let changed=false;
   for(let i=0;i<48;i++){
     const heat=Math.round(255*t.heat[i]),wear=Math.round(255*t.wear[i]/.009);
     if(bytes[4*i]===heat && bytes[4*i+1]===wear)continue;
     bytes[4*i]=heat;bytes[4*i+1]=wear;changed=true;
   }
   if(changed)tex.needsUpdate=true;
 }};
}
