import circuits from './static-circuits.json';
import {SpaTrack,spaData} from './SpaTrack';

export function createStaticCircuit(id:string){
 const data=circuits[id as keyof typeof circuits];
 if(!data)throw new Error('未知赛道');
 const nodes=data.points.map(([x,y,z],i)=>({
   x,y,z,s:i*data.length/data.points.length,widthLeft:data.width/2,widthRight:data.width/2
 }));
 const grid={...spaData.grid,lateral:data.side*3};
 const track=new SpaTrack({geometryLength:data.length,nodes,grid},id);
 return {track,gridPose:track.pose(grid.s,grid.lateral),width:data.width};
}
