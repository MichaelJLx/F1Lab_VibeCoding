import {createFlowSolver} from './FlowSolver';
import type {FlowRequest,FlowResult} from './FlowProtocol';
let solve:ReturnType<typeof createFlowSolver>;
self.onmessage=({data}:{data:FlowRequest})=>{
 if(data.type==='init'){solve=createFlowSolver(data.parts,data.shapes,data.clearance);return;}
 const start=performance.now(),buffers=solve(data.state,data.buffers);
 const result:FlowResult={...buffers,solveMs:performance.now()-start};
 self.postMessage(result,{transfer:[buffers.positions.buffer,buffers.directions.buffer,buffers.frames.buffer,buffers.transit.buffer,buffers.ratios.buffer]});
};
