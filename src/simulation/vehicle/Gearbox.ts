import rig from '../../../vehicles/rb22/rig/wheels.json';

// Estimated overall ratios (including final drive) and effective power-unit torque.
export const shiftRpm=11400;
const ratios=[16.0,12.39,9.81,8.11,6.84,5.98,5.29,4.73];
const radius=(rig.wheels.RL.radius+rig.wheels.RR.radius)/2;
function rpmAt(speed:number,index:number){return speed/radius*60/(2*Math.PI)*ratios[index];}
function forceAt(speed:number,index:number){
 const rpm=Math.max(5000,rpmAt(speed,index));
 const torque=Math.min(650,660000/(rpm*2*Math.PI/60))*Math.min(1,.65+rpm/20000);
 return torque*ratios[index]/radius*Math.max(0,Math.min(1,(14800-rpm)/800));
}
export function plannedForce(speed:number,deployment=true){
 return Math.max(...ratios.map((_,index)=>forceAt(speed,index)))*(deployment?1:.74);
}
export class Gearbox{
 // Estimated equivalent wheel-side split; electric output is part of the 660 kW curve.
 consumption=false;deploymentAllowed=true;energy=5e6;
 electricKw=0;driveKw=0;
 private combustionForce=0;
 coastRecoveryForce(speed:number){
   // Rear-axle generator torque, applied to tyre contact forces by the integrator.
   return this.consumption&&this.energy<5e6&&speed>5?Math.min(1000,60000/speed)*Math.min(1,(speed-5)/10):0;
 }
 account(speed:number,force:number,dt=0,rearForce=0){
   this.driveKw=force*speed/1000;
   const recovering=this.throttle<=.03||this.brake>.01;
   this.electricKw=force>=0?(this.deploymentAllowed?Math.min(180,Math.max(0,force-this.combustionForce)*speed/1000):0):recovering?-Math.min(300,Math.max(0,-rearForce*speed)*.9/1000):0;
   if(!this.consumption){this.energy=5e6;this.electricKw=Math.max(0,this.electricKw);return;}
   // Report energy actually accepted/delivered, including full/empty battery limits.
   if(dt>0)this.electricKw=Math.max(-(5e6-this.energy)/(1000*dt),Math.min(this.energy/(1000*dt),this.electricKw))||0;
   this.energy=this.consumption?Math.max(0,Math.min(5e6,this.energy-this.electricKw*1000*dt)):5e6;
 }
 index=0;rpm=5000;shift=0;throttle=0;brake=0;
 update(dt:number,speed:number){
   this.shift=Math.max(0,this.shift-dt);
   if(!this.shift){
     const rpm=rpmAt(speed,this.index);
     if(rpm>=shiftRpm && this.index<7){this.index++;this.shift=.065;}
     else if(this.index>0 && rpmAt(speed,this.index-1)<9900){this.index--;this.shift=.065;}
   }
   this.rpm=Math.round(Math.max(5000,rpmAt(speed,this.index)));
   const force=forceAt(speed,this.index)*(this.shift>0?.38:1);
   this.combustionForce=.74*force;
   return this.combustionForce+(this.deploymentAllowed?.26*force:0)*(this.consumption?Math.min(1,this.energy/500000):1);
 }
}
