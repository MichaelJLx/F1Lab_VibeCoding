import markings from './circuit-markings.json';
import {turnStations,splitStations} from './SpaMarkers';
import type {SpaTrack} from './SpaTrack';
export type CornerGroup={turn:number,last:number,start:number,end:number};
export const spaGroups:CornerGroup[]=[{turn:0,last:0,start:35,end:600},{turn:1,last:3,start:700,end:1500},{turn:4,last:6,start:2020,end:2650},{turn:7,last:8,start:2690,end:3350},{turn:9,last:10,start:3370,end:4000},{turn:11,last:13,start:4050,end:4900},{turn:14,last:16,start:4920,end:6200},{turn:17,last:18,start:6280,end:6970}];
/** Geometry-derived stations are estimates, not official timing/activation coordinates. */
export function drivingProfile(track:SpaTrack){
 if(track.id==='spa')return {turns:turnStations,splits:splitStations,groups:spaGroups,zones:[] as {start:number,end:number}[],estimated:false};
 const length=track.length,step=10,n=Math.ceil(length/step),ds=length/n;
 const curvature=Array.from({length:n},(_,i)=>Math.abs(track.curvature(i*ds,18)));
 const peaks:number[]=[];
 for(let i=3;i<n-3;i++)if(curvature[i]>.003 && [-3,-2,-1,1,2,3].every(d=>curvature[i]>=curvature[i+d])){
   if(peaks.length && (i-peaks[peaks.length-1])*ds<65){if(curvature[i]>curvature[peaks[peaks.length-1]])peaks[peaks.length-1]=i;}
   else peaks.push(i);
 }
 const mark=markings[track.id as keyof typeof markings];
 const origin=mark?Math.round(mark.start/length*track.layout.nodes.length)*length/track.layout.nodes.length:0;
 const station=(s:number)=>(s-origin+length)%length;
 const turns=mark?.turns.length?mark.turns.map(station).sort((a,b)=>a-b):(peaks.length?peaks:[Math.floor(n/2)]).map(i=>i*ds);
 const groups:CornerGroup[]=[];
 turns.forEach((s,i)=>{
   const prev=groups.at(-1);
   if(prev && s-turns[i-1]<260){prev.last=i;prev.end=Math.min(length-1,s+110);}
   else groups.push({turn:i,last:i,start:Math.max(1,s-180),end:Math.min(length-1,s+110)});
 });
 for(let i=1;i<groups.length;i++){const middle=(turns[groups[i-1].last]+turns[groups[i].turn])/2;groups[i-1].end=Math.min(groups[i-1].end,middle);groups[i].start=Math.max(groups[i].start,middle);}
 const zones:{start:number,end:number}[]=[];
 let start=-1;
 for(let i=0;i<=n;i++){
   const straight=i<n && curvature[i]<.0018;
   if(straight && start<0)start=i*ds;
   if(!straight && start>=0){const end=i*ds-90;if(end-start>180)zones.push({start:start+30,end});start=-1;}
 }
 if(mark?.activations.length){
   zones.length=0;
   for(const activation of mark.activations){
     const start=station(activation);let end=start+length;
     // Close on the next substantial turn approach; braking also closes wings immediately.
     for(const turn of turns){const d=(turn-start+length)%length;if(d>80&&d<end-start&&Math.abs(track.curvature(turn,18))>.003)end=start+d-65;}
     zones.push({start,end:end%length});
   }
 }
 if(track.id==='mc-1929')zones.length=0;
 return {turns,splits:mark?.splits.length===2?mark.splits.map(station).sort((a,b)=>a-b):[length/3,2*length/3],groups,zones,estimated:!mark};
}
