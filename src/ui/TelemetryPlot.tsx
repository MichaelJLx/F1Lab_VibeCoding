import {useEffect,useRef,useState} from 'react';
import type {CruiseSnapshot} from '../motion/Cruise';

const views={
 驾驶:[['speed','车速','km/h',380],['throttle','油门','%',100],['brake','制动','%',100]],
 空力:[['wing','翼面开度','%',100],['front','前轴下压力','kN',16],['rear','后轴下压力','kN',20],['drag','阻力','kN',8]],
 底盘:[['frontGap','前离地','mm',160],['rearGap','后离地','mm',160],['FL','左前轮载','kN',14],['FR','右前轮载','kN',14],['RL','左后轮载','kN',14],['RR','右后轮载','kN',14]]
} as const;
type View=keyof typeof views;
type Channel=typeof views[View][number][0];
type Point=Record<Channel|'d'|'station',number>;
const colors=['#ffad4c','#72ca9c','#eb786b','#8ec7e8','#c6a2e8','#bfc9d0'];
const windowM=400;

export function TelemetryPlot({data}:{data:CruiseSnapshot}){
 const [samples,setSamples]=useState<Point[]>([]);
 const laps=useRef({lap:0,previous:new Map<number,Point>(),current:new Map<number,Point>()});
 const [view,setView]=useState<View>('驾驶');
 useEffect(()=>{
   if(data.status==='idle'){laps.current.current.clear();laps.current.previous.clear();laps.current.lap=0;setSamples(old=>old.length?[]:old);return;}
   if(data.status!=='running')return;
   const load=(key:string)=>(data.loads?.[key]??0)/1000;
   const point:Point={d:data.distance,station:data.station??0,speed:data.speed,throttle:100*(data.throttle??0),brake:100*(data.brake??0),
     wing:100*(data.platform?.wing??0),frontGap:1000*(data.platform?.frontGap??0),rearGap:1000*(data.platform?.rearGap??0),
     front:(data.aero?.front??0)/1000,rear:(data.aero?.rear??0)/1000,drag:(data.aero?.drag??0)/1000,
     FL:load('FL'),FR:load('FR'),RL:load('RL'),RR:load('RR')};
   if(data.phase==='timed' && data.lap){
     const record=laps.current;
     if(record.lap!==data.lap){
       record.previous=record.current;record.current=new Map();record.lap=data.lap;
     }
     record.current.set(Math.floor(point.station/10),point);
   }
   setSamples(old=>{
     const last=old.at(-1);
     if(last && last.d>point.d)return [point];
     if(last && point.d-last.d<2)return old;
     return [...old.filter(p=>p.d>=point.d-windowM),point];
   });
 },[data]);
 const end=samples.at(-1),channels=views[view],height=17+31*channels.length;
 return <details className="trace-panel"><summary>遥测曲线 <small>400 m</small></summary>
 <select aria-label="遥测通道" value={view} onChange={e=>setView(e.target.value as View)}>{Object.keys(views).map(v=><option key={v}>{v}</option>)}</select>
 <svg viewBox={'0 0 228 '+height} role="img" aria-label={'最近 400 米的'+view+'遥测'}>
 {channels.map(([key,name,unit,max],i)=>{
   const y=9+31*i;
   const points=samples.map(p=>[60+162*(1-(end!.d-p.d)/windowM),y+21-20*Math.max(0,Math.min(1,p[key]/max))].join(',')).join(' ');
   let comparison='',continuous=false;
   if(data.phase==='timed')for(const sample of samples){
     const prior=laps.current.previous.get(Math.floor(sample.station/10));
     if(!prior){continuous=false;continue;}
     comparison+=(continuous?'L':'M')+(60+162*(1-(end!.d-sample.d)/windowM))+','+(y+21-20*Math.max(0,Math.min(1,prior[key]/max)));
     continuous=true;
   }
   return <g key={key}><text x="4" y={y+7}>{name}</text><text x="4" y={y+19} fill={colors[i]}>{end?end[key].toFixed(unit==='kN'?1:0):'—'} {unit}</text>
    <path d={'M60 '+(y+21)+'h162'} stroke="#625f57"/><path d={comparison} fill="none" stroke={colors[i]} opacity=".45" strokeDasharray="2 2"><title>上一计时圈 · 同一赛道位置</title></path><polyline points={points} fill="none" stroke={colors[i]} strokeWidth="1.5"/></g>;
 })}
 <g fill="#aaa79c"><text x="60" y={height-4}>−400 m</text><text x="222" y={height-4} textAnchor="end">0 m</text></g>
 </svg></details>;
}
