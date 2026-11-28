import wheelRig from '../../../vehicles/rb22/rig/wheels.json';
import {steps,seeds,ribbonVertices} from './FlowLayout';
import type {FlowState,FlowBuffers,FlowResult,FlowRequest} from './FlowProtocol';
import {bodyClearance} from './FlowClearance';
import * as T from 'three';

export function createAirflow(chassis:T.Group){
 const worker=new Worker(new URL('./flow.worker.ts',import.meta.url),{type:'module'});
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
 const clearance=bodyClearance(chassis);
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
 const uniforms={blend:{value:1},wheelShape:{value:shapes},wheelAxis:{value:wheelKeys.map(k=>new T.Vector3().fromArray(wheelRig.wheels[k].axis))},wheelPose:{value:Array.from({length:4},()=>new T.Vector4())},toChassis:{value:new T.Matrix4()},clearance:{value:clearance},advection:{value:0},exposure:{value:0},signal:{value:0}};
 const material=new T.ShaderMaterial({uniforms,side:T.DoubleSide,transparent:true,forceSinglePass:true,depthWrite:false,
 vertexShader:`
 uniform mat4 toChassis;uniform sampler2D clearance;uniform float exposure;attribute float underfloor;varying float floorRoom;varying float floorStream;attribute vec3 direction,flow,previous,previousDirection;attribute vec4 frame,previousFrame;
 varying float ribbonFacing;
 attribute float ratio;uniform float blend;varying float localSpeed;
 attribute float transit,previousTransit,previousRatio;
 varying vec3 localPoint;
 varying float travel;
 varying vec3 trace;
 void main(){
   trace=vec3(sign(flow.x),flow.yz);travel=mix(previousTransit,transit,blend);localSpeed=mix(previousRatio,ratio,blend);vec3 centre=mix(previous,position,blend);

   vec4 eye=modelViewMatrix*vec4(centre,1.);
   vec3 tangent=normalize(mix(previousDirection,direction,blend));
   vec4 transported=mix(previousFrame,frame,blend);
   vec3 normal=normalize(transported.xyz-tangent*dot(transported.xyz,tangent));
   vec3 localAxis=abs(flow.x)>1.5?normalize(cross(tangent,normal)):normal;
   float width=transported.w;
   width=min(width,max(.001,centre.y-.011)/max(.001,abs(localAxis.y)));
   vec3 localOffset=localAxis*sign(flow.x)*width;
   localPoint=centre+localOffset;floorRoom=1.;floorStream=underfloor;
   // Do not snap individual ribbon vertices to a nearest-neighbour height map.
   // The solver bounds the channel centre; fragments fade at the actual skin.
   eye=modelViewMatrix*vec4(localPoint,1.);
   // Two orthogonal transported ribbons preserve volume without a view-facing
   // normal flip; each sheet feathers independently along its true edges.
   vec3 surfaceNormal=normalize(mat3(modelViewMatrix)*cross(tangent,localAxis));
   ribbonFacing=.65+.35*abs(dot(surfaceNormal,normalize(-eye.xyz)));
   gl_Position=projectionMatrix*eye;
 }`,fragmentShader:`
 varying float floorRoom;varying float floorStream;uniform vec4 wheelPose[4];uniform vec3 wheelAxis[4];uniform vec2 wheelShape[4];uniform mat4 toChassis;uniform sampler2D clearance;
 uniform float advection,exposure,signal;varying float localSpeed;varying float ribbonFacing;
 varying vec3 localPoint;
 varying float travel;
 varying vec3 trace;
 float hash(vec2 p){
   vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);
   return fract((q.x+q.y)*q.z);
 }
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
     if(abs(d.z)>wheelShape[i].x+wheelShape[i].y+.08 || abs(d.y)>wheelShape[i].x+.08 || abs(d.x)>wheelShape[i].x+wheelShape[i].y+.08)continue;
     float axial=dot(d,wheelAxis[i]);
     vec2 q=vec2(abs(axial)-wheelShape[i].y,length(d-wheelAxis[i]*axial)-wheelShape[i].x);
     float separation=length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
     clearanceFade=min(clearanceFade,smoothstep(.008,.035,separation));
   }
   vec3 body=(toChassis*vec4(localPoint,1.)).xyz;
   vec2 cell=body.xz/vec2(2.4,6.)+.5;
   if(all(greaterThanEqual(cell,vec2(0.))) && all(lessThan(cell,vec2(1.)))){
     vec2 bounds=texture2D(clearance,cell).rg;
     clearanceFade*=mix(smoothstep(-.003,.02,max(bounds.x-body.y,body.y-bounds.y)),smoothstep(.001,.004,bounds.x-body.y),floorStream);
   }
   if(clearanceFade<.001 || localPoint.y<0.)discard;
   vec2 uv=vec2(travel-advection,trace.x*1.8+trace.z*11.);
   float billow=1.15*advectedNoise(uv,.82)+.50*advectedNoise(uv,2.1);
   float wake=smoothstep(.55,.95,trace.y);
   float crosswind=(advectedNoise(vec2(uv.x,trace.z),.64)-.5)*(.12+.20*wake);
   float radius=abs(trace.x-crosswind);
   float edge=.66+.12*billow;
   // Keep the injected smoke column continuous; noise modulates its fringes.
   float column=exp(-1.9*radius*radius)*(1.-smoothstep(.72,1.,radius));
   float fringe=(1.-smoothstep(edge*.24,edge,radius))*smoothstep(.25,1.32,billow);
   float wisps=advectedNoise(vec2(uv.x*.75,trace.x*2.7+trace.z*3.1),1.3);
   float density=(.64*column+.36*fringe)*(.68+.32*wisps);
   float seedPhase=hash(vec2(trace.z,3.17));
   float fade=smoothstep(.015*seedPhase,.13+.09*seedPhase,trace.y)*(1.-smoothstep(.62+.10*seedPhase,1.,trace.y));
   vec3 tint=mix(vec3(.15,.42,.70),vec3(.72,.80,.88),smoothstep(.25,1.2,localSpeed));
   tint=mix(tint,vec3(1.,.43,.22),smoothstep(1.15,1.8,localSpeed)*(1.-floorStream));
   tint=mix(tint,vec3(.10,.42,.95),floorStream*.85);
   gl_FragColor=vec4(tint,floorRoom*ribbonFacing*clearanceFade*signal*fade*density*(.29+.06*clamp(localSpeed,0.,1.8)));
   #include <colorspace_fragment>
 }`});
 const mesh=new T.Mesh(geometry,material);mesh.name='Wind tunnel smoke';mesh.visible=false;mesh.frustumCulled=false;mesh.raycast=()=>{};
 let elapsed=Infinity,pending=false,received=false,disposed=false,ready=false;
 let latest:FlowState|undefined;
 let smoothSpeed=0,smoothOpening=0,smoothBeta=0,smoothSteer=0,smoothYawRate=0,flowTime=0,appearance=0;
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
   // A ribbon axis and its negation describe the same sheet. Keep successive
   // frames in one hemisphere so interpolation cannot collapse to a zero axis.
   if(received)for(let i=0;i<data.frames.length;i+=4){
     if(oldFrame[i]*data.frames[i]+oldFrame[i+1]*data.frames[i+1]+oldFrame[i+2]*data.frames[i+2]<0){
       data.frames[i]*=-1;data.frames[i+1]*=-1;data.frames[i+2]*=-1;
     }
   }
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
 function submit(){
   if(!ready||pending||!buffers||!latest||disposed)return;
   const request:FlowRequest={type:'step',state:latest,buffers};
   pending=true;worker.postMessage(request,[buffers.positions.buffer,buffers.directions.buffer,buffers.frames.buffer,buffers.transit.buffer,buffers.ratios.buffer]);buffers=undefined;
 }
 // Fetch and pre-integrate once at model load, even when the display is hidden.
 // Reopening uses the resident full-length field and never waits for particles.
 fetch('/vehicles/rb22/airflow-boundary.bin').then(response=>{
   if(!response.ok)throw new Error(`Airflow boundary: ${response.status}`);
   return response.arrayBuffer();
 }).then(buffer=>{
   if(disposed)return;
   const init:FlowRequest={type:'init',parts:[],shapes:shapes.map(s=>s.toArray()),clearance:clearance.image.data as Float32Array,distance:new Int16Array(buffer)};
   worker.postMessage(init,[buffer]);ready=true;submit();
 }).catch(error=>{if(!disposed)console.error(error);});
 return {mesh,uniforms,stats,setVisible(on:boolean){mesh.visible=on;appearance=0;elapsed=Infinity;shownAt=performance.now();stats.firstFrameMs=-1;},dispose(){disposed=true;worker.terminate();uniforms.clearance.value.dispose();geometry.dispose();material.dispose();},
 update(dt:number,speed:number,opening:number,beta:number,frontGap:number,rearGap:number,steer:number,renderDt=dt,yawRate=0){
   if(!mesh.visible&&received)return;
   if(received&&stats.firstFrameMs<0)stats.firstFrameMs=performance.now()-shownAt;
   appearance=Math.min(1,appearance+Math.max(0,renderDt)/.15);
   const damping=received?1-Math.exp(-Math.max(0,renderDt)/.06):1;
   smoothSpeed+=(speed-smoothSpeed)*damping;smoothOpening+=(opening-smoothOpening)*damping;
   smoothYawRate+=(yawRate-smoothYawRate)*damping;flowTime+=Math.max(0,dt);
   smoothBeta+=(beta-smoothBeta)*damping;smoothSteer+=(steer-smoothSteer)*damping;
   uniforms.signal.value=received?appearance*T.MathUtils.smoothstep(smoothSpeed,1,12)*(.35+.65*Math.min(1,smoothSpeed/90)):0;
   uniforms.advection.value+=Math.max(0,smoothSpeed)*dt;
   uniforms.exposure.value=Math.max(0,smoothSpeed)/120;
   uniforms.blend.value=1-(1-uniforms.blend.value)*Math.exp(-Math.max(0,renderDt)/.085);
   elapsed+=renderDt;if(elapsed<1/8 || pending)return;elapsed=0;
   for(let i=0;i<4;i++){uniforms.wheelPose.value[i].toArray(poses[i]);uniforms.wheelAxis.value[i].toArray(axes[i]);}
   latest={speed:smoothSpeed,opening:smoothOpening,beta:smoothBeta,frontGap,rearGap,steer:smoothSteer,yawRate:smoothYawRate,time:flowTime,poses,axes,matrices:[],toChassis:uniforms.toChassis.value.toArray()};
   submit();
 }};
}
