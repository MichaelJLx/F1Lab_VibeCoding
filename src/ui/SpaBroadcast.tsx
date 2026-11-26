import {AeroTelemetry} from './AeroTelemetry';
import {TelemetryPlot} from './TelemetryPlot';
import {BroadcastDial} from './BroadcastDial';
import type {CruiseSnapshot} from '../motion/Cruise';
import {spaData} from '../tracks/SpaTrack';
import {turnStations,splitStations} from '../tracks/SpaMarkers';
export const names=['La Source','Eau Rouge','Raidillon','Raidillon','Les Combes','Les Combes','Malmedy','Bruxelles','No Name','Pouhon','Pouhon','Fagnes','Fagnes','Campus','Paul Frère','Blanchimont','Blanchimont','Bus Stop','Bus Stop'];
const nodes=spaData.nodes;
const xs=nodes.map(n=>n.x),ys=nodes.map(n=>-n.y);
const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
const scale=Math.min(186/(maxX-minX),138/(maxY-minY));
const xy=(n:typeof nodes[number])=>[110+(n.x-(minX+maxX)/2)*scale,80+(-n.y-(minY+maxY)/2)*scale];
function at(station:number){
 const s=((station%spaData.geometryLength)+spaData.geometryLength)%spaData.geometryLength;
 let low=0,high=nodes.length-1;
 while(low<high){const mid=(low+high+1)>>1;if(nodes[mid].s<=s)low=mid;else high=mid-1;}
 const a=nodes[low],b=nodes[(low+1)%nodes.length],t=(s-a.s)/Math.max(.001,(b.s||spaData.geometryLength)-a.s);
 const pa=xy(a),pb=xy(b);return [pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t];
}
const gates=[0,...splitStations,spaData.geometryLength];
const paths=gates.slice(1).map((end,i)=>[at(gates[i]),...nodes.filter((n,j)=>n.s>gates[i] && n.s<end && j%3===0).map(xy),at(end)].map(p=>p.join(',')).join(' '));
const outline=nodes.filter((_,i)=>i%3===0).map(xy).concat([xy(nodes[0])]).map(p=>p.join(',')).join(' ');
const keyTurns=[0,4,7,9,13,16,18].map(i=>({i,p:at(turnStations[i])}));
const start=at(0),startAhead=at(10),startAngle=Math.atan2(startAhead[1]-start[1],startAhead[0]-start[0])*180/Math.PI;
const colors={purple:'#c68aff',green:'#53dc8b',yellow:'#ffcf57'};
export function SpaBroadcast({data,showCircuit,inspecting,aeroVisible,flowVisible,pressure}:{data:CruiseSnapshot;showCircuit:boolean;inspecting:boolean;aeroVisible:boolean;flowVisible:boolean;pressure:boolean}){
 const s=data.station??0,[x,y]=at(s),ahead=at(s+8),behind=at(s-8);
 const heading=Math.atan2(ahead[1]-behind[1],ahead[0]-behind[0])*180/Math.PI+90;
 const trail=[100,75,50,25,0].map(d=>at(s-d).join(',')).join(' ');
 const i=turnStations.reduce((best,t,j)=>Math.abs(t-s)<Math.abs(turnStations[best]-s)?j:best,0);
 const rows=data.timingRows??[];
 const lap=data.finishHold?rows.filter(r=>r.total!==undefined).at(-1):data.phase==='timed'?rows.at(-1):undefined;
 const atTurn=data.status!=='idle' && !(data.phase==='out' && s<330) && Math.abs(s-turnStations[i])<85;
 return <><div className="lower-hud">
 {showCircuit && !inspecting && <aside className="circuit-inset"><svg viewBox="0 0 220 160" aria-label="Spa 赛道位置">
 <polyline points={outline} className="map-glow"/>
 {paths.map((points,j)=><polyline key={j} points={points} fill="none" stroke={lap?.sectors[j]?colors[lap.sectors[j].color]:'#e4e8ee'} strokeWidth="1.8" strokeLinejoin="round"/>)}
 {keyTurns.map(({i,p})=><text key={i} x={p[0]+(p[0]>110?8:-8)} y={p[1]+3} textAnchor={p[0]>110?'start':'end'} className="map-corner">{i+1}</text>)}
 <g transform={`translate(${start.join(' ')}) rotate(${startAngle})`}><rect x="-2" y="-4" width="4" height="8" fill="#eff3f7"/><path d="M-2 -4h2v2h-2z M0 -2h2v2h-2z M-2 0h2v2h-2z M0 2h2v2h-2z" fill="#202b35"/></g>
 <polyline points={trail} fill="none" stroke="#ffac48" strokeWidth="3" strokeOpacity=".5" strokeLinecap="round"/>
 <g transform={`translate(${x} ${y}) rotate(${heading})`}><circle r="6" fill="#ff9a20" opacity=".15"/><path d="M0 -5 L3.5 4 L0 2 L-3.5 4Z" fill="#ffac48" stroke="#442b10" strokeWidth=".7"/></g>
 </svg>{atTurn && <b className="map-turn">T{i+1}</b>}</aside>}
 {showCircuit && <TelemetryPlot data={data}/>}
 <BroadcastDial data={data}/></div><div className="aero-stack"><AeroTelemetry data={data} forces={aeroVisible} flow={flowVisible} pressure={pressure}/></div></>;
}
