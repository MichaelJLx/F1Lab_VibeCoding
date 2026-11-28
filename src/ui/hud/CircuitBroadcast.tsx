import {useMemo} from 'react';
import type {CircuitTrack} from '../../tracks/CircuitTrack';
import {AeroTelemetry} from './AeroTelemetry';
import {TelemetryPlot} from './TelemetryPlot';
import {BroadcastDial} from './BroadcastDial';
import {useTelemetry,type TelemetryStore} from '../telemetry/TelemetryStore';
import {mapGeometry} from './TrackMapLayout';
const colors={purple:'#c68aff',green:'#53dc8b',yellow:'#ffcf57'};
export function CircuitBroadcast({store,track,circuitId,inspecting,aeroVisible,flowVisible,pressure}:{store:TelemetryStore;track:CircuitTrack;circuitId:string;inspecting:boolean;aeroVisible:boolean;flowVisible:boolean;pressure:boolean}){
 const data=useTelemetry(store);
 const {at,paths,outline,keyTurns,start,startAngle,turns}=useMemo(()=>mapGeometry(track),[track]);
 const s=data.station??0,[x,y]=at(s),ahead=at(s+8),behind=at(s-8);
 const heading=Math.atan2(ahead[1]-behind[1],ahead[0]-behind[0])*180/Math.PI+90;
 const trail=[100,75,50,25,0].map(d=>at(s-d).join(',')).join(' ');
 const i=turns.reduce((best,t,j)=>Math.abs(t-s)<Math.abs(turns[best]-s)?j:best,0);
 const rows=data.timingRows??[];
 const lap=data.finishHold?rows.filter(r=>r.total!==undefined).at(-1):data.phase==='timed'?rows.at(-1):undefined;
 const atTurn=data.status!=='idle' && !(data.phase==='out' && s<track.pit.exit) && Math.abs(s-turns[i])<85;
 return <><div className="lower-hud">
 {!inspecting && <aside className="circuit-inset"><svg viewBox="0 0 300 220" aria-label="赛道位置">
 <polyline points={outline} className="map-glow"/>
 {paths.map((points,j)=><polyline key={j} points={points} fill="none" stroke={lap?.sectors[j]?colors[lap.sectors[j].color]:'#e4e8ee'} strokeWidth="1.8" strokeLinejoin="round"/>)}
 {keyTurns.map(({i,p,label})=><g key={i}><path d={`M${p[0]} ${p[1]}L${label[0]} ${label[1]}`} className="map-leader"/><text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="central" className="map-corner">{i+1}</text></g>)}
 <g transform={`translate(${start.join(' ')}) rotate(${startAngle})`}><rect x="-2" y="-4" width="4" height="8" fill="#eff3f7"/><path d="M-2 -4h2v2h-2z M0 -2h2v2h-2z M-2 0h2v2h-2z M0 2h2v2h-2z" fill="#202b35"/></g>
 <polyline points={trail} fill="none" stroke="#ffac48" strokeWidth="3" strokeOpacity=".5" strokeLinecap="round"/>
 <g transform={`translate(${x} ${y}) rotate(${heading})`}><circle r="6" fill="#ff9a20" opacity=".15"/><path d="M0 -5 L3.5 4 L0 2 L-3.5 4Z" fill="#ffac48" stroke="#442b10" strokeWidth=".7"/></g>
 </svg>{atTurn && <b className="map-turn">T{i+1}</b>}</aside>}
 <TelemetryPlot data={data} circuitId={circuitId}/>
 <BroadcastDial data={data}/></div><div className="aero-stack">{(aeroVisible||flowVisible||pressure)&&<AeroTelemetry data={data} forces={aeroVisible} flow={flowVisible} pressure={pressure}/>}</div></>;
}
