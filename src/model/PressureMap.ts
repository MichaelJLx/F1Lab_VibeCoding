import * as T from 'three';
import {platformForces} from '../motion/AeroPlatform';
import {wingCp} from './WingPressure';

export function pressureMap(car:T.Group){
 const size=256,pixels=new Float32Array(size*4);
 for(let i=0;i<size;i++){
   for(const [channel,suction,opening] of [[0,true,0],[1,false,0],[2,true,1],[3,false,1]] as const)
     pixels[i*4+channel]=wingCp(i/(size-1),suction,opening);
 }
 const curve=new T.DataTexture(pixels,size,1,T.RGBAFormat,T.FloatType);curve.needsUpdate=true;
 const uniforms={curve:{value:curve},inverseCar:{value:new T.Matrix4()},wind:{value:new T.Vector3()},up:{value:new T.Vector3()},opening:{value:0},speed:{value:0},floorLoad:{value:new T.Vector2()}};
 const materials=[0,1,2,3].map(part=>new T.ShaderMaterial({uniforms:{...uniforms,part:{value:part}},side:T.DoubleSide,transparent:false,forceSinglePass:true,depthTest:true,depthWrite:true,
 vertexShader:`
 uniform mat4 inverseCar; varying vec3 n; varying vec3 eye; varying float station;
 void main(){vec4 world=modelMatrix*vec4(position,1.);station=(inverseCar*world).z;
 n=normalMatrix*normal;eye=-(viewMatrix*world).xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
 fragmentShader:`
 uniform sampler2D curve;uniform float opening,part,speed;uniform vec2 floorLoad;uniform vec3 wind,up;varying vec3 n;varying vec3 eye;varying float station;
 void main(){
 vec3 normal=normalize(n);float face=dot(normal,mat3(viewMatrix)*wind);
 float cp=face>0.?1.-1.5*(1.-face*face):-.45;
 if(part>.5 && part<2.5){
 float chord=part<1.5?(2.68-station)/.60:(-1.92-station)/.68;
 vec4 ref=texture2D(curve,vec2(clamp(chord,0.,1.),.5));
 float vertical=dot(normal,mat3(viewMatrix)*up);
 float wing=mix(mix(ref.r,ref.b,opening),mix(ref.g,ref.a,opening),smoothstep(-.15,.15,vertical));
 cp=mix(cp,wing,smoothstep(.10,.55,abs(vertical)));}
 if(part>2.5){
 float underside=smoothstep(.05,.85,-dot(normal,mat3(viewMatrix)*up));
 float t=smoothstep(-1.8,1.6,station);
 cp=mix(cp,-mix(floorLoad.y,floorLoad.x,t),underside);}
 cp=clamp(cp,-4.,1.);
 vec3 c=mix(vec3(.025,.09,.80),vec3(.02,.65,.85),clamp((cp+4.)/2.,0.,1.));
 c=mix(c,vec3(.10,.75,.26),smoothstep(-2.,0.,cp));
 c=mix(c,vec3(1.,.78,.025),smoothstep(0.,.5,cp));
 c=mix(c,vec3(.95,.045,.025),smoothstep(.5,1.,cp));
 // Opaque diagnostic colour, with only diffuse contour shading.
 vec3 key=normalize(mat3(viewMatrix)*vec3(.4,.8,.5));
 float light=.62+.38*max(0.,dot(normal,key));
 gl_FragColor=vec4(c*light,1.);
 #include <colorspace_fragment>
 }`}));
 const entries:{mesh:T.Mesh;material:T.Material|T.Material[];visible:boolean;order:number;part:number;decal:boolean}[]=[];
 car.traverse(mesh=>{
   if(!(mesh instanceof T.Mesh))return;
   let part=0;
   for(let p:T.Object3D|null=mesh;p&&p!==car;p=p.parent){
     if(/^(FL|FR|RL|RR)$/.test(p.name))return;
     if(p.name==='front-wing')part=1;if(p.name==='rear-wing')part=2;if(p.name==='floor')part=3;
   }
   const source=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   // LCD, lighting, mirror optics and non-surface FX keep their own function.
   if(source.some(m=>!(m instanceof T.MeshStandardMaterial) || /light|led|glass|lcd|mirror|steering/i.test(m.name)))return;
   const decal=source.every(m=>m.transparent || /decal|number_/i.test(m.name));
   entries.push({mesh,material:mesh.material,visible:mesh.visible,order:mesh.renderOrder,part,decal});
 });
 let enabled=false;
 function set(on:boolean){
   if(on===enabled)return;enabled=on;
   for(const e of entries){
     if(on){e.visible=e.mesh.visible;e.order=e.mesh.renderOrder;e.material=e.mesh.material;}
     e.mesh.material=on&&!e.decal?materials[e.part]:e.material;
     e.mesh.visible=on&&e.decal?false:e.visible;
     e.mesh.renderOrder=on?5:e.order;
   }
 }
 return {set,update(opening:number,beta:number,speed:number,frontGap:number,rearGap:number){
   const air=platformForces(speed,opening,frontGap,rearGap,beta);
   uniforms.speed.value=speed;
   uniforms.floorLoad.value.set(air.frontFloor,air.rearFloor);
   car.updateWorldMatrix(true,false);uniforms.inverseCar.value.copy(car.matrixWorld).invert();
   uniforms.wind.value.set(Math.sin(beta),0,Math.cos(beta)).applyQuaternion(car.quaternion);
   uniforms.up.value.set(0,1,0).applyQuaternion(car.quaternion);uniforms.opening.value=opening;
 },dispose(){set(false);curve.dispose();materials.forEach(m=>m.dispose());}};
}
