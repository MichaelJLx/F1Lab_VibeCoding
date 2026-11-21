import {TelemetryPlot} from './TelemetryPlot';
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
 const atTurn=data.status!=='idle' && !(data.phase==='out' && s<330) && Math.abs(s-turnStations[i])<85;
 const rpm=data.rpm??5000;
 return <>
 {showCircuit && !inspecting && <aside className="circuit-inset"><svg viewBox={viewBox} aria-label="Spa 赛道位置">
 {paths.map((points,j)=><polyline key={j} points={points} fill="none" stroke={lap?.sectors[j]?colors[lap.sectors[j].color]:'#a3a19d'} strokeWidth="25"/>)}
 {gates.slice(0,3).map(g=>{const [x,y]=at(g);return <circle key={g} cx={x} cy={y} r="33" fill="white"/>})}
 <circle cx={x} cy={y} r="58" fill="#ff9000" stroke="#292622" strokeWidth="14"/></svg>
 {atTurn && <b className="map-turn">T{i+1}</b>}</aside>}
 <div className="instrument-stack">
 {showCircuit && <TelemetryPlot data={data}/>}
 <aside className="race-dial" aria-label="赛车仪表">
 <svg viewBox="0 0 184 157" role="img" aria-label={Math.round(data.speed)+' 公里每小时，'+(data.gear??1)+' 挡，'+rpm+' RPM'}>
 <circle cx="92" cy="85" r="73" fill="#262521"/>
 <g transform="rotate(145 92 85)" fill="none" strokeWidth="5">
 <circle cx="92" cy="85" r="66" stroke="#504c44" pathLength="360" strokeDasharray="250 360"/>
 <circle cx="92" cy="85" r="66" stroke={rpm>=shiftRpm-200?'#c9b3ff':'#ff971e'} pathLength="360" strokeDasharray={250*Math.min(rpm/shiftRpm,1)+' 360'}/>
 </g>
 <g textAnchor="middle">
 <text x="92" y="54" fill="#cbc7bc" fontSize="11">{rpm.toLocaleString('en-US')} rpm</text>
 <text x="92" y="96" fill="#fffbef" fontSize="48" fontWeight="720" letterSpacing="-2">{Math.round(data.speed)}</text>
 <text x="92" y="111" fill="#cbc7bc" fontSize="11">km/h</text>
 <rect x="71" y="117" width="42" height="25" rx="5" fill="#393731"/>
 <text x="92" y="136" fill="#ffac48" fontSize="18" fontWeight="700">G{data.gear??1}</text>
 </g></svg>
 <div className="dial-pedals">{(['brake','throttle'] as const).map((key,i)=>{
   const value=Math.round(100*(data[key]??0));
   return <div key={key}><span>{i?'油门':'制动'}</span><b>{value}%</b><i><em style={{width:value+'%',background:i?'#72ca9c':'#eb786b'}}/></i></div>;
 })}</div></aside></div></>;
}
