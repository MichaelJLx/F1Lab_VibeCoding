import {useEffect,useState} from 'react';
import type {CruiseSnapshot} from '../motion/Cruise';

export function AeroTelemetry({data,forces,flow,pressure}:{data:CruiseSnapshot;forces:boolean;flow:boolean;pressure:boolean}){
 const [loads,setLoads]=useState([0,0,0]);
 useEffect(()=>{let id=0,last=performance.now();const tick=(now:number)=>{const k=1-Math.exp(-(now-last)/120);last=now;setLoads(old=>old.map((v,i)=>v+([data.aero?.front??0,data.aero?.rear??0,data.aero?.drag??0][i]-v)*k));id=requestAnimationFrame(tick);};id=requestAnimationFrame(tick);return()=>cancelAnimationFrame(id);},[data.aero]);
 if(!forces&&!flow&&!pressure)return null;
 const front=Math.max(0,loads[0]),rear=Math.max(0,loads[1]),drag=Math.max(0,loads[2]);
 const total=front+rear,share=total?front/total:.5;
 return <aside className="aero-telemetry" aria-label="空气动力学"><div className="aero-mode">{data.aeroZone?"直道模式":"弯道模式"}</div>
 {forces&&<><div className="aero-title"><span>下压力</span><strong>{(total/1000).toFixed(2)} <small>kN</small></strong></div>
 <div className="aero-distribution" role="img" aria-label={`前轴 ${(front/1000).toFixed(2)}，后轴 ${(rear/1000).toFixed(2)} 千牛`}><i style={{width:`${total?share*100:0}%`}}/><i style={{width:`${total?(1-share)*100:0}%`}}/></div>
 <div className="aero-split"><span>前轴 {(share*100).toFixed(0)}% · {(front/1000).toFixed(2)} kN</span><span>后轴 {((1-share)*100).toFixed(0)}% · {(rear/1000).toFixed(2)} kN</span></div>
 <div className="aero-drag"><span>阻力</span><div><i style={{width:`${Math.min(1,drag/6000)*100}%`}}/></div><b>{(drag/1000).toFixed(2)} <small>kN</small></b></div><div className="aero-split"><span>气动效率 L/D</span><b>{drag>1?(total/drag).toFixed(2):"—"}</b></div><div className="efficiency-scale" title="L/D · 0–8"><i style={{width:`${Math.min(1,drag>1?total/drag/8:0)*100}%`}}/></div></>}
 {flow&&<div className="aero-legend"><div><span>气流速度</span><small>底板中段 · {data.flowRatio?.toFixed(2)??"—"}×</small></div><i className="flow-spectrum"><b className="flow-pointer" style={{left:`${Math.max(0,Math.min(1,((data.flowRatio??1)-.25)/1.55))*100}%`}}/></i><div className="legend-ticks"><span>0.25×</span><span>1.0×</span><span>1.8×</span></div></div>}
 {pressure&&<div className="aero-legend"><div><span>压力系数 Cp</span><small>吸力 → 驻点</small></div><i className="cp-spectrum"/><div className="cp-ticks"><span>−4</span><span>−2</span><span>0</span><span>+1</span></div></div>}
 </aside>;
}
