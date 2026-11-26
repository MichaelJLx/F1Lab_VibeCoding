import * as T from 'three';
import type {Tyre} from '../motion/Tyre';

// Scars are in rubber material coordinates, so neither steering nor wheel spin
// can slide the mark across the tread. Exact phase is kept outside the heat texture.
export function tyreView(spin:T.Group,radius:number,axis=new T.Vector3(1,0,0)){
 const materials:T.MeshStandardMaterial[]=[];
 const scars=Array.from({length:8},()=>new T.Vector2());
 const wheel=spin.children[0],center=wheel.position.clone().negate();
 const bottom=new T.Vector3(0,-1,0).addScaledVector(axis,axis.y).normalize();
 const tangent=new T.Vector3().crossVectors(bottom,axis).normalize();
 const declarations=`uniform vec2 scars[8]; uniform float radius;
 float scarDepth(float u){float depth=0.;for(int j=0;j<8;j++){float c=cos(u-scars[j].x);if(scars[j].y>0. && c>0.)depth=max(depth,radius-(radius-scars[j].y)/c);}return depth;}`;
 wheel.traverse(obj=>{
   if(!(obj instanceof T.Mesh)||Array.isArray(obj.material)||!obj.material.name.startsWith('sidewall'))return;
   const mat=obj.material.clone() as T.MeshStandardMaterial;
   mat.onBeforeCompile=shader=>{
     Object.assign(shader.uniforms,{treadCenter:{value:center},radius:{value:radius},scars:{value:scars},tyreAxis:{value:axis},treadBottom:{value:bottom},treadTangent:{value:tangent}});
     shader.vertexShader=declarations+`uniform vec3 treadCenter,tyreAxis,treadBottom,treadTangent; varying vec2 treadUV;\n`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
       vec3 radial=position-treadCenter;radial-=tyreAxis*dot(radial,tyreAxis);
       float angle=atan(dot(radial,treadTangent),dot(radial,treadBottom));
       treadUV=vec2(fract(angle/6.2831853+1.),smoothstep(radius*.88,radius*.97,length(radial)));
       transformed-=normalize(radial+vec3(1e-7))*scarDepth(angle)*treadUV.y;`);
     shader.fragmentShader=declarations+'varying vec2 treadUV;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
       float damage=scarDepth(treadUV.x*6.2831853)*treadUV.y;
       float worn=smoothstep(.000015,.0012,damage);
       float grain=.86+.14*sin(treadUV.x*2300.);
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.49,.48,.45)*grain,worn*.86);`)
       .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
       roughnessFactor=mix(roughnessFactor,.98,worn);`);
   };
   mat.customProgramCacheKey=()=> 'rubber-flat-phase-v2';obj.material=mat;materials.push(mat);
 });
 return {dispose:()=>materials.forEach(m=>m.dispose()),update(t:Tyre){
   for(let i=0;i<8;i++)scars[i].set(t.flatSpots[i].phase,t.flatSpots[i].depth);
 }};
}
