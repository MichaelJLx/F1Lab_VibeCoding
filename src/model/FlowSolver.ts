import * as T from 'three';
import {platformForces} from '../motion/AeroPlatform';
import {wingCp} from './WingPressure';
import {flowBoundary} from './FlowBoundary';
import {RibbonFrame} from './RibbonFrame';
import {steps,seeds,bodies,ribbonVertices} from './FlowLayout';
import type {FlowPart,FlowState,FlowBuffers} from './FlowProtocol';

// The full field and triangle clearance solve run off the rendering thread.
export function createFlowSolver(parts:FlowPart[],sizes:number[][]){
 const root=new T.Group();
 const meshes=parts.map(part=>{
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(part.positions,3));
   if(part.indices)geometry.setIndex(new T.BufferAttribute(part.indices,1));
   const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(part.matrix);root.add(mesh);return mesh;
 });
 const boundary=flowBoundary(root),shapes=sizes.map(v=>new T.Vector2().fromArray(v));
 const poses=Array.from({length:4},()=>new T.Vector4()),axes=Array.from({length:4},()=>new T.Vector3());
 const offset=new T.Vector3(),radial=new T.Vector3(),normal=new T.Vector3();
 const velocity=new T.Vector3(),mid=new T.Vector3(),p=new T.Vector3(),edge=new Float32Array(65);
 const previousVelocity=new T.Vector3(),projectionVelocity=new T.Vector3(),boundaryPoint=new T.Vector3(),tangent=new T.Vector3();
 const frame=new RibbonFrame(),incoming=new T.Vector3(),outgoing=new T.Vector3();
 const path=Array.from({length:steps+1},()=>new T.Vector3()),smooth=path.map(()=>new T.Vector3());
 const speeds=new Float32Array(steps+1),travel=new Float32Array(steps+1);
 return (state:FlowState,buffers:FlowBuffers)=>{
   const {speed,opening,beta,frontGap,rearGap,steer}=state;
   for(let i=0;i<4;i++){poses[i].fromArray(state.poses[i]);axes[i].fromArray(state.axes[i]);}
   meshes.forEach((mesh,i)=>mesh.matrix.fromArray(state.matrices[i]));boundary.sync(root);
   const aero=platformForces(speed,opening,frontGap,rearGap,beta);
   const turbulence=Math.max(T.MathUtils.smoothstep(speed,25,65),T.MathUtils.smoothstep(Math.abs(steer),.08,.28)*T.MathUtils.smoothstep(speed,8,25));
   const incident=Math.tan(T.MathUtils.clamp(beta,-.22,.22));
   let axialRatio=1;
   // Wake deficit from drag momentum, using an expanding Gaussian pair.
   const dragArea=speed>.01?aero.drag/(.5*1.225*speed*speed):0;
   // Bernoulli edge speed derived from tunnel pressure taps; resample once per field update.
   for(let i=0;i<65;i++)edge[i]=Math.sqrt(Math.max(.015,1-wingCp(i/64,true,opening)));
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
     vy+=.15*aero.frontWing*wing(2.24,.19,.47)+.32*aero.rearWing*wing(-2.54,.86,.91);
     if(y<.19)forward+=span*wingSpeed((2.68-z)/.60,y-.19);
     if(y<.86)forward+=span*wingSpeed((-1.92-z)/.68,y-.86);
     const floor=Math.exp(-Math.pow((y-.06)/.12,2)-Math.pow(x/.66,4));
     forward+=floor*.35*(aero.frontFloor+aero.rearFloor)*Math.exp(-Math.pow((z+.15)/1.6,4));
     vy+=floor*.24*aero.rearFloor*Math.exp(-Math.pow((z+1.85)/.65,2));
     // Finite-core streamwise vortices. An opposite mirror vortex below the
     // road cancels normal velocity at the ground. Positions are model estimates.
     const side=x>=0?1:-1;
     const sidepod=Math.exp(-Math.pow((Math.abs(x)-.62)/.23,2)-((z+.35)/1.05)**2-((y-.55)/.3)**2);
     vy-=.13*sidepod;forward+=.18*sidepod;
     vx+=side*.08*aero.frontWing*Math.exp(-Math.pow((z-2.18)/.6,2)-((Math.abs(x)-.83)/.28)**2-((y-.3)/.4)**2);
     const spine=Math.exp(-Math.pow((y-.91)/.25,2)-((z+.75)/1.1)**2);
     vx-=x*.10*spine;

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
       const strength=turbulence*side*circulation*(-Math.expm1(-age/.15))*Math.exp(-age/length);
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
         const strength=turbulence*side*.047*aero.rearWing*(1-Math.exp(-behind*4))/(core*core+dx*dx+dy*dy);
         vx-=strength*dy;vy+=strength*dx;
       }
     }
     // Analytic curl of a smooth vector potential, restricted to the wake.
     // Divergence-free perturbation avoids uncorrelated per-point jitter.
     if(z<-2.65){
       const age=-z-2.65,envelope=(1-Math.exp(-age*age))*Math.exp(-age/4);
       const a=1.7*x+.5*z,b=1.3*y-.8*z,c=1.1*z+.7*x;
       const curlX=-1.1*Math.cos(c);
       const curlY=-.8*Math.cos(b)-1.7*Math.cos(a);
       const curlZ=.7*Math.cos(c)-1.3*Math.cos(b);
       vx+=envelope*(.065*turbulence*curlX+.035*x);
       vy+=envelope*(.065*turbulence*curlY+.055*aero.rearFloor);
       forward+=envelope*.04*turbulence*curlZ;
     }
     axialRatio=Math.max(.25,forward);
     velocity.set(vx/axialRatio,vy/axialRatio,-1);
     // Oriented finite cylinders follow the actual four wheel hubs and steering.
     for(let i=0;i<4;i++){
       const wheel=poses[i],axis=axes[i],shape=shapes[i];
       offset.set(point.x-wheel.x,point.y-wheel.y,point.z-wheel.z);
       const axial=offset.dot(axis);
       radial.copy(offset).addScaledVector(axis,-axial);
       const r=radial.length(),qAxial=Math.abs(axial)-shape.y,qRadial=r-shape.x;
       const distance=Math.hypot(Math.max(0,qAxial),Math.max(0,qRadial))+Math.min(0,Math.max(qAxial,qRadial));
       if(distance<.42 && distance>-.4){
         radial.multiplyScalar(1/Math.max(r,.001));
         if(qAxial>0 && qRadial>0)normal.copy(axis).multiplyScalar(Math.sign(axial)*qAxial).addScaledVector(radial,qRadial).normalize();
         else normal.copy(qAxial>qRadial?axis:radial).multiplyScalar(qAxial>qRadial?Math.sign(axial)||1:1);
         const inward=velocity.dot(normal);
         if(inward<0)velocity.addScaledVector(normal,-inward*(1-T.MathUtils.smoothstep(distance,.07,.42)));
         // Deflect upstream flow toward the top and outer shoulder before contact.
         const influence=Math.exp(-Math.max(0,distance-.06)/.12)*(1-T.MathUtils.smoothstep(distance,.32,.42));
         if(point.z>wheel.z){velocity.y+=.065*influence;velocity.x+=Math.sign(wheel.x)*.10*influence;}
         // Low streams must go around the shoulder, never into the contact wedge.
         if(point.y<wheel.y-.16){velocity.addScaledVector(axis,(Math.sign(axial)||Math.sign(wheel.x))*.55*influence);velocity.y=Math.max(0,velocity.y);}

       }
       const age=wheel.z-point.z;
       if(age> .36){
         const spread=.20+.1*age;
         velocity.z*=1-.20*Math.exp(-age/1.5-((point.x-wheel.x)/spread)**2-((point.y-wheel.y)/spread)**2);
       }
     }
     // Query boundary direction without moving the integration sample.
     boundaryPoint.copy(point);boundary.repel(boundaryPoint,velocity);
     return velocity;
   }
   // Preserve downstream station while projecting out of the wheel/road wedge.
   function project(point:T.Vector3){
     const station=point.z;
     point.y=Math.max(.025,point.y);
     for(let pass=0;pass<2;pass++){
       for(let i=0;i<4;i++){
         const wheel=poses[i],axis=axes[i],shape=shapes[i];
         offset.set(point.x-wheel.x,point.y-wheel.y,point.z-wheel.z);
         const axial=offset.dot(axis);radial.copy(offset).addScaledVector(axis,-axial);
         const margin=point.y<wheel.y-.16?.105:.075;
         const qa=Math.abs(axial)-shape.y,qr=radial.length()-shape.x;
         const distance=Math.hypot(Math.max(0,qa),Math.max(0,qr))+Math.min(0,Math.max(qa,qr));
         if(distance>=margin)continue;
         if(point.y<wheel.y-.12){
           // Keep the current side of the tyre: an inner stream must not jump
           // across the entire tread to the outer shoulder during projection.
           const sign=Math.sign(axial)||Math.sign(wheel.x*axis.x)||1;
           point.x+=(sign*(shape.y+margin)-axial)/(Math.sign(axis.x)*Math.max(.75,Math.abs(axis.x)));
         }else{
           normal.copy(qa>qr?axis:radial).multiplyScalar(qa>qr?(Math.sign(axial)||1):1);
           normal.z=0;
           if(normal.lengthSq()<.01)normal.set(Math.sign(wheel.x),.5,0);
           normal.normalize();point.addScaledVector(normal,Math.min(.10,margin-distance));
         }
       }
       projectionVelocity.set(0,0,0);boundary.repel(point,projectionVelocity);
       point.z=station;point.y=Math.max(.025,point.y);
     }
   }
   let index=0;
   for(const [x,y,inlet] of seeds){
     const step=(inlet+4.55)/steps;
     p.set(x,y,inlet);let upstreamMetres=0;previousVelocity.set(-incident,0,-1).normalize();
     for(let i=0;i<=steps;i++){
       project(p);path[i].copy(p);field(p);
       speeds[i]=axialRatio*velocity.length();travel[i]=upstreamMetres;
       mid.copy(p).addScaledVector(velocity,step*.5);field(mid);
       velocity.normalize();
       velocity.lerp(previousVelocity,.42).normalize();
       const angle=previousVelocity.angleTo(velocity),limit=.06;
       if(angle>limit)velocity.lerp(previousVelocity,1-limit/angle).normalize();
       previousVelocity.copy(velocity);
       const dz=Math.max(.25,-velocity.z);
       p.addScaledVector(velocity,step/dz);p.z=inlet-(i+1)*step;
       upstreamMetres+=step/axialRatio;
     }
     // Cubic B-spline smoothing, followed by another clearance projection.
     // Geometry tangents below are derived from this final path, not the raw field.
     for(let pass=0;pass<24;pass++){
       smooth[0].copy(path[0]);smooth[steps].copy(path[steps]);
       for(let i=1;i<steps;i++){
         smooth[i].copy(path[i-1]).addScaledVector(path[i],4).add(path[i+1]).multiplyScalar(1/6);
         project(smooth[i]);
       }
       for(let i=0;i<=steps;i++)path[i].copy(smooth[i]);
     }
     for(let i=0;i<=steps;i++){
       tangent.copy(path[Math.min(steps,i+1)]).sub(path[Math.max(0,i-1)]).normalize();
       if(i===0)frame.reset(tangent);else frame.advance(tangent);
       incoming.copy(path[i]).sub(path[Math.max(0,i-1)]);outgoing.copy(path[Math.min(steps,i+1)]).sub(path[i]);
       const turn=i>0&&i<steps?incoming.angleTo(outgoing):0;
       // Limit cross-section width to local bend radius: adjacent strips cannot
       // fold across the inside of a tight turn even near a sharp wing edge.
       const span=Math.max(.002,Math.min(incoming.length()||.1,outgoing.length()||.1));
       const width=Math.min(.082+.045*T.MathUtils.smoothstep(i/steps,0,1),.28*span/Math.max(.008,turn));
       for(let j=0;j<ribbonVertices;j++){
         frame.normal.toArray(buffers.frames,index*4);buffers.frames[index*4+3]=width;
         const k=index*3;buffers.transit[index]=travel[i];buffers.ratios[index]=speeds[i];
         path[i].toArray(buffers.positions,k);tangent.toArray(buffers.directions,k);index++;
       }
     }
   }
   return buffers;
 };
}
