import * as T from 'three';
import {wingCp} from './WingPressure';

export function pressureMap(car:T.Group){
 const size=256,pixels=new Float32Array(size*4);
 for(let i=0;i<size;i++){
   for(const [channel,suction,opening] of [[0,true,0],[1,false,0],[2,true,1],[3,false,1]] as const)
     pixels[i*4+channel]=wingCp(i/(size-1),suction,opening);
 }
 const curve=new T.DataTexture(pixels,size,1,T.RGBAFormat,T.FloatType);curve.needsUpdate=true;
 const uniforms={curve:{value:curve},inverseCar:{value:new T.Matrix4()},wind:{value:new T.Vector3()},up:{value:new T.Vector3()},opening:{value:0}};
 const materials=[0,1,2].map(part=>new T.ShaderMaterial({uniforms:{...uniforms,part:{value:part}},side:T.DoubleSide,
 vertexShader:`
 uniform mat4 inverseCar; varying vec3 n; varying float station;
 void main(){vec4 world=modelMatrix*vec4(position,1.);station=(inverseCar*world).z;
 n=normalMatrix*normal;gl_Position=projectionMatrix*viewMatrix*world;}`,
 fragmentShader:`
 uniform sampler2D curve;uniform float opening,part;uniform vec3 wind,up;varying vec3 n;varying float station;
 void main(){
 vec3 normal=normalize(n);float face=dot(normal,mat3(viewMatrix)*wind);
 float cp=face>0.?1.-1.5*(1.-face*face):-.45;
 if(part>.5){
 float chord=part<1.5?(2.68-station)/.60:(-1.92-station)/.68;
 vec4 ref=texture2D(curve,vec2(clamp(chord,0.,1.),.5));
 float vertical=dot(normal,mat3(viewMatrix)*up);
 float wing=mix(mix(ref.r,ref.b,opening),mix(ref.g,ref.a,opening),smoothstep(-.15,.15,vertical));
 cp=mix(cp,wing,smoothstep(.10,.55,abs(vertical)));}
 vec3 c=mix(vec3(.05,.14,.53),vec3(.04,.68,.73),clamp((cp+4.)/3.,0.,1.));
 c=mix(c,vec3(.55,.83,.31),smoothstep(-1.,0.,cp));
 c=mix(c,vec3(.98,.62,.13),smoothstep(0.,.55,cp));
 c=mix(c,vec3(.86,.14,.10),smoothstep(.55,1.,cp));
 gl_FragColor=vec4(c,1.);
 }`}));
 const originals=new Map<T.Mesh,T.Material|T.Material[]>();
 function set(on:boolean){
   if(!on){for(const [m,original] of originals)m.material=original;originals.clear();return;}
   car.traverse(m=>{
     if(!(m instanceof T.Mesh)||originals.has(m)||!(m.material instanceof T.MeshStandardMaterial)||m.material.transparent)return;
     let part=0;
     for(let p:T.Object3D|null=m;p&&p!==car;p=p.parent){if(p.name==='front-wing')part=1;if(p.name==='rear-wing')part=2;}
     originals.set(m,m.material);m.material=materials[part];
   });
 }
 return {set,update(opening:number,beta:number){
   car.updateWorldMatrix(true,false);uniforms.inverseCar.value.copy(car.matrixWorld).invert();
   uniforms.wind.value.set(Math.sin(beta),0,Math.cos(beta)).applyQuaternion(car.quaternion);
   uniforms.up.value.set(0,1,0).applyQuaternion(car.quaternion);uniforms.opening.value=opening;
 },dispose(){set(false);curve.dispose();materials.forEach(m=>m.dispose());}};
}
