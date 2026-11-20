import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {Cruise} from '../src/motion/Cruise';
import {SpaTrack,spaData} from '../src/tracks/SpaTrack';
import {RacingLine} from '../src/optimizer/RacingLine';
import {corners} from '../src/motion/Suspension';

// Same station, battery, tyres, speed and steering state for all three runs.
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})}});
const track=new SpaTrack();
for(const [name,t18,t19] of [['参考线',0,0],['T18 内切',1,0],['优先 T19 出口',0,1]] as const){
 const car=new Cruise(track,new RacingLine(track));
 car.lap=2;car.distance=6300-spaData.grid.s;car.speed=82;car.status='running';
 const weights=Array(19).fill(0);weights[17]=t18;weights[18]=t19;
 car.setPath(weights);car.buildSpeedPlan();
 for(const key of corners){
   const t=car.dynamics.tyres[key];t.omega=car.speed/t.radius;
   car.contactCenters[key]=new Vector3((key[1]==='L'?1:-1)*.76,0,key[0]==='F'?1.69:-1.69);
 }
 let time=0,minimumLoad=Infinity,minSpeed=Infinity,outside=false,full=0;
 while(car.s<6900 && time<40){
   const previous=car.s;
   car.tick(1/60);
   time+=Math.min(1,(6900-previous)/Math.max(.0001,car.s-previous))/60;
   const pose=car.pose();
   for(const k of corners){
     minimumLoad=Math.min(minimumLoad,car.dynamics.suspension.loads[k]);
     const local=car.contactCenters[k]!,section=track.pose(car.s+local.z);
     const offset=local.clone().applyQuaternion(pose.quaternion).add(pose.position).sub(section.position)
       .dot(new Vector3(1,0,0).applyQuaternion(section.quaternion));
     outside ||= Math.abs(offset)+(k[0]==='F'?.15:.19)>track.width(car.s+local.z,offset);
   }
   minSpeed=Math.min(minSpeed,car.speed);
   if(car.s>6637 && !full && car.gearbox.throttle>=.99)full=car.s;
 }
 assert.ok(car.s>=6900);
 console.log(name,{seconds:+time.toFixed(3),minimumKmh:+(3.6*minSpeed).toFixed(1),fullThrottleM:Math.round(full),minimumLoadN:Math.round(minimumLoad),outside});
}
