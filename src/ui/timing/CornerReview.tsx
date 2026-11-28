import {useEffect,useRef,useState} from 'react';
import type {Inspector} from '../../scene/Inspector';

export function CornerReview({engine,close}:{engine:Inspector,close:()=>void}){
 const laps=engine.cruise.reviews;
 const reviewSections=engine.cruise.reviewSections;
 const [lap,setLap]=useState(laps.at(-1)?.lap),[section,setSection]=useState(0);
 const [index,setIndex]=useState(0),[playing,setPlaying]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null);
 const frames=laps.find(x=>x.lap===lap)?.clips[section]??[];
 const frame=frames[Math.min(index,frames.length-1)];
 useEffect(()=>{
   if(!frame||!canvas.current)return;
   engine.reviewImage(canvas.current,frame);
   if(!playing)return;
   if(index+1>=frames.length){setPlaying(false);return;}
   const timer=setTimeout(()=>setIndex(index+1),1000*(frames[index+1].t-frame.t));
   return ()=>clearTimeout(timer);
 },[engine,frame,playing,index,frames]);
 useEffect(()=>{
   const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};
   window.addEventListener('keydown',escape);return ()=>window.removeEventListener('keydown',escape);
 },[close]);
 const degrees=180/Math.PI;
 const minimum=frames.reduce((a,b)=>!a||b.speed<a.speed?b:a,frames[0]);
 const pickup=minimum && frames.find(f=>f.s>=minimum.s && f.throttle>.08);
 const full=pickup && frames.find(f=>f.s>=pickup.s && f.throttle>=.99);
 const lift=frames.find(f=>f.throttle<.95);
 return <aside className="corner-review" aria-label="过弯回放"><header><b>过弯回放</b><button onClick={close} aria-label="关闭回放">×</button></header>
 <div><select aria-label="回放圈次" value={lap} onChange={e=>{setPlaying(false);setLap(+e.target.value);setIndex(0);}}>{laps.map(x=><option key={x.lap} value={x.lap}>第 {x.lap} 圈</option>)}</select>
 <select aria-label="回放弯道" value={section} onChange={e=>{setPlaying(false);setSection(+e.target.value);setIndex(0);}}>{reviewSections.map((r,i)=><option key={r.start} value={i}>{r.name}</option>)}</select></div>
 <canvas aria-label="过弯回放画面" ref={canvas} width={480} height={240}/>
 {frame && <><div>{Math.round(frame.s)} m · {Math.round(frame.speed)} km/h · {frame.gear} 挡 · {Math.round(frame.rpm)} RPM</div>
 <small>收油 {lift?Math.round(lift.s)+' m':'—'} · 最低车速 {Math.round(minimum.speed)} km/h · {Math.round(minimum.s)} m · 全油门 {full?Math.round(full.s)+' m':'—'}</small><div>油门 {Math.round(frame.throttle*100)}%　刹车 {Math.round(frame.brake*100)}%</div>
 {([['弯道半径','curve',1,'m'],['前轮转角','rack',degrees,'°'],['转向速率','yaw',degrees,'°/s'],['车尾侧滑','rear',degrees,'°']] as const).map(([name,key,scale,unit])=>{
   const value=(f:typeof frame)=>key==='curve'?Math.min(2000,1/Math.max(.0005,Math.abs(f!.curve))):f![key]*scale;
   const max=Math.max(.001,...frames.map(f=>Math.abs(value(f))));
   const start=frames[0].s,span=Math.max(1,frames.at(-1)!.s-start);
   const x=(s:number)=>150*(s-start)/span;
   return <div className="review-channel" key={key}><span>{name}</span><svg viewBox="0 0 150 24"><path d="M0 12h150" stroke="#ccc"/><polyline fill="none" stroke="#b05713" points={frames.map(f=>x(f.s)+','+(12-10*value(f)/max)).join(' ')}/><path d={'M'+x(frame.s)+' 0v24'} stroke="#262522"/></svg><b>{key==='curve'&&value(frame)>=2000?'直道':value(frame).toFixed(key==='curve'?0:1)+' '+unit}</b></div>;
 })}
 <div><button onClick={()=>{if(index===frames.length-1)setIndex(0);setPlaying(!playing);}}>{playing?'暂停':'播放'}</button>
 <input aria-label="回放进度" type="range" min="0" max={frames.length-1} value={index} onChange={e=>{setPlaying(false);setIndex(+e.target.value);}}/></div></>}
 </aside>;
}
