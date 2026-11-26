import rig from '../model/suspension-rig.json';

// Model-space floor samples in metres; ground effect coefficients are estimates.
export const staticDrop=.028;
export const rootClearance=.012/1.25;
export const floorSamples=rig.probes;
const front=floorSamples.find(v=>v[2]===1.25)!;
const rear=floorSamples.find(v=>v[2]===-1.25)!;
export const nominalGap={front:front[1]+rootClearance-staticDrop,rear:rear[1]+rootClearance-staticDrop};
const heightMap=[[0,.72],[.015,.89],[.035,1.035],[.055,1.06],[.095,1],[.14,.88],[.20,.80]];
function floorEfficiency(gap:number){
 for(let i=1;i<heightMap.length;i++){
   const [x,y]=heightMap[i], [a,b]=heightMap[i-1];
   if(gap<x){const t=Math.max(0,(gap-a)/(x-a));return b+(y-b)*t*t*(3-2*t);}
 }
 return heightMap[heightMap.length-1][1];
}
export function platformForces(speed:number,wing:number,frontGap:number,rearGap:number,beta=0){
 const q=.5*1.225*speed*speed;
 const slip=Math.min(1,Math.sin(beta)**2/.03);
 const frontWing=1.05-.45*wing,rearWing=1.35-.70*wing;
 const frontFloor=1.15*floorEfficiency(frontGap)*(1-.035*slip);
 const rearFloor=1.45*floorEfficiency(rearGap)*(1-.07*slip);
 const frontDownforce=q*(frontFloor+frontWing);
 const rearDownforce=q*(rearFloor+rearWing);
 const drag=q*(.72+.15*(frontWing/1.05)**2+.17*(rearWing/1.35)**2+.16*((frontFloor+rearFloor)/2.60)**2+.025*slip);
 return {frontWing,rearWing,frontFloor,rearFloor,frontDownforce,rearDownforce,downforce:frontDownforce+rearDownforce,drag};
}
