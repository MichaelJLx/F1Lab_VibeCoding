import {useEffect,useState} from 'react';
import type {CruiseSnapshot} from '../motion/Cruise';

type Point={d:number,speed:number,throttle:number,brake:number};
const channels=[
 {key:'speed',name:'车速',unit:'km/h',max:380,color:'#ffad4c'},
 {key:'throttle',name:'油门',unit:'%',max:100,color:'#72ca9c'},
 {key:'brake',name:'制动',unit:'%',max:100,color:'#eb786b'}
] as const;
const windowM=400;

export function TelemetryPlot({data}:{data:CruiseSnapshot}){
 const [samples,setSamples]=useState<Point[]>([]);
 useEffect(()=>{
   if(data.status==='idle'){setSamples(old=>old.length?[]:old);return;}
   if(data.status!=='running')return;
   const point={d:data.distance,speed:data.speed,throttle:100*(data.throttle??0),brake:100*(data.brake??0)};
   setSamples(old=>{
     const last=old.at(-1);
     if(last && last.d>point.d)return [point];
     if(last && point.d-last.d<2)return old;
     return [...old.filter(p=>p.d>=point.d-windowM),point];
   });
 },[data]);
 const end=samples.at(-1);
 return <details className="trace-panel"><summary>遥测曲线 <small>400 m</small></summary>
 <svg viewBox="0 0 228 110" role="img" aria-label="最近 400 米的车速、油门与制动曲线">
 {channels.map(({key,name,unit,max,color},i)=>{
   const y=9+31*i;
   const points=samples.map(p=>[60+162*(1-(end!.d-p.d)/windowM),y+21-20*Math.min(1,p[key]/max)].join(',')).join(' ');
   return <g key={key}><text x="4" y={y+7}>{name}</text><text x="4" y={y+19} fill={color}>{end?Math.round(end[key]):'—'} {unit}</text>
    <path d={'M60 '+(y+21)+'h162'} stroke="#625f57"/><polyline points={points} fill="none" stroke={color} strokeWidth="1.5"/></g>;
 })}
 <g fill="#aaa79c"><text x="60" y="106">−400 m</text><text x="222" y="106" textAnchor="end">0 m</text></g>
 </svg></details>;
}
