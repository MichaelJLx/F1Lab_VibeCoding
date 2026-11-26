import {useState} from 'react';

import type {LapTiming} from '../motion/Cruise';

export function SectorHistory({rows,expanded=false,names=[]}:{rows:LapTiming[];expanded?:boolean;names?:string[]}){
 const completed=rows.filter(r=>r.total!==undefined);
 const [first,setFirst]=useState(0),[second,setSecond]=useState(0);
 const a=completed.find(r=>r.lap===first)??completed.at(-2);
 const b=completed.find(r=>r.lap===second)??completed.at(-1);
 const changes=a?.regions?.map((r,i)=>({i,delta:(b?.regions?.[i].time??0)-r.time})).sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,2);
 const sectorBest=[0,1,2].map(i=>Math.min(...rows.map(r=>r.sectors[i]?.ms??Infinity)));
 const theoretical=sectorBest.reduce((a,b)=>a+b,0)/1000;
 const time=(seconds:number)=>Math.floor(seconds/60)+':'+(seconds%60).toFixed(3).padStart(6,'0');
 const best=Math.min(...completed.map(r=>Math.round(r.total!*1000)));
 return <details className="sector-history" open={expanded||undefined}>
   <summary>圈速榜</summary>
   <div className="history-panel">
     <header className="timing-heading"><b>赛段成绩</b><small>秒</small></header>
     {rows.length===0?<p className="history-empty">暂无飞驰圈成绩</p>:<table aria-label="每圈赛段用时（秒）">
       <thead><tr><th scope="col">圈次</th>{['S1','S2','S3','圈速','差距'].map(s=><th scope="col" key={s}>{s}</th>)}</tr></thead>
       <tbody>{rows.slice().reverse().map(row=><tr key={row.lap} className={row.total!==undefined&&Math.round(row.total*1000)===best?'fastest-lap':undefined}>
         <th scope="row">{row.lap}{row.total!==undefined&&Math.round(row.total*1000)===best&&<span className="fastest-badge">最快</span>}</th>{[0,1,2].map(i=>{
           const sector=row.sectors[i];
           return <td key={i} className={sector?(sector.ms===sectorBest[i]?'purple':rows.filter(r=>r.lap<row.lap).every(r=>(r.sectors[i]?.ms??Infinity)>sector.ms)?'green':'yellow'):undefined}>{sector?(sector.ms/1000).toFixed(3):'—'}</td>;
         })}
         <td>{row.total===undefined?'—':time(row.total)}</td><td>{row.total===undefined?'—':Math.round(row.total*1000)===best?'—':'+'+((Math.round(row.total*1000)-best)/1000).toFixed(3)}</td>
       </tr>)}</tbody>
     </table>}

     <footer className="timing-footer"><span>理论最快 <b>{Number.isFinite(theoretical)?time(theoretical):'—'}</b></span><small><i className="purple">■ 最快分段</i> · <i className="green">■ 个人进步</i> · <i className="yellow">■ 普通分段</i></small></footer>
     {a && b && <section className="lap-compare"><b>过弯对比</b><div>
       {[a,b].map((r,i)=><select key={i} aria-label={i?'对照圈':'参考圈'} value={r.lap} onChange={e=>(i?setSecond:setFirst)(+e.target.value)}>
       {completed.map(c=><option value={c.lap} key={c.lap}>第 {c.lap} 圈</option>)}</select>)}</div>
       {a.lap===b.lap?'请选择不同圈次':changes?.map(({i,delta})=><p key={i}><b>T{i+1} {names[i]}</b>　{delta>=0?'+':''}{delta.toFixed(3)} s<br/>
       用时 {a.regions![i].time.toFixed(3)} → {b.regions![i].time.toFixed(3)} s<br/>
       出弯速度 {Math.round(a.regions![i].exit)} → {Math.round(b.regions![i].exit)} km/h<br/>最低车速 {Math.round(b.regions![i].trace.minimum*3.6)} km/h · 加速点 {Math.round(b.regions![i].trace.pickup)||'—'} m</p>)}</section>}
   </div>
 </details>;
}
