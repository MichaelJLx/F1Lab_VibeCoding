import {Cruise,type PlanRequest} from './Cruise';
import {SpaTrack,spaData} from '../tracks/SpaTrack';
import {RacingLine} from '../optimizer/RacingLine';

let planner:Cruise|undefined;
self.onmessage=({data}:{data:{generation:number,request:PlanRequest}})=>{
  if(!planner){
    const track=new SpaTrack(spaData,'spa',false);
    planner=new Cruise(track,new RacingLine(track));
  }
  const plan=planner.planLap(data.request);
  self.postMessage({generation:data.generation,plan},{transfer:[plan.vertices.buffer,plan.stations.buffer,plan.indices.buffer]});
};
