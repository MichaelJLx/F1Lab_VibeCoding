import {useId} from 'react';
import type {CruiseSnapshot} from '../../simulation/driving/Cruise';

// Angles start at twelve o'clock; positive sweep is clockwise.
const point=(r:number,angle:number)=>{
 const a=angle*Math.PI/180;
 return [160+r*Math.sin(a),160-r*Math.cos(a)];
};
const arc=(r:number,start:number,end:number)=>{
 const a=point(r,start),b=point(r,end);
 return `M ${a.join(' ')} A ${r} ${r} 0 ${Math.abs(end-start)>180?1:0} ${end>start?1:0} ${b.join(' ')}`;
};
const speedPath=arc(131,-130,130),throttlePath=arc(100,-125,-15),brakePath=arc(100,125,15);
const finite=(n:number|undefined,fallback=0)=>Number.isFinite(n)?n!:fallback;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

export function BroadcastDial({data}:{data:CruiseSnapshot}){
 const id=useId().replace(/:/g,'');
 const speed=Math.max(0,finite(data.speed)),rpm=Math.max(0,finite(data.rpm,5000));
 const throttle=clamp(finite(data.throttle)),brake=clamp(finite(data.brake));
 const gear=finite(data.gear,1),gearLabel=gear===0?'N':gear<0?'R':String(gear);
 const progress=(d:string,value:number,color:string)=><path d={d} pathLength={100}
   className="broadcast-progress" stroke={color} strokeDasharray="100 100"
   strokeDashoffset={100*(1-value)} opacity={value>0?1:0}/>;
 return <aside className="broadcast-dial" aria-label="实时遥测">
 <svg viewBox="0 0 320 320" role="img" aria-label={`车速 ${Math.round(speed)} 公里每小时，${gearLabel} 挡，转速 ${Math.round(rpm)}，油门 ${Math.round(throttle*100)}%，刹车 ${Math.round(brake*100)}%`}>
   <defs>
     <radialGradient id={`${id}-disc`} cx="50%" cy="50%" r="50%">
       <stop offset="0" stopColor="#12161a" stopOpacity=".55"/>
       <stop offset="1" stopColor="#12161a" stopOpacity=".35"/>
     </radialGradient>
     <path id={`${id}-throttle`} d={throttlePath}/>
     <path id={`${id}-brake`} d={arc(100,15,125)}/>
   </defs>
   <circle cx="160" cy="160" r="148" fill={`url(#${id}-disc)`}/>
   <g fill="none" strokeLinecap="round" strokeWidth="26">
     <path d={speedPath} stroke="white" strokeOpacity=".14"/>
     {progress(speedPath,clamp(speed/360),'#368CE7')}
   </g>
   <g className="broadcast-scale">
     {[0,60,120,180,240,300,360].map((v,i)=>{
       const angle=-130+260*i/6,[x,y]=point(131,angle);
       return <text key={v} x={x} y={y} transform={`rotate(${angle} ${x} ${y})`} dominantBaseline="central" textAnchor="middle">{v}</text>;
     })}
   </g>
   <g fill="none" strokeLinecap="round" strokeWidth="21">
     <path d={throttlePath} stroke="#57B856" strokeOpacity=".14"/>
     <path d={brakePath} stroke="#E5484D" strokeOpacity=".14"/>
     {progress(throttlePath,throttle,'#57B856')}
     {progress(brakePath,brake,'#E5484D')}
   </g>
   <g className="broadcast-arc-label" textAnchor="middle" dy="3">
     <text dy="3"><textPath href={`#${id}-throttle`} startOffset="50%">THROTTLE</textPath></text>
     <text dy="3"><textPath href={`#${id}-brake`} startOffset="50%">BRAKE</textPath></text>
   </g>
   <g textAnchor="middle" fill="#E4E8EE">
     <text className="broadcast-speed" x="160" y="139">{Math.round(speed)}</text>
     <text className="broadcast-unit broadcast-kmh" x="160" y="159">KMH</text>
     <text className="broadcast-rpm" x="160" y="198">{Math.round(rpm)}</text>
     <text className="broadcast-unit" x="160" y="218">RPM</text>
     <text x="160" y="274"><tspan className="broadcast-unit">GEAR </tspan><tspan className="broadcast-gear" dx="4">{gearLabel}</tspan></text>
   </g>
 </svg>
 </aside>;
}
