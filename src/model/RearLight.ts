export type RearLightMode='off'|'demo'|'pit'|'recovery'|'low-energy';
export interface RearLightState{
 time:number;running:boolean;consumption:boolean;pitLimited:boolean;
 speed:number;electricKw:number;energyRatio:number;deploymentAllowed:boolean;
}
/** Visual warning policy. Reads actual battery power; never changes deployment or recovery. */
export class RearLight{
 mode:RearLightMode='off';intensity=0;
 private since=0;private previousTime=0;private lowEnergy=false;
 reset(){this.mode='off';this.intensity=0;this.since=0;this.previousTime=0;this.lowEnergy=false;}
 update(s:RearLightState){
  if(s.time<this.previousTime)this.reset();this.previousTime=s.time;
  if(!s.consumption||s.energyRatio>=.12)this.lowEnergy=false;
  else if(s.deploymentAllowed&&s.energyRatio<=.10)this.lowEnergy=true;
  let next:RearLightMode='off';
  if(!s.consumption)next='demo';
  else if(s.running){
   if(s.pitLimited&&s.speed>.1)next='pit';
   else if(s.electricKw<-.01)next='recovery';
   else if(this.lowEnergy&&s.deploymentAllowed&&s.speed>5)next='low-energy';
  }
  if(next!==this.mode){this.mode=next;this.since=s.time;}
  if(next==='off'){this.intensity=0;return 0;}
  // Requested display cadence: pit 2 Hz, energy warnings 4 Hz, legacy demo 0.8 s.
  const period=next==='pit'?.5:next==='demo'?.8:.25;
  const duty=next==='demo'?.4:.5;
  const phase=((s.time-this.since+1e-10)%period)/period;
  return this.intensity=phase<duty?1:0;
 }
}
