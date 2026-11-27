import {useTelemetry,type TelemetryStore} from './TelemetryStore';
import {ErsGauge,VehicleStatus} from './VehicleStatus';
import {SectorHistory} from './SectorHistory';
function formatTime(seconds:number){return Math.floor(seconds/60)+":"+(seconds%60).toFixed(3).padStart(6,"0");}
export function LiveErsGauge({store,enabled}:{store:TelemetryStore;enabled:boolean}){return <ErsGauge data={useTelemetry(store)} enabled={enabled}/>;}
export function LiveVehicleStatus({store,wearEnabled}:{store:TelemetryStore;wearEnabled:boolean}){return <VehicleStatus data={useTelemetry(store)} wearEnabled={wearEnabled}/>;}
export function LiveHistory({store,names}:{store:TelemetryStore;names:string[]}){return <SectorHistory rows={useTelemetry(store).timingRows??[]} names={names} expanded/>;}
export function LiveTiming({store,stage}:{store:TelemetryStore;stage:string}){
 const cruise=useTelemetry(store),completed=(cruise.timingRows??[]).filter(row=>row.total!==undefined);
 const finish=!cruise.invalidLap&&cruise.finishHold?completed.at(-1):undefined;
 const shownRow=finish??(cruise.phase==='timed'?cruise.timingRows?.at(-1):undefined);
 return <><div className="session-times"><strong>{(cruise.invalidLap?'无效圈':finish?formatTime(finish.total!):cruise.phase==='timed'?formatTime(cruise.elapsed):stage)}</strong><span>{(cruise.distance/1000).toFixed(2)} km</span>{cruise.liveDelta!==undefined&&<em className={cruise.liveDelta<=0?'gain':'loss'}>{cruise.liveDelta>=0?'+':''}{cruise.liveDelta.toFixed(3)}</em>}{Number.isFinite(cruise.bestLap)&&<small>最佳 {formatTime(cruise.bestLap!)}</small>}</div>
<div className="timing-segments">{[0,1,2].map(i=>{const result=shownRow?.sectors[i];return <div key={i} className={result?.color??''}><span>S{i+1}</span><b>{cruise.invalidLap?'无效圈':result?(result.ms/1000).toFixed(3):'—'}</b></div>;})}</div></>;
}
export function LivePartReadout({store,selected}:{store:TelemetryStore;selected:string}){
 const cruise=useTelemetry(store);
 return /^(FL|FR|RL|RR)$/.test(selected)?<div className="physics-readout">轮胎负荷 <b>{Math.round(cruise.loads?.[selected]??0)} N</b>{cruise.tyres?.[selected]&&<small>胎压 {(cruise.tyres[selected].pressure/100).toFixed(2)} bar · 接地压力 {cruise.tyres[selected].contact.toFixed(0)} kPa<br/>平斑 {cruise.tyres[selected].wear.toFixed(2)} mm {cruise.tyres[selected].locked?'· 锁死':''}</small>}</div>:<div className="physics-readout">侧倾 <b>{(cruise.roll??0).toFixed(2)}°</b> · 俯仰 <b>{(cruise.pitch??0).toFixed(2)}°</b><br/>车身起伏 <b>{(cruise.heave??0).toFixed(1)} mm</b></div>;
}
