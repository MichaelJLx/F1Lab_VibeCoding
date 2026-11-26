import assert from 'node:assert/strict';
import {createStaticCircuit} from '../src/tracks/StaticCircuit';
import circuits from '../src/tracks/static-circuits.json';
import {Cruise} from '../src/motion/Cruise';
import {RacingLine} from '../src/optimizer/RacingLine';
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})}});
// Route lifecycle regression. The separate Spa run exercises the full candidate planner.
for(const id of Object.keys(circuits)){
 const track=createStaticCircuit(id,false).track,line=new RacingLine(track),car=new Cruise(track,line);
 (car as unknown as {stageNextLap:()=>void}).stageNextLap=()=>{};
 const pit=track.pit!;
 assert.ok(pit && pit.entry<0 && pit.exit>0,id+' pit lane');
 for(const s of [pit.entry,pit.exit]){
   assert.ok(pit.point(s).distanceTo(track.point(s))<.005,id+' junction position');
   const tangent=pit.point(s+1).sub(pit.point(s-1)).normalize();
   assert.ok(tangent.dot(track.point(s+1).sub(track.point(s-1)).normalize())>.99,id+' junction tangent');
 }
 for(let s=pit.entry+2;s<pit.exit-2;s+=5){
   const p=pit.point(s),height=pit.heightAt(p);
   assert.ok(height!==undefined&&Math.abs(height-p.y)<.12,id+' pit surface support '+s);
 }
 car.lapCount=1;car.toggle();let resets=0,last=false;
 for(let i=0;i<60*1400&&car.status!=='complete';i++){
   car.tick(1/60);if(car.recovering&&!last)resets++;last=car.recovering;
   assert.ok(Number.isFinite(car.speed),id+' finite speed');
   if(!car.flying){assert.equal(car.aeroZone,0,id+' base aero outside flying laps');assert.ok(car.gearbox.electricKw<=0,id+' no ERS deployment outside flying laps');}
 }
 assert.equal(car.status,'complete',id+' completes pit-out / lap / pit-in');
 assert.equal(resets,0,id+' stays on track');assert.equal(car.history.length,1,id+' valid lap');
 const [s1,s2,total]=car.history[0];assert.ok(s1>0&&s2>s1&&total>s2,id+' three timing sectors');
 console.log(id, 'OK', total.toFixed(3)+' s', track.profile.turns.length+' turns');
 car.dispose();line.dispose();track.dispose();
}
