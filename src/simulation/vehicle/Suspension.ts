import {nominalGap,platformForces} from './AeroPlatform';
/** Four contact patches and sprung-body heave/roll/pitch. SI, +X left, +Z forward.
 * Parameters are explicit engineering estimates, not team telemetry calibration.
 * Wheel displacement is relative to the local road tangent. */
export const suspensionParameters={cgHeight:.30,rollInertia:210,pitchInertia:1100,frontTrack:1.60,rearTrack:1.55,frontSpring:154000,rearSpring:174000,compressionRatio:.78,reboundRatio:.94,frontAntiRoll:22000,rearAntiRoll:17000,travel:.038,bumpRate:650000,brakeFront:.57,loadExponent:.90};
export type Corner='FL'|'FR'|'RL'|'RR';
export const corners:Corner[]=['FL','FR','RL','RR'];
export function tyreCapacity(load:number,reference:number,mu:number){
 return mu*reference*Math.pow(Math.max(0,load)/reference,suspensionParameters.loadExponent);
}
export function aeroForces(speed:number,opening:number,heave=0,pitch=0){
 return platformForces(speed,opening,nominalGap.front+heave-1.25*pitch,nominalGap.rear+heave+1.25*pitch);
}
export class Suspension {
 frontRoad=0;rearRoad=0;beta=0;
 get frontGap(){return nominalGap.front+this.heave-1.25*this.pitch-this.frontRoad;}
 get rearGap(){return nominalGap.rear+this.heave+1.25*this.pitch-this.rearRoad;}
 roll=0;pitch=0;heave=0;rollRate=0;pitchRate=0;heaveRate=0;frontDownforce=0;downforce=0;drag=0;
 surfaceGrip:Record<Corner,number>={FL:1,FR:1,RL:1,RR:1};
 ground:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 groundRate:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 runout:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 runoutRate:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 hub:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 hubRate:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 loads:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 travel:Record<Corner,number>={FL:0,FR:0,RL:0,RR:0};
 constructor(public mass:number,public a:number,public b:number){this.reset();}
 reset(){this.frontRoad=this.rearRoad=this.beta=0;this.roll=this.pitch=this.heave=this.rollRate=this.pitchRate=this.heaveRate=this.frontDownforce=this.downforce=this.drag=0;for(const k of corners){this.surfaceGrip[k]=1;this.loads[k]=this.mass*9.81*(k[0]==='F'?this.b:this.a)/(this.a+this.b)/2;this.runout[k]=this.runoutRate[k]=this.hub[k]=this.hubRate[k]=this.travel[k]=this.ground[k]=this.groundRate[k]=0;}}
 step(dt:number,speed:number,ax:number,ay:number,slope:number,verticalAcceleration=0,opening=0){
 const steps=Math.ceil(dt*1200);
 for(let i=0;i<steps;i++)this.integrate(dt/steps,speed,ax,ay,slope,verticalAcceleration,opening);
 }
 private integrate(dt:number,speed:number,ax:number,ay:number,slope:number,verticalAcceleration:number,opening:number){
 const p=suspensionParameters,L=this.a+this.b,g=9.81*Math.cos(slope);
 const aero=platformForces(speed,opening,this.frontGap,this.rearGap,this.beta);this.downforce=aero.downforce;this.drag=aero.drag;
 this.frontDownforce=aero.frontDownforce;
 // Torsion resists differential wheel travel. Equal bump at both wheels
 // produces no bar force; left and right reactions always cancel in heave.
 const twistFront=(this.hub.FL-this.hub.FR)/p.frontTrack-this.roll;
 const twistRear=(this.hub.RL-this.hub.RR)/p.rearTrack-this.roll;
 let vertical=0,rollMoment=0,pitchMoment=0;
 for(const key of corners){
 const front=key[0]==='F',x=(key[1]==='L'?1:-1)*(front?p.frontTrack:p.rearTrack)/2,z=front?this.a:-this.b;
 const compression=this.hub[key]-this.heave-this.roll*x+this.pitch*z,rate=this.hubRate[key]-this.heaveRate-this.rollRate*x+this.pitchRate*z;
 const spring=front?p.frontSpring:p.rearSpring,arb=front?p.frontAntiRoll:p.rearAntiRoll;
 // Critical damping per supported corner mass (PhysX Vehicles, suspension tuning).
 const cornerMass=this.mass*(front?this.b:this.a)/(2*L);
 const damper=2*(rate>=0?p.compressionRatio:p.reboundRatio)*Math.sqrt(spring*cornerMass);
 const bump=p.bumpRate*Math.sign(compression)*Math.pow(Math.max(0,Math.abs(compression)-.72*p.travel),1.2);
 // Digressive damping: retain body control at low shaft speed while letting
 // a fast kerb strike move the wheel without an equally sharp body impulse.
 const dampingForce=(velocity:number)=>damper*velocity*(.32+.68/(1+Math.abs(velocity)/.22));
 const stop=2e6*Math.sign(compression)*Math.max(0,Math.abs(compression)-p.travel);
 const extra=spring*compression+dampingForce(rate)+bump+stop+arb*(front?twistFront:twistRear)/(2*x);
 const base=this.mass*g*(front?this.b:this.a)/L/2;
 // Incremental tyre and suspension forces around the static equilibrium.
 const tyreForce=Math.max(-base,850000*(this.ground[key]-this.runout[key]-this.hub[key])+2400*(this.groundRate[key]-this.runoutRate[key]-this.hubRate[key]));
 this.hubRate[key]+=dt*((tyreForce-extra)/32-verticalAcceleration);
 this.hub[key]+=dt*this.hubRate[key];
 this.loads[key]=base+tyreForce;this.travel[key]=compression;
 const reaction=extra;
 vertical+=reaction;
 rollMoment+=x*reaction;pitchMoment-=z*reaction;
 }
 // Skid blocks support the chassis only after physical road contact.
 for(const z of [1.25,-1.25]){
   const gap=z>0?this.frontGap:this.rearGap;
   if(gap<0){const reaction=Math.min(60000,-gap*1.2e6+Math.max(0,-this.heaveRate+z*this.pitchRate)*6000);vertical+=reaction;pitchMoment-=z*reaction;}
 }
 // Aero force applied at its front/rear balance; gravity along slope participates in pitch transfer.
 this.heaveRate+=dt*((vertical-this.downforce)/this.mass-verticalAcceleration);
 this.rollRate+=dt*(rollMoment+this.mass*ay*p.cgHeight)/p.rollInertia;
 this.pitchRate+=dt*(pitchMoment-this.mass*(ax+9.81*Math.sin(slope))*p.cgHeight+this.frontDownforce*this.a-(this.downforce-this.frontDownforce)*this.b)/p.pitchInertia;
 // Limit sprung-body movement to suspension travel and stop velocity into a stop.
 const rollLimit=.12/(Math.max(p.frontTrack,p.rearTrack)/2);
 const pitchLimit=.12/Math.max(this.a,this.b);
 const limit=(value:number,maximum:number)=>Math.max(-maximum,Math.min(maximum,value));
 this.heave=limit(this.heave+dt*this.heaveRate,.12);
 this.roll=limit(this.roll+dt*this.rollRate,rollLimit);
 this.pitch=limit(this.pitch+dt*this.pitchRate,pitchLimit);
 if(this.heave*this.heaveRate>0 && Math.abs(this.heave)>=.12)this.heaveRate=0;
 if(this.roll*this.rollRate>0 && Math.abs(this.roll)>=rollLimit)this.rollRate=0;
 if(this.pitch*this.pitchRate>0 && Math.abs(this.pitch)>=pitchLimit)this.pitchRate=0;
 }
 capacity(key:Corner,mu:number){const reference=this.mass*9.81*(key[0]==='F'?this.b:this.a)/(this.a+this.b)/2;return tyreCapacity(this.loads[key],reference,mu*this.surfaceGrip[key]);}
 longitudinal(request:number,mu:number,lateralAcceleration:number){
 const f=suspensionParameters.brakeFront/2,r=(1-suspensionParameters.brakeFront)/2;
 const fractions=request<0?{FL:f,FR:f,RL:r,RR:r}:{FL:0,FR:0,RL:.5,RR:.5};
 const forces={} as Record<Corner,number>;
 for(const k of corners){const capacity=this.capacity(k,mu);const lateral=this.mass*Math.abs(lateralAcceleration)*this.loads[k]/Math.max(1,this.mass*9.81+this.downforce);const cap=Math.sqrt(Math.max(0,capacity**2-lateral**2));forces[k]=Math.max(-cap,Math.min(cap,request*fractions[k]));}
 return forces;
 }
}
