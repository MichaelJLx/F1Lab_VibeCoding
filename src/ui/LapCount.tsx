import {useState} from 'react';

export function LapCount({value,maximum,locked,onChange}:{
 value:number;maximum:number;locked:boolean;onChange:(n:number)=>void;
}){
 const [editing,setEditing]=useState<string|null>(null);
 const clamp=(n:number)=>Math.max(1,Math.min(maximum,Math.trunc(n)));
 return <div className="laps-picker" role="group" aria-label="比赛圈数">
   <span>飞驰圈</span>
   <button aria-label="减少一圈" disabled={locked||value<=1} onClick={()=>onChange(value-1)}>−</button>
   <input aria-label="比赛圈数" type="number" inputMode="numeric" min={1} max={maximum} step={1}
     disabled={locked} value={editing??value} onChange={e=>{
       const field=e.currentTarget;
       setEditing(field.value);
       if(Number.isFinite(field.valueAsNumber))onChange(clamp(field.valueAsNumber));
     }} onBlur={()=>setEditing(null)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
   <button aria-label="增加一圈" disabled={locked||value>=maximum} onClick={()=>onChange(value+1)}>＋</button>
 </div>;
}
