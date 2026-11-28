import {loadCircuit} from '../../tracks/CircuitLoader';
import {Cruise,type PlanRequest} from './Cruise';
import {CircuitTrack} from '../../tracks/CircuitTrack';
import {RacingLine} from './RacingLine';

let planner:Cruise|undefined;
self.onmessage=async ({data}:{data:{generation:number,request:PlanRequest}})=>{
  if(!planner || planner.track.id!==data.request.circuitId){
    if(planner){planner.dispose();planner.line.dispose();planner.track.dispose();}
    const id=data.request.circuitId;
    const track=new CircuitTrack(await loadCircuit(id),false);
    planner=new Cruise(track,new RacingLine(track,false));
  }
  const plan=planner.planLap(data.request);
  self.postMessage({generation:data.generation,plan});
};
