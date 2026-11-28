// SI internally; displayed inflation and mean footprint pressure are gauge kPa.
// Generic estimates for a dry slick; no supplier calibration.
import {tyreCompounds,type TyreCompound} from './TyreCompound';
export class Tyre{
 compound:TyreCompound='soft';
 omega=0;angle=0;slip=0;temperature=80;pressure=160;contactPressure=0;
 readonly heat=new Float32Array(48);
 readonly wear=new Float32Array(48);
 degradation=0;wearEnabled=false;lateralG=0;
 locked=false; lateralSlip=0; lateralForce=0; smokePower=0;
 // Fixed-size material-space scars: radians and metres, independent of tyre life wear.
 readonly flatSpots=Array.from({length:8},()=>({phase:0,depth:0}));
 private scar=0; private cursor=0;
 runout=0;runoutRate=0;
 clearFlatSpots(){this.flatSpots.forEach(s=>s.depth=0);this.cursor=this.scar=0;this.wear.fill(0);this.heat.fill(0);this.runout=this.runoutRate=this.smokePower=0;this.locked=false;}
 depthAt(phase:number){
   let depth=0;
   for(const s of this.flatSpots){if(s.depth<=0)continue;const c=Math.cos(phase-s.phase);if(c>0)depth=Math.max(depth,this.radius-(this.radius-s.depth)/c);}
   return depth;
 }
 get grip(){return tyreCompounds[this.compound].grip*(this.wearEnabled?1-.3*this.degradation:1);}
 replace(){this.degradation=0;this.temperature=80;this.pressure=160;this.clearFlatSpots();}
 constructor(readonly radius:number){}
 step(dt:number,v:number,demand:number,capacity:number,load:number){
   const r=this.radius,inertia=1.45;
   // Implicit linear creep at low slip, saturated by the remaining friction ellipse.
   capacity*=1-.08*Math.min(1,Math.abs(this.slip));
   const stiffness=capacity*12/Math.max(2,Math.abs(v));
   const free=this.omega+dt*r*demand/inertia;
   const force=Math.max(-capacity,Math.min(capacity,stiffness*(free*r-v)/(1+dt*r*r*stiffness/inertia)));
   this.omega=Math.max(0,this.omega+dt*r*(demand-force)/inertia);
   this.angle=(this.angle+this.omega*dt)%(2*Math.PI);
   const sliding=this.omega*r-v;
   this.slip=sliding/Math.max(2,v);
   const wasLocked=this.locked;
   this.locked=v>5 && this.slip<-.8 && demand<0 && load>100;
   if(this.locked && !wasLocked){
     let nearest=-1,distance=.12;
     this.flatSpots.forEach((s,i)=>{const d=Math.abs(Math.atan2(Math.sin(this.angle-s.phase),Math.cos(this.angle-s.phase)));if(s.depth>0 && d<distance){nearest=i;distance=d;}});
     this.scar=nearest>=0?nearest:this.cursor++%this.flatSpots.length;
     if(nearest<0){this.flatSpots[this.scar].phase=this.angle;this.flatSpots[this.scar].depth=0;}
   }
   const power=Math.abs(force*sliding);
   const lateralPower=Math.abs(this.lateralForce*v*Math.sin(this.lateralSlip));
   const smoking=load>100 && (Math.abs(v)>5 || this.omega*r>8) && (this.locked || (this.slip>.3 && demand>0) || Math.abs(this.lateralSlip)>.22);
   const smokeTarget=smoking?power+lateralPower:0;
   this.smokePower+=(smokeTarget-this.smokePower)*(1-Math.exp(-dt/.035));
   if(!smoking)this.smokePower=0;
   if(this.locked){
     // A still-sliding wheel moves the scar centre only while it is nearly stopped.
     const scar=this.flatSpots[this.scar];
     if(Math.abs(Math.atan2(Math.sin(this.angle-scar.phase),Math.cos(this.angle-scar.phase)))>.10){this.scar=this.cursor++%8;this.flatSpots[this.scar].phase=this.angle;this.flatSpots[this.scar].depth=0;}
     this.flatSpots[this.scar].depth=Math.min(.006,this.flatSpots[this.scar].depth+power*dt*2e-9);
   }
   const previous=this.runout;this.runout=this.depthAt(this.angle);this.runoutRate=(this.runout-previous)/Math.max(dt,1e-6);
   if(this.locked)for(let i=0;i<this.wear.length;i++)this.wear[i]=this.depthAt((i+.5)*2*Math.PI/this.wear.length);
   this.degradation=this.wearEnabled?Math.min(1,this.degradation+dt*tyreCompounds[this.compound].wear*(Math.abs(v)/300000+Math.abs(this.slip)*.0008+Math.abs(this.lateralG)*.00005)):0;
   this.temperature+=dt*(power/24000-(this.temperature-80)/65);
   this.temperature=Math.max(60,Math.min(160,this.temperature));
   const inflation=261.3*(this.temperature+273.15)/353.15-101.3+Math.min(12,Math.max(-4,(load-2800)/1000));
   this.pressure+=(Math.max(120,Math.min(260,inflation))-this.pressure)*(1-Math.exp(-dt/ .08));
   // A carcass carries part of the load. Footprint grows sublinearly with load.
   const area=Math.min(.045,.016*(160/this.pressure)*(load/2800)**.84);
   this.contactPressure+=((area>0?Math.min(1200,Math.max(0,load/area/1000)):0)-this.contactPressure)*(1-Math.exp(-dt/.06));
   const index=this.patch;
   const cooling=Math.exp(-dt*(.9+this.pressure/320));
   for(let i=0;i<this.heat.length;i++)this.heat[i]*=cooling;
   const overload=Math.max(0,(this.contactPressure-this.pressure-55)/100);
   this.heat[index]=Math.min(1,this.heat[index]+dt*overload*6);
   if(demand<0 && load>0){
     this.heat[index]=Math.min(1,this.heat[index]+dt*power*this.contactPressure/350000);

   }
   return force;
 }
 get patch(){return Math.floor(this.angle/(2*Math.PI)*48)%48;}
}
