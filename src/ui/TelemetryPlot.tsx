import {useEffect,useRef,useState} from 'react';
import {Segments} from './Controls';
import type {CruiseSnapshot} from '../motion/Cruise';

const views={
 驾驶:[['speed','车速','km/h',380],['throttle','油门','%',100],['brake','刹车','%',100]],
 空力:[['wing','翼面开度','%',100],['front','前轴下压力','kN',16],['rear','后轴下压力','kN',20],['drag','阻力','kN',8]],
 底盘:[['frontGap','前底盘高度','mm',160],['rearGap','后底盘高度','mm',160],['FL','左前负荷','kN',14],['FR','右前负荷','kN',14],['RL','左后负荷','kN',14],['RR','右后负荷','kN',14]]
} as const;
type View=keyof typeof views;
type Channel=typeof views[View][number][0];
type Point=Record<Channel|'d'|'station',number>;
const colors=['#ffad4c','#72ca9c','#eb786b','#8ec7e8','#c6a2e8','#bfc9d0'];
const windowM=400;

export function TelemetryPlot({data}:{data:CruiseSnapshot}){
 const [samples,setSamples]=useState<Point[]>([]);
 const laps=useRef({lap:0,previous:new Map<number,Point>(),current:new Map<number,Point>()});
 const [view,setView]=useState<View>('驾驶'),[collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
   if(data.status==='idle'){laps.current.current.clear();laps.current.previous.clear();laps.current.lap=0;setSamples(old=>old.length?[]:old);return;}
   if(data.status!=='running')return;
   const load=(key:string)=>(data.loads?.[key]??0)/1000;
   const point:Point={d:data.distance,station:data.station??0,speed:data.speed,throttle:100*(data.throttle??0),brake:100*(data.brake??0),
     wing:100*(data.platform?.wing??0),frontGap:1000*(data.platform?.frontGap??0),rearGap:1000*(data.platform?.rearGap??0),
     front:(data.aero?.front??0)/1000,rear:(data.aero?.rear??0)/1000,drag:(data.aero?.drag??0)/1000,
     FL:load('FL'),FR:load('FR'),RL:load('RL'),RR:load('RR')};
   if(data.invalidLap)laps.current.current.clear();
   if(data.phase==='timed' && !data.invalidLap && data.lap){
     const record=laps.current;
     if(record.lap!==(data.attempt??data.lap)){
       if(record.current.size)record.previous=record.current;record.current=new Map();record.lap=data.attempt??data.lap;
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
 const end=samples.at(-1),channels=views[view];
 const x=(p:Point)=>8+584*(1-((end?.d??0)-p.d)/windowM);
 const y=(value:number,max:number)=>116-104*Math.max(0,Math.min(1,value/max));
 if(collapsed)return <button className="telemetry-reopen" onClick={()=>setCollapsed(false)} aria-expanded={false}>⌃ 实时遥测</button>;
 return <aside className="telemetry-ribbon" aria-label="实时遥测">
 <button className="telemetry-close" aria-label="收起实时遥测" onClick={()=>setCollapsed(true)}>收起 ⌄</button><div className="telemetry-readings"><Segments label="遥测通道" value={view} change={setView} options={[["驾驶","车速/踏板"],["空力","气动"],["底盘","底盘"]]}/>
 <div className="telemetry-values">{channels.map(([key,name,unit],i)=><div key={key} style={{color:colors[i]}}><span>{name}</span><b>{end?end[key].toFixed(unit==='kN'?1:0):'0'} <small>{unit}</small></b></div>)}</div></div>
 <div className="telemetry-chart"><svg viewBox="0 0 600 124" preserveAspectRatio="none" role="img" aria-label={'最近 400 米的'+view+'遥测；各通道按量程归一化'}>
 {[12,64,116].map(v=><path key={v} d={`M8 ${v}H592`} stroke="white" strokeOpacity=".12" vectorEffect="non-scaling-stroke"/>)}
 <path d="M592 8V120" stroke="#e3f3ff" strokeOpacity=".65" vectorEffect="non-scaling-stroke"/>
 {channels.map(([key,name,unit,max],i)=>{
 const points=samples.map(p=>`${x(p)},${y(p[key],max)}`).join(' ')||'8,116 592,116';
 let comparison='',continuous=false;
 if(data.phase==='timed' && !data.invalidLap)for(const sample of samples){const prior=laps.current.previous.get(Math.floor(sample.station/10));if(!prior){continuous=false;continue;}comparison+=(continuous?'L':'M')+x(sample)+','+y(prior[key],max);continuous=true;}
 return <g key={key}><title>{name} · 0–{max} {unit}</title><defs><linearGradient id={'ribbon-fill-'+key} x1="0" y1="0" x2="0" y2="1"><stop stopColor={colors[i]} stopOpacity=".13"/><stop offset="1" stopColor={colors[i]} stopOpacity="0"/></linearGradient></defs>
 <polygon points={`${points} 592,116 ${samples.length?x(samples[0]):8},116`} fill={'url(#ribbon-fill-'+key+')'}/>
 <path d={comparison} fill="none" stroke={colors[i]} opacity=".3" strokeDasharray="3 4" vectorEffect="non-scaling-stroke"/>
 <polyline className="telemetry-wave" points={points} fill="none" stroke={colors[i]} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" opacity={end?1:.35}/>
 <circle cx="592" cy={end?y(end[key],max):116} r="2.5" fill={colors[i]}/></g>;
 })}
 </svg><div className="telemetry-ruler"><span>−400 m</span><span>−200 m</span><span>0 m</span></div></div></aside>;
}
