import {useId} from 'react';
import type {CruiseSnapshot} from '../motion/Cruise';
import plan from '../model/rb22-plan-view.json';

const corners=['FL','FR','RL','RR'] as const;
const clamp=(value:number,low:number,high:number)=>Math.max(low,Math.min(high,Number.isFinite(value)?value:low));
// Continuous sRGB interpolation; physics already damps pressure before publishing.
function spectrum(value:number,stops:readonly (readonly [number,number,number,number])[]){
 const t=clamp(value,stops[0][0],stops.at(-1)![0]);
 const i=Math.max(1,stops.findIndex(stop=>stop[0]>=t)),a=stops[i-1],b=stops[i],f=(t-a[0])/(b[0]-a[0]);
 return `rgb(${[1,2,3].map(c=>Math.round(a[c]+(b[c]-a[c])*f)).join(' ')})`;
}
export const energyColour=(soc:number)=>spectrum(soc,[[0,239,68,68],[.25,242,140,35],[.5,234,179,8],[.75,143,193,47],[1,34,197,94]]);
export const wearColour=(wear:number)=>spectrum(wear,[[0,64,200,150],[25,162,207,83],[60,243,177,61],[100,234,73,79]]);
export const pressureColour=(psi:number)=>spectrum(psi,[[17,77,158,228],[23.2,83,203,173],[29,234,177,76],[38,235,87,80]]);

export function ErsGauge({data,enabled}:{data:CruiseSnapshot;enabled:boolean}){
 const id=useId().replace(/:/g,''),soc=enabled?clamp(data.power?.energy??1,0,1):1;
 const charging=enabled&&data.status==='running'&&(data.power?.electric??0)<-.5&&soc<.99999;
 return <div className={`ers-gauge${charging?' is-charging':''}`} aria-label={`ERS 电量 ${(soc*100).toFixed(1)}%${charging?'，能量回收中':''}`}>
  <div className="ers-caption"><span>ERS <em>{charging?'回收':enabled&&data.status==='paused'?'暂停':enabled&&data.status==='running'&&(data.power?.electric??0)>.5?'部署':enabled?'待命':'满电'}</em></span><strong style={{color:energyColour(soc)}}>{(soc*100).toFixed(1)}<small>%</small></strong></div>
  <svg viewBox="0 0 202 16" role="meter" aria-label="电池电量" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(soc*100)}>
   <defs><clipPath id={id}><rect className="ers-level" width={soc*198} height="16"/></clipPath></defs>
   <g fill="currentColor" opacity=".14">{Array.from({length:20},(_,i)=><rect key={i} x={i*10} y="2" width="8" height="12" rx="1"/>)}</g>
   <g style={{fill:energyColour(soc)}} className="ers-charge" clipPath={`url(#${id})`}>{Array.from({length:20},(_,i)=><rect key={i} x={i*10} y="2" width="8" height="12" rx="1"/>)}</g>
   <path d="M200 5v6" stroke="currentColor" strokeWidth="2" opacity=".4"/>
  </svg>
 </div>;
}
export function VehicleStatus({data,wearEnabled}:{data:CruiseSnapshot;wearEnabled:boolean}){
 return <div className="vehicle-status" aria-label="四轮状态">
  <svg className="vehicle-plan" viewBox={plan.viewBox} role="img" aria-label="RB22 俯视图">
   <g className="vehicle-outline" fillRule="evenodd">{['floor','body','cockpit','front-wing','rear-wing'].map(name=><path key={name} className={`plan-${name}`} d={plan.components.find(c=>c.name===name)!.d}/>)}</g>
   {corners.map(key=>{
    const wheel=plan.wheels[key],t=data.tyres?.[key],wear=wearEnabled?clamp(t?.degradation??0,0,100):0,psi=(t?.pressure??160)/6.894757293;
    return <g key={key}><rect className="tyre-pressure-ring" x={wheel.x-wheel.width/2-5} y={wheel.y-wheel.height/2-5} width={wheel.width+10} height={wheel.height+10} rx="9" fill="none" stroke={pressureColour(psi)} strokeWidth="3"/>
     <path className="tyre-fill" d={plan.components.find(c=>c.name===key)!.d} fill={wearColour(wear)}/></g>;
   })}
  </svg>
  {corners.map(key=>{
   const t=data.tyres?.[key],wear=wearEnabled?clamp(t?.degradation??0,0,100):0,psi=clamp((t?.pressure??160)/6.894757293,0,60);
   return <div key={key} className={`wheel-status wheel-${key}`} aria-label={`${key} 磨损 ${wear.toFixed(1)}%，胎压 ${psi.toFixed(1)} PSI`}>
    <div><span>{key}</span><strong style={{color:wearColour(wear)}}>{wear.toFixed(1)}<small>%</small></strong></div>
    <div className="pressure-value"><i style={{background:pressureColour(psi)}}/>{psi.toFixed(1)} <small>PSI</small></div>
   </div>;
  })}
  <span className="vehicle-status-label">磨损 · 胎压</span>
 </div>;
}
