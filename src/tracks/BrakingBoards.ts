import * as T from 'three';
import type {SpaTrack} from './SpaTrack';

// Entry stations are registered to our ribbon, not survey coordinates.
// Side is in the direction of travel. Data provenance is in README.
type Approach={entry:number; sides:number[]; distances:number[]; blue?:boolean};
const spaApproaches:Approach[]=[150,2200,2820,4260,6550].map(entry=>({entry,sides:[1],distances:[150,100,50]}));
export function addBrakingBoards(track:SpaTrack,id:string){
 const pit=track.pit;
 if(pit)for(const [station,label] of [[pit.limitEntry,String(pit.speedLimit)],[pit.limitExit,'END']] as const){
   const canvas=document.createElement('canvas');canvas.width=192;canvas.height=128;
   const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f6f6ee';ctx.fillRect(0,0,192,128);
   ctx.fillStyle='#171819';ctx.font='bold 70px sans-serif';ctx.textAlign='center';ctx.fillText(label,96,83);
   const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
   const board=new T.Mesh(new T.PlaneGeometry(1.1,.73),new T.MeshBasicMaterial({map}));
   const direction=pit.point(station+1).sub(pit.point(station-1)).normalize();
   const side=new T.Vector3(direction.z,0,-direction.x);
   const center=pit.point(station);if(track.point(station).sub(center).dot(side)>0)side.negate();
   board.position.copy(center).addScaledVector(side,pit.halfWidth+.7);board.position.y+=1.1;
   board.rotation.y=Math.atan2(-direction.x,-direction.z);board.name='Pit speed '+label;track.signs.add(board);
 }

 {
   let previous=track.aeroZone(track.length-1);
   for(let s=0;s<track.length;s++){
     const zone=track.aeroZone(s);
     if(zone!==previous){
       const canvas=document.createElement('canvas');canvas.width=256;canvas.height=96;
       const ctx=canvas.getContext('2d')!;
       ctx.fillStyle='#282724';ctx.fillRect(0,0,256,96);ctx.fillStyle=zone?'#ff9000':'#fffaf0';
       ctx.font='bold 38px sans-serif';ctx.fillText(zone?'SLM ON':'SLM END',12,62);
       const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
       const board=new T.Mesh(new T.PlaneGeometry(1.6,.6),new T.MeshBasicMaterial({map}));
       board.position.copy(track.point(s,track.width(s)+2));board.position.y+=1.1;
       const forward=track.pose(s).forward;board.rotation.y=Math.atan2(-forward.x,-forward.z);
       track.signs.add(board);
     }
     previous=zone;
   }
 }
 const entries=id==='spa'?spaApproaches:track.profile.groups.filter(g=>Math.abs(track.curvature(track.profile.turns[g.turn],18))>.007).map(g=>({entry:Math.max(0,track.profile.turns[g.turn]-70),sides:[1],distances:[150,100,50]} as Approach));
 for(const approach of entries)for(const distance of approach.distances){
   const canvas=document.createElement('canvas');
   canvas.width=192;canvas.height=112;
   const ctx=canvas.getContext('2d')!;
   ctx.fillStyle=approach.blue?'#183c81':'#f6f6ee';ctx.fillRect(0,0,192,112);
   ctx.fillStyle=approach.blue?'white':'#171819';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.font='bold 84px sans-serif';ctx.fillText(String(distance),96,59);
   const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
   const material=new T.MeshBasicMaterial({map});
   const station=approach.entry-distance,forward=track.pose(station).forward;
   for(const side of approach.sides){
     const board=new T.Mesh(new T.PlaneGeometry(1.35,.79),material);
     board.name='Brake board '+distance;
     board.position.copy(track.point(station,side*(track.width(station,side)+1.1)));
     board.position.y+=.73;
     board.rotation.y=Math.atan2(-forward.x,-forward.z);
     const post=new T.Mesh(new T.BoxGeometry(.065,.75,.065),new T.MeshStandardMaterial({color:0x696966}));
     post.position.copy(board.position);post.position.y-=.37;
     post.position.addScaledVector(forward,.06);
     track.signs.add(board,post);
   }
 }
}
