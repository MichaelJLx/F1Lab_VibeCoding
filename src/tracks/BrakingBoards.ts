import * as T from 'three';
import type {SpaTrack} from './SpaTrack';

// Entry stations are registered to our ribbon, not survey coordinates.
// Side is in the direction of travel. Data provenance is in README.
type Approach={entry:number; sides:number[]; distances:number[]; blue?:boolean};
const approaches:Record<string,Approach[]>={
 spa:[{entry:6550,sides:[1,-1],distances:[200,150,100,50]}],
 'it-1922':[
   {entry:610,sides:[1],distances:[100]},
   {entry:1825,sides:[-1],distances:[100]},
   {entry:3625,sides:[-1],distances:[100]},
   {entry:4809,sides:[1,-1],distances:[150,100,50]}
 ],
 'hu-1986':[{entry:3732,sides:[1],distances:[100],blue:true}],
 'mx-1962':[{entry:3593,sides:[1],distances:[150]}],
 'ca-1978':[{entry:2203,sides:[1],distances:[100]}],
 'sa-2021':[{entry:5518,sides:[1,-1],distances:[100],blue:true}]
};
export function addBrakingBoards(track:SpaTrack,id:string){
 for(const approach of approaches[id]??[])for(const distance of approach.distances){
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
     track.markings.add(board,post);
   }
 }
}
