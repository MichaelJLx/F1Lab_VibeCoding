import {Tyre} from './Tyre';
import rig from '../model/wheel-rig.json';
import {MathUtils} from 'three';
import {Suspension,corners,type Corner} from './Suspension';
// Generic, uncalibrated assumptions. Not RB22 factory/tyre data.
export const lateralParameters={mass:800,inertia:1250,frontArm:1.75,rearArm:1.636,frontStiffness:180000,rearStiffness:205000,grip:1.95,steerTime:.045,steerRate:1.6};
/** Single-track lateral force / yaw momentum model, SI units; +left. */
export class LateralDynamics {
 suspension=new Suspension(lateralParameters.mass,lateralParameters.frontArm,lateralParameters.rearArm);
 tyres=Object.fromEntries(corners.map(k=>[k,new Tyre(rig.wheels[k].radius)])) as Record<Corner,Tyre>;
 rearDriveReserve=0;
 private steeringLoss=0;
 longitudinalForce=0;wheelFx:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 steerVelocity=0;steer=0;vy=0;yawRate=0;ay=0;offset=0;headingError=0;acceleration=0;
 reset(){this.steeringLoss=0;this.rearDriveReserve=0;this.suspension.reset();this.longitudinalForce=0;for(const k of corners){this.wheelFx[k]=0;this.tyres[k]=new Tyre(rig.wheels[k].radius);}this.steerVelocity=this.steer=this.vy=this.yawRate=this.ay=this.offset=this.headingError=this.acceleration=0;}
 longitudinalStep(h:number,v:number,request:number,slope:number,verticalAcceleration:number,opening:number){
 const p=lateralParameters;this.suspension.step(h,v,this.acceleration,this.ay,slope,verticalAcceleration,opening);
 const resistance=this.suspension.drag+p.mass*9.81*Math.sin(slope);

 for(const k of corners){
   const front=k[0]==='F',track=front?1.60:1.55;
   const speed=v-this.yawRate*track*.5*(k[1]==='L'?1:-1);
   const fraction=request<0?(front?.57:.43)/2:(front?0:.5);
   const limit=this.suspension.capacity(k,p.grip);
   const lateral=p.mass*Math.abs(this.ay)*this.suspension.loads[k]/Math.max(1,p.mass*9.81+this.suspension.downforce);
   const available=Math.sqrt(Math.max(0,limit*limit-lateral*lateral));
   const transfer=request>0 && !front?MathUtils.clamp((this.tyres.RR.omega-this.tyres.RL.omega)*20,-request*.10,request*.10)*(k==='RL'?1:-1):0;
   this.wheelFx[k]=this.tyres[k].step(h,speed,request*fraction+transfer,available,this.suspension.loads[k]);
 }
 this.longitudinalForce=corners.reduce((sum,k)=>sum+this.wheelFx[k],0);
 this.acceleration=(this.longitudinalForce-this.steeringLoss-resistance)/p.mass;return Math.max(0,v+h*this.acceleration);
 }
 step(h:number,v:number,curvature:number,previewCurvature:number){
 const p=lateralParameters,L=p.frontArm+p.rearArm;
 // Curvature feed-forward, with heading/slip and cross-track feedback.
 const beta=Math.atan2(this.vy,Math.max(v,1));
 const understeer=p.mass/L*(p.rearArm/p.frontStiffness-p.frontArm/p.rearStiffness);
 const look=8+v*.30;
 const wantedCurvature=previewCurvature-2*Math.sin(this.headingError+beta)/look-2*this.offset/(look*look);
 const loadScale=Math.max(1,(p.mass*9.81+this.suspension.downforce)/(p.mass*9.81));
 const command=MathUtils.clamp(Math.atan(L*wantedCurvature)+understeer*v*v*wantedCurvature/loadScale-.12*(this.yawRate-v*wantedCurvature),-.60,.60);
 // Critically damped rack, bounded rate and acceleration. Same state drives visible wheels.
 const rackAcceleration=(command-this.steer)/(p.steerTime*p.steerTime)-2*this.steerVelocity/p.steerTime;
 this.steerVelocity=MathUtils.clamp(this.steerVelocity+MathUtils.clamp(rackAcceleration,-10,10)*h,-p.steerRate,p.steerRate);
 this.steer=MathUtils.clamp(this.steer+this.steerVelocity*h,-.60,.60);
 const u=Math.max(v,3),rearSlip=-Math.atan2(this.vy-p.rearArm*this.yawRate,u);
 const force=(key:Corner,slip:number,stiffness:number)=>{
 const cap=this.suspension.capacity(key,p.grip),limit=Math.sqrt(Math.max(0,cap*cap-this.wheelFx[key]**2));
 const nominal=p.mass*9.81*(key[0]==='F'?p.rearArm:p.frontArm)/L/2;
 const loadRatio=this.suspension.loads[key]/nominal;
 return limit>0?limit*Math.tanh(stiffness*.5*Math.pow(loadRatio,.85)*slip/limit):0;
 };
 const frontForce=(key:'FL'|'FR',x:number)=>{
   const localSpeed=Math.max(3,v-this.yawRate*x);
   const slip=this.wheelAngle(x)-Math.atan2(this.vy+p.frontArm*this.yawRate,localSpeed);
   return force(key,slip,p.frontStiffness);
 };
 const fl=frontForce('FL',.771),fr=frontForce('FR',-.771);
 const dl=this.wheelAngle(.771),dr=this.wheelAngle(-.771);
 const fx=this.wheelFx;
 // Resolve both steered contact forces into the body frame, including trail braking.
 const front=fl*Math.cos(dl)+fr*Math.cos(dr)+fx.FL*Math.sin(dl)+fx.FR*Math.sin(dr);
 const forwardLeft=fx.FL*Math.cos(dl)-fl*Math.sin(dl);
 const forwardRight=fx.FR*Math.cos(dr)-fr*Math.sin(dr);
 this.steeringLoss=fx.FL+fx.FR-forwardLeft-forwardRight;
 const differentialMoment=.771*(forwardRight-forwardLeft)+.733*(fx.RR-fx.RL);
 const rearLeft=force('RL',rearSlip,p.rearStiffness),rearRight=force('RR',rearSlip,p.rearStiffness);
 const rear=rearLeft+rearRight;
 // Equal drive torque per rear wheel: the less loaded tyre sets the usable margin.
 const remaining=(key:Corner,fy:number)=>Math.sqrt(Math.max(0,this.suspension.capacity(key,p.grip)**2-fy**2));
 this.rearDriveReserve=2*Math.min(remaining('RL',rearLeft),remaining('RR',rearRight));
 const dynamicVy=this.vy+h*((front+rear)/p.mass-v*this.yawRate);
 const dynamicYaw=this.yawRate+h*(p.frontArm*front-p.rearArm*rear+differentialMoment)/p.inertia;
 // Smooth low-speed handover avoids singular slip equations at standstill.
 const t=MathUtils.clamp((v-2)/3,0,1),blend=t*t*(3-2*t),kinYaw=v*Math.tan(this.steer)/L,kinVy=p.rearArm*kinYaw;
 this.vy=MathUtils.lerp(kinVy,dynamicVy,blend);this.yawRate=MathUtils.lerp(kinYaw,dynamicYaw,blend);
 this.ay=MathUtils.lerp(v*kinYaw,(front+rear)/p.mass,blend);
 const along=(v*Math.cos(this.headingError)-this.vy*Math.sin(this.headingError))/Math.max(.3,1-curvature*this.offset);
 this.offset+=h*(v*Math.sin(this.headingError)+this.vy*Math.cos(this.headingError));
 this.headingError+=h*(this.yawRate-curvature*along);
 this.headingError=Math.atan2(Math.sin(this.headingError),Math.cos(this.headingError));
 return Math.max(0,along);
 }
 wheelAngle(x:number,rack=this.steer){const L=lateralParameters.frontArm+lateralParameters.rearArm,k=Math.tan(rack)/L;return Math.atan2(L*k,1-k*x);}
}
