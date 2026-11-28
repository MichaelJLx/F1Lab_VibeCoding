import * as T from 'three';
import {platformForces} from '../../simulation/vehicle/AeroPlatform';
import {wingCp} from '../pressure/WingPressure';
import {distanceBoundary} from './DistanceBoundary';
import {flowBoundary} from './FlowBoundary';
import {RibbonFrame} from './RibbonFrame';
import {steps,seeds,bodies,ribbonVertices} from './FlowLayout';
import type {FlowPart,FlowState,FlowBuffers} from './FlowProtocol';

// The full field and triangle clearance solve run off the rendering thread.
export function createFlowSolver(parts:FlowPart[],sizes:number[][],clearance?:Float32Array,distance?:Int16Array){
 const toChassis=new T.Matrix4(),fromChassis=new T.Matrix4(),channelPoint=new T.Vector3();
 const root=new T.Group();
 const meshes=(distance?[]:parts).map(part=>{
   const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(part.positions,3));
   if(part.indices)geometry.setIndex(new T.BufferAttribute(part.indices,1));
   const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(part.matrix);root.add(mesh);return mesh;
 });
 const grid=distance?distanceBoundary(distance):null;
 const displacementBodies=grid?[]:bodies;
 const boundary=grid??flowBoundary(root),shapes=sizes.map(v=>new T.Vector2().fromArray(v));
 // Conservative, slope-limited floor envelope, built once from the mesh raster.
 const floorLeft=new Float32Array(160),floorRight=new Float32Array(160);
 for(let row=0;row<160;row++){
   let left=.70,right=.70;
   for(let other=0;other<160;other++){
     const allowance=Math.abs(row-other)*6/160*.35;
     left=Math.min(left,-(clearance?.[other*256+2]??-.7)-.025+allowance);
     right=Math.min(right,(clearance?.[other*256+3]??.7)-.025+allowance);
   }
   floorLeft[row]=Math.max(.15,left);floorRight[row]=Math.max(.15,right);
 }
 function floorWidth(z:number,side:number){
   const t=T.MathUtils.clamp((z+3)/6*160-.5,0,159),i=Math.min(158,Math.floor(t)),values=side<0?floorLeft:floorRight;
   return T.MathUtils.lerp(values[i],values[i+1],t-i);
 }
 const poses=Array.from({length:4},()=>new T.Vector4()),axes=Array.from({length:4},()=>new T.Vector3());
 const offset=new T.Vector3(),radial=new T.Vector3(),normal=new T.Vector3();
 const velocity=new T.Vector3(),mid=new T.Vector3(),p=new T.Vector3(),edge=new Float32Array(65);
 const wheelSide=new Float32Array(4),wheelOver=new Uint8Array(4);
 const previousVelocity=new T.Vector3(),projectionVelocity=new T.Vector3(),boundaryPoint=new T.Vector3(),tangent=new T.Vector3();
 const frame=new RibbonFrame(),incoming=new T.Vector3(),outgoing=new T.Vector3();
 const path=Array.from({length:steps+1},()=>new T.Vector3()),smooth=path.map(()=>new T.Vector3());
 const speeds=new Float32Array(steps+1),travel=new Float32Array(steps+1);
 return (state:FlowState,buffers:FlowBuffers)=>{
   const {speed,opening,beta,frontGap,rearGap,steer}=state;
   if(state.toChassis)toChassis.fromArray(state.toChassis);else toChassis.identity();
   fromChassis.copy(toChassis).invert();
   for(let i=0;i<4;i++){poses[i].fromArray(state.poses[i]);axes[i].fromArray(state.axes[i]);}
   meshes.forEach((mesh,i)=>mesh.matrix.fromArray(state.matrices[i]));if(grid)grid.sync(state);else (boundary as ReturnType<typeof flowBoundary>).sync(root);
   const aero=platformForces(speed,opening,frontGap,rearGap,beta);
   const turbulence=Math.max(T.MathUtils.smoothstep(speed,25,65),T.MathUtils.smoothstep(Math.abs(steer),.08,.28)*T.MathUtils.smoothstep(speed,8,25));
   // Relative air velocity includes rotation about the car's CG, not camera yaw.
   const rotation=T.MathUtils.clamp((state.yawRate??0)/Math.max(8,speed),-.09,.09);
   const phase=(state.time??0)*.7;
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
     let vx=-incident-rotation*z,vy=0,forward=Math.max(.7,1-rotation*x);
     for(const [cx,cy,cz,rx,ry,rz] of displacementBodies){
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
     const wheelCentre=side*.77-wheelDistance*(incident+rotation*1.69+.35*Math.sin(steer));
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
       const a=1.7*x+.5*z-phase,b=1.3*y-.8*z+phase*.71,c=1.1*z+.7*x-phase*.83;
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
   function project(point:T.Vector3,body=true){
     const station=point.z;
     point.y=Math.max(.025,point.y);
     for(let pass=0;pass<2;pass++){
       for(let i=0;i<4;i++){
         const wheel=poses[i],axis=axes[i],shape=shapes[i];
         const dz=point.z-wheel.z,dy=point.y-wheel.y;
         const radius=shape.x+.075;
         if(wheelOver[i]){
           const reach=radius+shape.y*Math.abs(axis.z);
           if(Math.abs(dz)>reach+.35||Math.abs(point.x-wheel.x)>shape.y+.12)continue;
           // Smooth upper shoulder rather than switching between cylinder normals.
           const top=wheel.y+Math.sqrt(Math.max(.002,radius*radius-Math.min(radius*radius-.002,dz*dz)));
           const influence=1-T.MathUtils.smoothstep(Math.abs(dz),reach-.12,reach+.35);
           const delta=top-point.y;
           point.y+=.5*(delta+Math.sqrt(delta*delta+.000025))*influence;
         }else{
           if(Math.abs(dy)>radius)continue;
           const reach=Math.sqrt(Math.max(0,radius*radius-dy*dy))+shape.y*Math.abs(axis.z);
           if(Math.abs(dz)>reach+.40)continue;
           const sign=wheelSide[i];
           const face=wheel.x+(sign*(shape.y+.075)-axis.y*dy-axis.z*dz)/axis.x;
           const delta=sign*(face-point.x);
           const influence=1-T.MathUtils.smoothstep(Math.abs(dz),reach+.02,reach+.40);
           point.x+=sign*.5*(delta+Math.sqrt(delta*delta+.000025))*influence;
         }
       }
       if(body&&pass===0){projectionVelocity.set(0,0,0);boundary.repel(point,projectionVelocity);}
       point.z=station;point.y=Math.max(.025,point.y);
     }
   }
   let index=0,probe=0;
   for(const [x,y,inlet] of seeds){
     const underfloor=y<.1,seedPhase=probe++*2.399;
     for(let w=0;w<4;w++){
       wheelSide[w]=Math.sign((x-poses[w].x)*axes[w].x)||Math.sign(poses[w].x);
       wheelOver[w]=y>poses[w].y+.20&&Math.abs(x-poses[w].x)<shapes[w].y+.1?1:0;
     }
     const step=(inlet+4.55)/steps;
     if(underfloor){
       // A separate channel field: external tyre/body exclusion must never push
       // Venturi flow outside the floor. Sample the actual underside silhouette.
       let distance=0;
       for(let i=0;i<=steps;i++){
         const z=inlet-i*step;
         const diffuser=T.MathUtils.smoothstep(-z,1.4,2.7);
         const wake=T.MathUtils.smoothstep(-z,2.8,4.55);
         channelPoint.set(x,.04,z).applyMatrix4(toChassis);
         const row=Math.max(0,Math.min(159,Math.floor((channelPoint.z+3)/6*160)));
         const side=x<0?-1:1,edge=floorWidth(channelPoint.z,side);
         const shoulder=1-.24*Math.exp(-(((Math.abs(z)-1.69)/.38)**2));
         const width=Math.max(.15,Math.min(.70,edge))*shoulder;
         // Pressure imbalance displaces confined flow gradually. Bounded normalized
         // coordinates keep the plume on its side of the plank even at large yaw.
         const age=inlet-z,localIncidence=incident+rotation*z;
         const entry=T.MathUtils.smootherstep(age,0,2.2);
         const wander=.024*Math.sin(z*1.15+seedPhase-phase)*turbulence;
         const fraction=T.MathUtils.clamp(Math.abs(x)/.85-side*localIncidence*.85*entry+wander,.10,.94);
         const channelX=side*(.14+fraction*Math.max(0,width-.14));
         const enter=T.MathUtils.smootherstep(inlet-z,.4,1.5);
         channelPoint.x=T.MathUtils.lerp(x,channelX,enter);
         const col=Math.max(0,Math.min(63,Math.floor((channelPoint.x+1.2)/2.4*64)));
         const base=4*(row*64+col),bottom=clearance?.[base],top=clearance?.[base+1];
         let ceiling=T.MathUtils.lerp(frontGap,rearGap,T.MathUtils.smoothstep(-z,-1.4,1.4))+.12*diffuser;
         if(bottom!==undefined && top!==undefined && bottom<=top){channelPoint.y=bottom-.006;ceiling=Math.min(ceiling,channelPoint.applyMatrix4(fromChassis).y);}
         else channelPoint.applyMatrix4(fromChassis);
         const gap=Math.max(.012,ceiling);
         p.set(channelPoint.x,.011+(gap-.011)*(.38+.12*Math.sin(seedPhase)+.20*diffuser+.035*turbulence*Math.sin(z*1.3+seedPhase-phase)),z);
         p.x+=wake*(side*.12-incident*.55-rotation*.7+.035*turbulence*Math.sin(z*1.5+seedPhase-phase));p.y+=wake*(.10+.045*Math.sin(z*2+side))*(1-.5*opening);
         const load=T.MathUtils.clamp((aero.frontFloor+aero.rearFloor)*.5,.25,1.5);
         const imbalance=T.MathUtils.clamp(1-side*localIncidence*1.8,.65,1.35);
         path[i].copy(p);speeds[i]=1+.65*load*imbalance*Math.exp(-(((z+.2)/1.3)**2))+.18*diffuser-.35*wake;
         travel[i]=distance;distance+=step/speeds[i];
       }
     }

     p.set(x,y,inlet);let upstreamMetres=0;previousVelocity.set(-incident,0,-1).normalize();
     if(!underfloor)for(let i=0;i<=steps;i++){
       project(p);path[i].copy(p);field(p);
       speeds[i]=axialRatio*velocity.length();travel[i]=upstreamMetres;
       mid.copy(p).addScaledVector(velocity,step*.5);field(mid);
       velocity.normalize();
       velocity.lerp(previousVelocity,.42).normalize();
       const angle=previousVelocity.angleTo(velocity),limit=step*3.1;
       if(angle>limit)velocity.lerp(previousVelocity,1-limit/angle).normalize();
       previousVelocity.copy(velocity);
       const dz=Math.max(.25,-velocity.z);
       p.addScaledVector(velocity,step/dz);p.z=inlet-(i+1)*step;
       upstreamMetres+=step/axialRatio;
     }
     // Project early smoothing passes; finish with unconstrained smoothing to avoid
     // reintroducing wheel-boundary corners. Shader clearance fades the ribbon skin.
     // Geometry tangents below are derived from this final path, not the raw field.
     for(let pass=0;pass<(underfloor?16:28);pass++){
       smooth[0].copy(path[0]);smooth[steps].copy(path[steps]);
       for(let i=1;i<steps;i++){
         smooth[i].copy(path[i-1]).addScaledVector(path[i],4).add(path[i+1]).multiplyScalar(1/6);
         if(!underfloor&&pass<12)project(smooth[i],pass===11);
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
       let width=underfloor?(.078+.028*(.5+.5*Math.sin(seedPhase))+.038*T.MathUtils.smoothstep(i/steps,.2,1))*(1+.10*Math.sin(travel[i]*1.2+seedPhase-phase)):Math.min(.14+.085*T.MathUtils.smoothstep(i/steps,0,1),.32*span/Math.max(.008,turn));
       if(underfloor && path[i].z<2.25 && path[i].z> -2.7){
         channelPoint.copy(path[i]).applyMatrix4(toChassis);
         const row=Math.max(0,Math.min(159,Math.floor((channelPoint.z+3)/6*160)));
         const lo=clearance?clearance[row*64*4+2]:-.7,hi=clearance?clearance[row*64*4+3]:.7;
         const room=Math.min(channelPoint.x-lo,hi-channelPoint.x,Math.abs(channelPoint.x)-.14);
         width=Math.min(width,Math.max(.008,room-.012));
       }
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
