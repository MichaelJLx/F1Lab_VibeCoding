import {shiftRpm} from '../motion/Gearbox';
import type {CruiseSnapshot} from '../motion/Cruise';
import {spaData} from '../tracks/SpaTrack';
import {turnStations,splitStations} from '../tracks/SpaMarkers';
export const names=['La Source','Eau Rouge','Raidillon','Raidillon','Les Combes','Les Combes','Malmedy','Bruxelles','No Name','Pouhon','Pouhon','Fagnes','Fagnes','Campus','Paul Frère','Blanchimont','Blanchimont','Bus Stop','Bus Stop'];
const nodes=spaData.nodes;
const xy=(n:typeof nodes[number])=>[n.x,-n.y];
const xs=nodes.map(n=>n.x),ys=nodes.map(n=>-n.y);
const viewBox=[Math.min(...xs)-120,Math.min(...ys)-120,Math.max(...xs)-Math.min(...xs)+240,Math.max(...ys)-Math.min(...ys)+240].join(' ');

function at(s:number){return xy(nodes[Math.floor(s/spaData.geometryLength*nodes.length)%nodes.length]);}
const gates=[0,...splitStations,spaData.geometryLength];
const paths=gates.slice(1).map((end,i)=>[at(gates[i]),...nodes.filter((n,j)=>n.s>gates[i] && n.s<end && j%3===0).map(xy),at(end)].map(p=>p.join(',')).join(' '));
const colors={purple:'#c68aff',green:'#53dc8b',yellow:'#ffcf57'};
export function SpaBroadcast({data,showCircuit,inspecting}:{data:CruiseSnapshot;showCircuit:boolean;inspecting:boolean}){
 const s=data.station??0,[x,y]=at(s);
 const i=turnStations.reduce((best,t,j)=>Math.abs(t-s)<Math.abs(turnStations[best]-s)?j:best,0);
 const rows=data.timingRows??[];
 const lap=data.finishHold?rows.filter(r=>r.total!==undefined).at(-1):data.phase==='timed'?rows.at(-1):undefined;
 const next=turnStations.findIndex(t=>t>s);
 const atTurn=Math.abs(s-turnStations[i])<100,turn=atTurn?i:Math.max(0,next);
 const rpm=data.rpm??5000;
 return <>
 {showCircuit && !inspecting && <aside className="circuit-inset"><svg viewBox={viewBox} aria-label="Spa 赛道位置">
 {paths.map((points,j)=><polyline key={j} points={points} fill="none" stroke={lap?.sectors[j]?colors[lap.sectors[j].color]:'#a3a19d'} strokeWidth="25"/>)}
 {gates.slice(0,3).map(g=>{const [x,y]=at(g);return <circle key={g} cx={x} cy={y} r="33" fill="white"/>})}
 <circle cx={x} cy={y} r="58" fill="#ff9000" stroke="#292622" strokeWidth="14"/></svg>
 <b>{atTurn?'':'下一弯 '}T{turn+1} · {names[turn]}</b><div className="map-splits">{paths.map((_,j)=>{const sector=lap?.sectors[j];return <span key={j} style={{color:sector&&colors[sector.color]}}>S{j+1}<br/>{sector?(sector.ms/1000).toFixed(3):'—'}</span>})}</div></aside>}
 <aside className="race-dial" aria-label="转播遥测">
 <svg viewBox="0 0 220 196" role="img" aria-label={`${Math.round(data.speed)} 公里每小时，${data.gear??1} 挡，${rpm} RPM，油门 ${Math.round(100*(data.throttle??0))}%，制动 ${Math.round(100*(data.brake??0))}%`}>
 <circle cx="110" cy="95" r="85" fill="#17191df0"/>
 <g fill="none" strokeWidth="7" transform="rotate(140 110 95)">
 <circle cx="110" cy="95" r="78" stroke="#484b50" pathLength="360" strokeDasharray="260 360"/>
 <circle cx="110" cy="95" r="78" stroke={rpm>=shiftRpm-200?'#a998ff':'#ff982a'} pathLength="360" strokeDasharray={`${260*Math.min(rpm/shiftRpm,1)} 360`}/>
 </g>
 <g stroke="#aaa" strokeWidth="1">{Array.from({length:14},(_,i)=><path key={i} d="M180 95h-4" transform={`rotate(${140+i*20} 110 95)`}/>)}</g>
 <g fill="white" textAnchor="middle">
 <text x="110" y="56" className="rpm-read">{rpm} RPM</text>
 <text x="110" y="104" className="speed-read">{Math.round(data.speed)}</text>
 <text x="110" y="120" className="unit-read">KM/H</text>
 <rect x="93" y="129" width="34" height="31" rx="5" fill="#eeeae1"/>
 <text x="110" y="153" fill="#191b1d" className="gear-read">{data.gear??1}</text>
 </g>
 {(['brake','throttle'] as const).map((k,i)=>{
   const value=Math.round(100*(data[k]??0)),color=i?'#62e89b':'#ff646c';
   const path=i?'M146 174 A89 89 0 0 0 192 64':'M74 174 A89 89 0 0 1 28 64';
   return <g key={k}><path d={path} fill="none" stroke="#292b30" strokeWidth="9"/>
   <path d={path} fill="none" stroke={color} strokeWidth="7" pathLength="100" strokeDasharray={value+' 100'}/>
   <text x={i?167:53} y="190" textAnchor="middle" fill={color} stroke="#15171b" strokeWidth="3" paintOrder="stroke" fontSize="13" fontWeight="700">{i?'油门':'制动'} {value}%</text></g>;
 })}
 </svg></aside></>;
}
