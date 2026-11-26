import markings from './circuit-markings.json';
import circuits from './static-circuits.json';
import {SpaTrack,spaData} from './SpaTrack';

export function createStaticCircuit(id:string,signage=true){
 const data=circuits[id as keyof typeof circuits];
 if(!data)throw new Error('未知赛道');
 const mark=markings[id as keyof typeof markings];
 const shift=Math.round((mark?.start??0)/data.length*data.points.length)%data.points.length;
 const nodes=data.points.map((_,i)=>{const [x,y,z]=data.points[(i+shift)%data.points.length];return ({
   x,y,z,s:i*data.length/data.points.length,widthLeft:data.width/2,widthRight:data.width/2
 });});
 const grid={...spaData.grid,s:0,lateral:0};
 const track=new SpaTrack({geometryLength:data.length,nodes,grid},id,signage);
 return {track,gridPose:track.pose(grid.s,grid.lateral),width:data.width};
}
