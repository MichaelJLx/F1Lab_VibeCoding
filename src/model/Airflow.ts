import {wingCp} from './WingPressure';
import * as T from 'three';
import {platformForces} from '../motion/AeroPlatform';

const steps=84;
const seeds:Array<[number,number,number]>=[];
for(const side of [-1,1])for(const [x,y] of [[.09,.43],[.24,.57],[.36,.69],[.52,.66],[.68,.57],[.80,.50],[.89,.38],[.98,.28],[1.06,.19],[.39,.054],[.21,.042],[.57,.095]]){
 seeds.push([side*x,y,3.85]);
}
// Local dye injection resolves the shear layers hidden from upstream tracers.
for(const side of [-1,1]){
 for(const [x,y,z] of [[.61,.37,.76],[.63,.30,.76],[.76,.13,.53],[.82,.09,.53],[.74,.38,1.27],[.64,.16,-1.75]]){
   seeds.push([side*x,y,z]);
 }
}
// Regularized doublets in ellipsoid coordinates approximate displacement around
// wheels, nose and sidepods. Wing turning and diffuser flow use the force model.
const bodies=[
 [0,.38,1.12,.25,.27,1.28],[0,.50,-.42,.62,.48,1.38],
 ...[-1,1].flatMap(side=>[-1.69,1.69].map(z=>[side*.77,.35,z,.22,.35,.35]))
];
export function createAirflow(){
 const count=seeds.length*(steps+1)*2;
 const positions=new Float32Array(count*3),directions=new Float32Array(count*3);
 const coords:number[]=[],indices:number[]=[];
 seeds.forEach((_,j)=>{
   const base=j*(steps+1)*2;
   for(let i=0;i<=steps;i++){
     for(const side of [-1,1])coords.push(side,i/steps,j);
     if(i<steps){const a=base+i*2;indices.push(a,a+1,a+2,a+2,a+1,a+3);}
   }
 });
 const geometry=new T.BufferGeometry();
 const pos=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
 const dir=new T.BufferAttribute(directions,3).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('position',pos);geometry.setAttribute('direction',dir);
 geometry.setAttribute('flow',new T.Float32BufferAttribute(coords,3));geometry.setIndex(indices);
 // Travel coordinate in free-stream metres: integral dz / (Uz / Uinf).
 const transit=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('transit',transit);
 const uniforms={advection:{value:0},exposure:{value:0},signal:{value:0}};
 const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,depthWrite:false,
 vertexShader:`
 attribute vec3 direction,flow;
 attribute float transit;
 varying float travel;
 varying vec3 trace;
 void main(){
   trace=flow;travel=transit;
   vec4 eye=modelViewMatrix*vec4(position,1.);
   vec3 axis=cross(mat3(modelViewMatrix)*direction,-eye.xyz);
   float width=mix(.077,.23,smoothstep(.57,1.,flow.y));
   eye.xyz+=axis/max(.001,length(axis))*flow.x*width*length(modelViewMatrix[0].xyz);
   gl_Position=projectionMatrix*eye;
 }`,fragmentShader:`
 uniform float advection,exposure,signal;
 varying float travel;
 varying vec3 trace;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){
   vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
   return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
 }
 // Filter detail that travels farther than its wavelength during an exposure.
 float advectedNoise(vec2 uv,float frequency){
   float response=1./(1.+exposure*exposure*frequency*frequency);
   return mix(.5,noise(uv*frequency),response);
 }
 void main(){
   vec2 uv=vec2(travel-advection,trace.x*1.8+trace.z*11.);
   float billow=advectedNoise(uv,.82)+.45*advectedNoise(uv,2.1)+.20*advectedNoise(uv,4.4);
   float wake=smoothstep(.55,.95,trace.y);
   float crosswind=(advectedNoise(vec2(uv.x,trace.z),.64)-.5)*(.24+.45*wake);
   float radius=abs(trace.x-crosswind);
   float edge=.21+.45*billow;
   float density=(1.-smoothstep(edge*.24,edge,radius))*smoothstep(.25,1.32,billow);
   float fade=smoothstep(0.,.09,trace.y)*(1.-smoothstep(.76,1.,trace.y));
   gl_FragColor=vec4(mix(vec3(.64,.73,.74),vec3(.91,.88,.81),billow*.60),signal*fade*density*(.32+.12*wake));
   #include <colorspace_fragment>
 }`});
 const mesh=new T.Mesh(geometry,material);mesh.name='Wind tunnel smoke';mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};
 let elapsed=Infinity;
 const velocity=new T.Vector3(),mid=new T.Vector3(),p=new T.Vector3();
 return {mesh,update(dt:number,speed:number,opening:number,beta:number,frontGap:number,rearGap:number,steer:number){
   uniforms.signal.value=T.MathUtils.smoothstep(speed,0,5);
   const distance=Math.max(0,speed)*dt;
   uniforms.advection.value+=distance;
   if(dt>0)uniforms.exposure.value=distance*.5;
   elapsed+=dt;if(elapsed<1/15)return;elapsed=0;
   const aero=platformForces(speed,opening,frontGap,rearGap,beta);
   const incident=Math.tan(T.MathUtils.clamp(beta,-.22,.22));
   let axialRatio=1;
   // Wake deficit from drag momentum, using an expanding Gaussian pair.
   const dragArea=speed>.01?aero.drag/(.5*1.225*speed*speed):0;
   // Bernoulli edge speed derived from tunnel pressure taps; resample once per field update.
   const edge=Array.from({length:65},(_,i)=>Math.sqrt(Math.max(.015,1-wingCp(i/64,true,opening))));
   function wingSpeed(chord:number,height:number){
     if(chord<0 || chord>1 || Math.abs(height)>.27)return 0;
     const t=chord*64,i=Math.min(63,Math.floor(t));
     return (edge[i]+(edge[i+1]-edge[i])*(t-i)-1)*Math.exp(-Math.abs(height)/.09)*Math.min(1,chord*40,(1-chord)*25);
   }
   function field(point:T.Vector3){
     const {x,y,z}=point;
     let vx=-incident,vy=0,forward=1;
     for(const [cx,cy,cz,rx,ry,rz] of bodies){
       const a=(x-cx)/rx,b=(y-cy)/ry,c=(z-cz)/rz;
       const r2=Math.max(1,a*a+b*b+c*c),dipole=.5/(r2*Math.sqrt(r2));
       vx+=3*dipole*a*c/r2*rx/rz;vy+=3*dipole*b*c/r2*ry/rz;
       forward+=dipole*(1-3*c*c/r2);
     }
     const span=Math.exp(-Math.pow(Math.abs(x)/1.03,6));
     const wing=(station:number,height:number,reach:number)=>Math.exp(-Math.pow((z-station)/reach,2)-Math.pow((y-height)/.38,2))*span;
     vy+=.30*aero.frontWing*wing(2.24,.19,.47)+.54*aero.rearWing*wing(-2.54,.86,.91);
     if(y<.19)forward+=span*wingSpeed((2.68-z)/.60,y-.19);
     if(y<.86)forward+=span*wingSpeed((-1.92-z)/.68,y-.86);
     const floor=Math.exp(-Math.pow((y-.06)/.12,2)-Math.pow(x/.66,4));
     forward+=floor*.35*(aero.frontFloor+aero.rearFloor)*Math.exp(-Math.pow((z+.15)/1.6,4));
     vy+=floor*.24*aero.rearFloor*Math.exp(-Math.pow((z+1.85)/.65,2));
     // Finite-core streamwise vortices. An opposite mirror vortex below the
     // road cancels normal velocity at the ground. Positions are model estimates.
     const side=x>=0?1:-1;
     const wheelDistance=1.69-z;
     const wheelCentre=side*.77-wheelDistance*(incident+.35*Math.sin(steer));
     let wheelLoss=0;
     if(wheelDistance>.32){
       const t=wheelDistance-.32;
       const spread=.17+.09*t;
       wheelLoss=.47*(1-Math.exp(-t/.09))*Math.exp(-t/1.65
         -.5*((x-wheelCentre)/spread)**2-.5*((y-.37)/(.24+.045*t))**2);
       forward-=wheelLoss;
     }
     function rollUp(start:number,offset:number,height:number,radius:number,length:number,circulation:number){
       const age=start-z;
       if(age<=0)return;
       const dx=x-(side*offset-incident*age),dy=y-height,imageY=y+height;
       const core=radius+.038*age;
       const strength=side*circulation*(-Math.expm1(-age/.15))*Math.exp(-age/length);
       const real=strength/(core*core+dx*dx+dy*dy),image=strength/(core*core+dx*dx+imageY*imageY);
       vx+=-real*dy+image*imageY;vy+=(real-image)*dx;
     }
     // Local pressure loading drives circulation. Wheel-wake velocity deficit
     // reduces the head available at the inlet. Yaw redistributes incidence.
     const incidence=T.MathUtils.clamp(1-side*2*incident,.55,1.45);
     const lipLoad=aero.frontFloor*(1-wheelLoss)**2*incidence;
     rollUp(.78,.62,.33,.056,1.35,.041*lipLoad);
     rollUp(.55,.76,Math.max(.05,frontGap+.038),.042,2.1,-.032*aero.frontFloor*incidence);
     rollUp(2.32,.88,.20,.060,1.1,.032*aero.frontWing);
     rollUp(-1.76,.57,Math.max(.11,rearGap+.14),.070,1.35,-.042*aero.rearFloor);
     // Counter-rotating trailing vortices: circulation falls with wing load,
     // the finite core spreads downstream and the wake is convected by sideslip.
     if(z<-2.12){
       const behind=-2.12-z,core=.10+.07*behind;
       for(const side of [-1,1]){
         const dx=x-(side*.77-incident*behind),dy=y-(.78+.09*behind);
         const width=.32+.13*behind,height=.36+.10*behind;
         const deficit=dragArea/(8*Math.PI*width*height)*Math.exp(-.5*((dx/width)**2+((y-.47)/height)**2));
         forward-=deficit*(1-Math.exp(-behind*4));
         const strength=side*.047*aero.rearWing*(1-Math.exp(-behind*4))/(core*core+dx*dx+dy*dy);
         vx-=strength*dy;vy+=strength*dx;
       }
     }
     axialRatio=Math.max(.25,forward);
     return velocity.set(vx/axialRatio,vy/axialRatio,-1);
   }
   let index=0;
   for(const [x,y,inlet] of seeds){
     const step=(inlet+4.55)/steps;
     p.set(x,y,inlet);let upstreamMetres=0;
     for(let i=0;i<=steps;i++){
       field(p);
       for(let j=0;j<2;j++){transit.setX(index,upstreamMetres);pos.setXYZ(index,p.x,p.y,p.z);dir.setXYZ(index++,velocity.x,velocity.y,-1);}
       mid.copy(p).addScaledVector(velocity,step*.5);p.addScaledVector(field(mid),step);
       upstreamMetres+=step/axialRatio;
       p.y=Math.max(.014,p.y);
     }
   }
   pos.needsUpdate=dir.needsUpdate=transit.needsUpdate=true;
 }};
}
