// SI internally; displayed inflation and mean footprint pressure are gauge kPa.
// Generic estimates for a dry slick; no supplier calibration.
export class Tyre{
 omega=0;angle=0;slip=0;temperature=80;pressure=160;contactPressure=0;
 readonly heat=new Float32Array(48);
 readonly wear=new Float32Array(48);
 degradation=0;wearEnabled=false;lateralG=0;
 locked=false;
 get grip(){return this.wearEnabled?1-.3*this.degradation:1;}
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
   this.locked=v>5 && this.slip<-.8 && demand<0;
   const power=Math.abs(force*sliding);
   this.degradation=this.wearEnabled?Math.min(1,this.degradation+dt*(Math.abs(v)/300000+Math.abs(this.slip)*.0008+Math.abs(this.lateralG)*.00005)):0;
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
     if(this.locked)this.wear[index]=Math.min(.009,this.wear[index]+power*dt*1e-8);
   }
   return force;
 }
 get patch(){return Math.floor(this.angle/(2*Math.PI)*48)%48;}
}
