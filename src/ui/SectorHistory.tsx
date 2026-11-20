import {useState} from 'react';
import {names} from './SpaBroadcast';
import type {LapTiming} from '../motion/Cruise';

export function SectorHistory({rows}:{rows:LapTiming[]}){
 const completed=rows.filter(r=>r.total!==undefined);
 const [first,setFirst]=useState(0),[second,setSecond]=useState(0);
 const a=completed.find(r=>r.lap===first)??completed.at(-2);
 const b=completed.find(r=>r.lap===second)??completed.at(-1);
 const changes=a?.regions?.map((r,i)=>({i,delta:(b?.regions?.[i].time??0)-r.time})).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,2);
 const best=Math.min(...completed.map(r=>Math.round(r.total!*1000)));
 return <details className="sector-history">
   <summary>逐圈分段</summary>
   <div className="history-panel">
     <header className="timing-heading"><b>分段成绩</b><small>秒</small></header>
     {rows.length===0?<p className="history-empty">等待首个计时圈</p>:<table aria-label="逐圈赛段用时（秒）">
       <thead><tr><th scope="col">圈次</th>{['S1','S2','S3','圈速'].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead>
       <tbody>{rows.slice().reverse().map(row=><tr key={row.lap}>
         <th scope="row">{row.lap}</th>{[0,1,2].map(i=>{
           const sector=row.sectors[i];
           return <td key={i} className={sector?.color}>{sector?(sector.ms/1000).toFixed(3):'—'}</td>;
         })}
         <td>{row.total===undefined?'—':(Math.floor(row.total/60)+':'+(row.total%60).toFixed(3).padStart(6,'0'))}</td>
       </tr>)}</tbody>
     </table>}

     {a && b && <section className="lap-compare"><b>弯段对比</b><div>
       {[a,b].map((r,i)=><select key={i} aria-label={i?'对照圈':'基准圈'} value={r.lap} onChange={e=>(i?setSecond:setFirst)(+e.target.value)}>
       {completed.map(c=><option value={c.lap} key={c.lap}>第 {c.lap} 圈</option>)}</select>)}</div>
       {a.lap===b.lap?'请选择不同圈次':changes?.map(({i,delta})=><p key={i}><b>T{i+1} {names[i]}</b>　{delta>=0?'+':''}{delta.toFixed(3)} s<br/>
       用时 {a.regions![i].time.toFixed(3)} → {b.regions![i].time.toFixed(3)} s<br/>
       区段出口 {Math.round(a.regions![i].exit)} → {Math.round(b.regions![i].exit)} km/h<br/>最低速 {Math.round(b.regions![i].trace.minimum*3.6)} km/h · 开油位置 {Math.round(b.regions![i].trace.pickup)||'—'} m</p>)}</section>}
   </div>
 </details>;
}
