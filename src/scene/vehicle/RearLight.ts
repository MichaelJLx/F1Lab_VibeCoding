export type RearLightMode='off'|'demo'|'pit'|'transit'|'coasting'|'braking'|'recovery'|'low-energy';
export interface RearLightState{
 time:number;running:boolean;consumption:boolean;pitLimited:boolean;
 speed:number;electricKw:number;energyRatio:number;deploymentAllowed:boolean;
 flying:boolean;brake:number;throttle:number;
}
// Display cadences selected for this simulator. Public FIA C14 refers detailed
// lamp control to DOC-025/026; these numeric rates are not verified FIA values.
const slowPeriod=.5,fastPeriod=.25;
const period=(mode:RearLightMode)=>mode==='demo'?.8:
 mode==='pit'||mode==='transit'||mode==='coasting'?slowPeriod:fastPeriod;
/** Coordinates mirror and rear warnings from one clock without changing vehicle physics. */
export class RearLight{
 mode:RearLightMode='off';intensity=0;frontIntensity=0;
 private since=0;private previousTime=0;private lowEnergy=false;
 reset(){this.mode='off';this.intensity=0;this.frontIntensity=0;this.since=0;this.previousTime=0;this.lowEnergy=false;}
 update(s:RearLightState){
  if(s.time<this.previousTime)this.reset();this.previousTime=s.time;
  if(!s.consumption||!s.flying||s.energyRatio>=.12)this.lowEnergy=false;
  else if(s.deploymentAllowed&&s.energyRatio<=.10)this.lowEnergy=true;
  let next:RearLightMode='off';
  if(s.running){
   if(s.pitLimited)next='pit';
   else if(!s.flying)next='transit';
   else if(!s.consumption)next='demo';
   else if(s.speed>.1){
    if(s.brake>.01)next='braking';
    else if(s.electricKw<-.01)next=s.throttle<=.03?'coasting':'recovery';
    else if(this.lowEnergy&&s.deploymentAllowed&&s.speed>5)next='low-energy';
   }
  }else if(!s.consumption)next='demo';
  // Switching between slow modes preserves phase, so pit entry cannot cause an extra flash.
  if(next!==this.mode){
   if(this.mode==='off'||next==='off'||period(next)!==period(this.mode))this.since=s.time;
   this.mode=next;
  }
  if(next==='off'){this.frontIntensity=this.intensity=0;return 0;}
  const duty=next==='demo'?.4:.5;
  const phase=((s.time-this.since+1e-10)%period(next))/period(next);
  this.intensity=phase<duty?1:0;
  const both=next==='pit'||next==='transit'||(next==='demo'&&!s.running);
  this.frontIntensity=both?this.intensity:0;
  return this.intensity;
 }
}
