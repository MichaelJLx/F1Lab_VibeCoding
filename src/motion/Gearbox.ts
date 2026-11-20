import rig from '../model/wheel-rig.json';

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
export function plannedForce(speed:number){
 return Math.max(...ratios.map((_,index)=>forceAt(speed,index)));
}
export class Gearbox{
 // Estimated equivalent wheel-side split; electric output is part of the 660 kW curve.
 energy=5e6;electricKw=0;driveKw=0;
 account(dt:number,speed:number,force:number){
   const power=force*speed;
   const electric=power>0?Math.min(power*.26,180000,this.energy/dt):Math.max(power*.45,-220000,-(5e6-this.energy)/dt);
   this.energy=Math.max(0,Math.min(5e6,this.energy-electric*dt));
   this.electricKw=electric/1000;this.driveKw=power/1000;
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
   return .74*force+Math.min(.26*force,this.energy/(dt*Math.max(1,speed)));
 }
}
