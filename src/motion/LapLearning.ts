/** A measured corner-group incumbent. Exploration is bounded and reversible. */
export type Strategy={entry:number;apex:number;exitOffset:number;cut:number;late:number;pickup:number;apexGain:number};
export type GroupMemory={best?:Strategy;weights?:number[];time?:number;entrySpeed?:number;step:number;clean:number;failed:boolean};
export const defaultStrategy=():Strategy=>({entry:0,apex:0,exitOffset:0,cut:0,late:0,pickup:0,apexGain:0});
export function rememberGroup(record:GroupMemory,strategy:Strategy,time:number,entrySpeed:number,incident:boolean,weights?:number[]){
 if(incident){record.step=Math.max(.025,record.step*.5);record.clean=0;record.failed=true;return;}
 if(!Number.isFinite(time)||time<=0||!Number.isFinite(entrySpeed))return;
 const comparable=record.entrySpeed===undefined||Math.abs(entrySpeed-record.entrySpeed)<3;
 if(!record.best || comparable&&time<(record.time??Infinity)){
   record.best={...strategy};record.time=time;record.entrySpeed=entrySpeed;
   record.weights=weights?[...weights]:undefined;
 }else if(comparable && time>(record.time??time)+.015)record.step=Math.max(.025,record.step*.8);
 record.failed=false;record.clean++;
}
export function nextStrategy(record:GroupMemory):Strategy{
 const best=record.best??defaultStrategy();
 if(record.failed||!record.best)return {...best};
 return {...best,late:Math.min(1.25,best.late+.12*record.step),pickup:Math.min(1,best.pickup+.08*record.step),apexGain:Math.min(.012,best.apexGain+.002*record.step)};
}
