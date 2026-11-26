import wheelRig from './wheel-rig.json';
import {steps,seeds,ribbonVertices} from './FlowLayout';
import type {FlowPart,FlowBuffers,FlowResult,FlowRequest} from './FlowProtocol';
import {bodyClearance} from './FlowClearance';
import * as T from 'three';

export function createAirflow(chassis:T.Group){
 const worker=new Worker(new URL('./flow.worker.ts',import.meta.url),{type:'module'});
 const parts:T.Mesh[]=[];
 chassis.traverse(object=>{
   if(!(object instanceof T.Mesh))return;
   const material=Array.isArray(object.material)?object.material[0]:object.material;
   if(!material.transparent && object.geometry.getAttribute('position').count>=12)parts.push(object);
 });
 const rootInverse=new T.Matrix4(),partMatrix=new T.Matrix4();
 const matrices=parts.map(()=>new Array<number>(16));
 const captureMatrices=()=>{
   chassis.parent!.updateWorldMatrix(true,true);rootInverse.copy(chassis.parent!.matrixWorld).invert();
   parts.forEach((part,i)=>partMatrix.multiplyMatrices(rootInverse,part.matrixWorld).toArray(matrices[i]));
 };
 captureMatrices();
 const encoded:FlowPart[]=parts.map((part,i)=>{
   const attribute=part.geometry.getAttribute('position'),positions=new Float32Array(attribute.count*3);
   for(let j=0;j<attribute.count;j++){positions[j*3]=attribute.getX(j);positions[j*3+1]=attribute.getY(j);positions[j*3+2]=attribute.getZ(j);}
   const index=part.geometry.index,indices=index?new Uint32Array(index.array):null;
   return {positions,indices,matrix:matrices[i]};
 });
 const wheelKeys=['FL','FR','RL','RR'] as const;
 const shapes=wheelKeys.map(key=>{
   const rig=wheelRig.wheels[key],hub=chassis.parent!.getObjectByName(key)!;
   hub.updateWorldMatrix(true,true);
   const inverse=hub.matrixWorld.clone().invert(),axis=new T.Vector3().fromArray(rig.axis),v=new T.Vector3(),matrix=new T.Matrix4();
   let low=Infinity,high=-Infinity;
   hub.traverse(object=>{
     if(!(object instanceof T.Mesh))return;
     matrix.multiplyMatrices(inverse,object.matrixWorld);
     const vertices=object.geometry.getAttribute('position');
     for(let i=0;i<vertices.count;i++){
       const axial=v.fromBufferAttribute(vertices,i).applyMatrix4(matrix).dot(axis);
       low=Math.min(low,axial);high=Math.max(high,axial);
     }
   });
   return new T.Vector2(rig.radius,Number.isFinite(high-low)?(high-low)/2:.22);
 });
 const init:FlowRequest={type:'init',parts:encoded,shapes:shapes.map(s=>s.toArray())};
 worker.postMessage(init,encoded.flatMap(p=>p.indices?[p.positions.buffer,p.indices.buffer]:[p.positions.buffer]));
 const count=seeds.length*(steps+1)*ribbonVertices;
 const positions=new Float32Array(count*3),directions=new Float32Array(count*3);
 const coords:number[]=[],indices:number[]=[],underfloor:number[]=[];
 seeds.forEach((_,j)=>{
   const base=j*(steps+1)*ribbonVertices;
   for(let i=0;i<=steps;i++){
     for(const side of [-1,1,-2,2]){coords.push(side,i/steps,j);underfloor.push(seeds[j][1]<.1?1:0);}
     if(i<steps)for(const sheet of [0,2]){const a=base+i*ribbonVertices+sheet,b=a+ribbonVertices;indices.push(a,a+1,b,b,a+1,b+1);}
   }
 });
 const geometry=new T.BufferGeometry();
 const pos=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
 const dir=new T.BufferAttribute(directions,3).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('underfloor',new T.Float32BufferAttribute(underfloor,1));geometry.setAttribute('position',pos);geometry.setAttribute('direction',dir);
 const previous=new T.BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage),ratios=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 const previousDirection=new T.BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage);
 const frameAttribute=new T.BufferAttribute(new Float32Array(count*4),4).setUsage(T.DynamicDrawUsage);
 const previousFrame=new T.BufferAttribute(new Float32Array(count*4),4).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('frame',frameAttribute);geometry.setAttribute('previousFrame',previousFrame);
 geometry.setAttribute('previousDirection',previousDirection);
 geometry.setAttribute('previous',previous);geometry.setAttribute('ratio',ratios);
 geometry.setAttribute('flow',new T.Float32BufferAttribute(coords,3));geometry.setIndex(indices);
 // Travel coordinate in free-stream metres: integral dz / (Uz / Uinf).
 const transit=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 const previousTransit=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 const previousRatio=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 geometry.setAttribute('previousTransit',previousTransit);geometry.setAttribute('previousRatio',previousRatio);geometry.setAttribute('transit',transit);
 const uniforms={blend:{value:1},wheelShape:{value:shapes},wheelAxis:{value:wheelKeys.map(k=>new T.Vector3().fromArray(wheelRig.wheels[k].axis))},wheelPose:{value:Array.from({length:4},()=>new T.Vector4())},toChassis:{value:new T.Matrix4()},clearance:{value:bodyClearance(chassis)},advection:{value:0},exposure:{value:0},signal:{value:0}};
 const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,forceSinglePass:true,depthWrite:false,
 vertexShader:`
 uniform mat4 toChassis;uniform sampler2D clearance;uniform float exposure;attribute float underfloor;varying float floorRoom;attribute vec3 direction,flow,previous,previousDirection;attribute vec4 frame,previousFrame;
 varying float ribbonFacing;
 attribute float ratio;uniform float blend;varying float localSpeed;
 attribute float transit,previousTransit,previousRatio;
 varying vec3 localPoint;
 varying float travel;
 varying vec3 trace;
 void main(){
   trace=vec3(sign(flow.x),flow.yz);travel=mix(previousTransit,transit,blend);localSpeed=mix(previousRatio,ratio,blend);vec3 centre=mix(previous,position,blend);
   centre.z-=max(0.,-centre.z-2.9)*clamp(exposure,0.,1.)*.45;
   vec4 eye=modelViewMatrix*vec4(centre,1.);
   vec3 tangent=normalize(mix(previousDirection,direction,blend));
   vec4 transported=mix(previousFrame,frame,blend);
   vec3 normal=normalize(transported.xyz-tangent*dot(transported.xyz,tangent));
   vec3 localAxis=abs(flow.x)>1.5?normalize(cross(tangent,normal)):normal;
   float width=transported.w;
   width=min(width,max(.001,centre.y-.025)/max(.001,abs(localAxis.y)));
   vec3 localOffset=localAxis*sign(flow.x)*width;
   localPoint=centre+localOffset;floorRoom=1.;
   if(underfloor>.5){
     vec3 body=(toChassis*vec4(localPoint,1.)).xyz;
     vec2 cell=body.xz/vec2(2.4,6.)+.5;
     float ceiling=2.;
     if(all(greaterThanEqual(cell,vec2(0.)))&&all(lessThan(cell,vec2(1.)))){
       vec2 bounds=texture2D(clearance,cell).rg;
       if(bounds.x<=bounds.y)ceiling=localPoint.y+(bounds.x-body.y-.004)/max(.5,toChassis[1].y);
     }
     floorRoom=smoothstep(.012,.023,ceiling);
     localPoint.y=clamp(localPoint.y,.011,max(.011,ceiling));
   }
   eye=modelViewMatrix*vec4(localPoint,1.);
   // Two orthogonal transported ribbons preserve volume without a view-facing
   // normal flip; each sheet feathers independently along its true edges.
   vec3 surfaceNormal=normalize(mat3(modelViewMatrix)*cross(tangent,localAxis));
   ribbonFacing=.65+.35*abs(dot(surfaceNormal,normalize(-eye.xyz)));
   gl_Position=projectionMatrix*eye;
 }`,fragmentShader:`
 varying float floorRoom;uniform vec4 wheelPose[4];uniform vec3 wheelAxis[4];uniform vec2 wheelShape[4];uniform mat4 toChassis;uniform sampler2D clearance;
 uniform float advection,exposure,signal;varying float localSpeed;varying float ribbonFacing;
 varying vec3 localPoint;
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
   float clearanceFade=1.;
   for(int i=0;i<4;i++){
     vec3 d=localPoint-wheelPose[i].xyz;
     float axial=dot(d,wheelAxis[i]);
     vec2 q=vec2(abs(axial)-wheelShape[i].y,length(d-wheelAxis[i]*axial)-wheelShape[i].x);
     float separation=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
     clearanceFade=min(clearanceFade,smoothstep(.015,.075,separation));
   }
   vec3 body=(toChassis*vec4(localPoint,1.)).xyz;
   vec2 cell=body.xz/vec2(2.4,6.)+.5;
   if(all(greaterThanEqual(cell,vec2(0.))) && all(lessThan(cell,vec2(1.)))){
     vec2 bounds=texture2D(clearance,cell).rg;
     clearanceFade*=smoothstep(-.003,.02,max(bounds.x-body.y,body.y-bounds.y));
   }
   if(clearanceFade<.001 || localPoint.y<0.)discard;
   vec2 uv=vec2(travel-advection,trace.x*1.8+trace.z*11.);
   float billow=advectedNoise(uv,.82)+.45*advectedNoise(uv,2.1)+.20*advectedNoise(uv,4.4);
   float wake=smoothstep(.55,.95,trace.y);
   float crosswind=(advectedNoise(vec2(uv.x,trace.z),.64)-.5)*(.06+.12*wake);
   float radius=abs(trace.x-crosswind);
   float edge=.66+.12*billow;
   // Keep the injected smoke column continuous; noise modulates its fringes.
   float column=exp(-2.8*radius*radius)*(1.-smoothstep(.72,1.,radius));
   float fringe=(1.-smoothstep(edge*.24,edge,radius))*smoothstep(.25,1.32,billow);
   float density=.72*column+.28*fringe;
   float fade=smoothstep(0.,.22,trace.y)*(1.-smoothstep(.64,1.,trace.y));
   vec3 tint=mix(vec3(.18,.54,.72),vec3(.76,.91,.94),smoothstep(.25,1.,localSpeed));
   tint=mix(tint,vec3(1.,.68,.30),smoothstep(1.,1.8,localSpeed));
   gl_FragColor=vec4(tint,floorRoom*ribbonFacing*clearanceFade*signal*fade*density*(.21+.06*clamp(localSpeed,0.,1.8)));
   #include <colorspace_fragment>
 }`});
 const mesh=new T.Mesh(geometry,material);mesh.name='Wind tunnel smoke';mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};
 let elapsed=Infinity,pending=false,received=false,disposed=false;
 let smoothSpeed=0,smoothOpening=0,smoothBeta=0,smoothSteer=0,appearance=0;
 let buffers:FlowBuffers|undefined={positions:new Float32Array(count*3),directions:new Float32Array(count*3),frames:new Float32Array(count*4),transit:new Float32Array(count),ratios:new Float32Array(count)};
 let shownAt=0;
 const stats={solveMs:0,updates:0,localRatio:1,firstFrameMs:-1};
 worker.onmessage=({data}:{data:FlowResult})=>{
   if(disposed)return;
   // Fixed underfloor probe at the middle of the car, not an invented speed value.
   stats.localRatio=data.ratios[(9*(steps+1)+Math.round(steps*.5))*ribbonVertices];
   // Reuse GPU attributes; transfer the scratch arrays back on the next request.
   const old=previous.array as Float32Array,current=pos.array as Float32Array;
   for(let i=0;i<current.length;i++)old[i]=received?old[i]+(current[i]-old[i])*uniforms.blend.value:data.positions[i];
   const oldDir=previousDirection.array as Float32Array,currentDir=dir.array as Float32Array;
   for(let i=0;i<currentDir.length;i++)oldDir[i]=received?oldDir[i]+(currentDir[i]-oldDir[i])*uniforms.blend.value:data.directions[i];
   const oldFrame=previousFrame.array as Float32Array,currentFrame=frameAttribute.array as Float32Array;
   for(let i=0;i<currentFrame.length;i++)oldFrame[i]=received?oldFrame[i]+(currentFrame[i]-oldFrame[i])*uniforms.blend.value:data.frames[i];
   currentFrame.set(data.frames);frameAttribute.needsUpdate=previousFrame.needsUpdate=true;
   current.set(data.positions);currentDir.set(data.directions);
   for(const [prev,now,next] of [[previousTransit,transit,data.transit],[previousRatio,ratios,data.ratios]] as const){
     const a=prev.array as Float32Array,b=now.array as Float32Array;
     for(let i=0;i<a.length;i++)a[i]=received?a[i]+(b[i]-a[i])*uniforms.blend.value:next[i];
     prev.needsUpdate=true;
   }
   (transit.array as Float32Array).set(data.transit);(ratios.array as Float32Array).set(data.ratios);
   pos.needsUpdate=previous.needsUpdate=previousDirection.needsUpdate=dir.needsUpdate=transit.needsUpdate=ratios.needsUpdate=true;
   uniforms.blend.value=0;received=true;pending=false;buffers=data;stats.solveMs=data.solveMs;stats.updates++;
 };
 worker.onerror=event=>{pending=false;console.error('Airflow worker:',event.message);};
 const poses=Array.from({length:4},()=>new Array<number>(4)),axes=Array.from({length:4},()=>new Array<number>(3));
 return {mesh,uniforms,stats,setVisible(on:boolean){mesh.visible=on;appearance=0;elapsed=Infinity;shownAt=performance.now();stats.firstFrameMs=-1;},dispose(){disposed=true;worker.terminate();uniforms.clearance.value.dispose();},
 update(dt:number,speed:number,opening:number,beta:number,frontGap:number,rearGap:number,steer:number,renderDt=dt){
   if(mesh.visible&&received&&stats.firstFrameMs<0)stats.firstFrameMs=performance.now()-shownAt;
   appearance=Math.min(1,appearance+Math.max(0,renderDt)/.15);
   const damping=1-Math.exp(-Math.max(0,renderDt)/.12);
   smoothSpeed+=(speed-smoothSpeed)*damping;smoothOpening+=(opening-smoothOpening)*damping;
   smoothBeta+=(beta-smoothBeta)*damping;smoothSteer+=(steer-smoothSteer)*damping;
   uniforms.signal.value=received?appearance*T.MathUtils.smoothstep(smoothSpeed,1,12)*(.35+.65*Math.min(1,smoothSpeed/90)):0;
   uniforms.advection.value+=Math.max(0,smoothSpeed)*dt;
   uniforms.exposure.value=Math.max(0,smoothSpeed)/120;
   uniforms.blend.value=1-(1-uniforms.blend.value)*Math.exp(-Math.max(0,renderDt)/.11);
   elapsed+=dt;if(speed<=.01 || elapsed<1/15 || pending || !buffers)return;elapsed=0;
   captureMatrices();
   for(let i=0;i<4;i++){uniforms.wheelPose.value[i].toArray(poses[i]);uniforms.wheelAxis.value[i].toArray(axes[i]);}
   const request:FlowRequest={type:'step',state:{speed:smoothSpeed,opening:smoothOpening,beta:smoothBeta,frontGap,rearGap,steer:smoothSteer,poses,axes,matrices},buffers};
   pending=true;worker.postMessage(request,[buffers.positions.buffer,buffers.directions.buffer,buffers.frames.buffer,buffers.transit.buffer,buffers.ratios.buffer]);buffers=undefined;
 }};
}
