import {createStaticCircuit} from '../tracks/StaticCircuit';
import {Cruise,type PlanRequest} from './Cruise';
import {SpaTrack,spaData} from '../tracks/SpaTrack';
import {RacingLine} from '../optimizer/RacingLine';

let planner:Cruise|undefined;
self.onmessage=({data}:{data:{generation:number,request:PlanRequest}})=>{
  if(!planner || planner.track.id!==(data.request.circuitId??'spa')){
    if(planner){planner.dispose();planner.line.dispose();planner.track.dispose();}
    const id=data.request.circuitId??'spa';
    const track=id==='spa'?new SpaTrack(spaData,'spa',false):createStaticCircuit(id,false).track;
    planner=new Cruise(track,new RacingLine(track));
  }
  const plan=planner.planLap(data.request);
  self.postMessage({generation:data.generation,plan},{transfer:[plan.vertices.buffer,plan.stations.buffer,plan.indices.buffer]});
};
