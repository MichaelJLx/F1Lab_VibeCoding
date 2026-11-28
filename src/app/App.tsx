import {type TyreCompound,tyreCompounds,nextCompound} from '../simulation/vehicle/TyreCompound';
import {type PressureUnit,nextPressureUnit} from '../ui/controls/VehicleStatus';
import {Brand} from '../ui/navigation/Brand';
import {useEffect,useRef,useState} from 'react';
import {Inspector,names,defaultView,type View} from '../scene/Inspector';
import {Toggle,Segments,PlaybackIcon} from '../ui/controls/Controls';
import circuits from '../tracks/generated/circuit-summaries.json';
import {loadCircuit} from '../tracks/CircuitLoader';
import type {CircuitData} from '../tracks/CircuitData';
import {CornerReview} from '../ui/timing/CornerReview';
import {CircuitBroadcast} from '../ui/hud/CircuitBroadcast';
import {LiveErsGauge,LiveVehicleStatus,LiveTiming,LivePartReadout,LiveHistory} from '../ui/hud/LiveTelemetry';
import {TelemetryStore,controlKey} from '../ui/telemetry/TelemetryStore';
import {LapCount} from '../ui/timing/LapCount';
import {TrackPicker,CircuitFlag} from '../ui/navigation/TrackPicker';
import type {CruiseSnapshot} from '../simulation/driving/Cruise';
import {type RoadStyle} from '../tracks/CircuitTrack';
export function App(){const circuitData=useRef<CircuitData|null>(null),selection=useRef(0);const [telemetry]=useState(()=>new TelemetryStore());const [circuitId,setCircuitId]=useState<string|null>(null);const host=useRef<HTMLDivElement>(null),engine=useRef<Inspector|null>(null);const [laps,setLaps]=useState(1),[ready,setReady]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState<string|null>(null),[view,setView]=useState<View>(defaultView),[wire,setWire]=useState(false),[rotate,setRotate]=useState(false),[steer,setSteer]=useState(0),[wingPreview,setWingPreview]=useState(false),[trackPicker,setTrackPicker]=useState(false),[lineVisible,setLineVisible]=useState(true),[road,setRoad]=useState<RoadStyle>('soft'),[flySpeed,setFlySpeed]=useState(35),[cruiseLimit,setCruiseLimit]=useState(Infinity),[cruise,setCruise]=useState<CruiseSnapshot>({status:'idle',speed:0,progress:0,elapsed:0,distance:0});
useEffect(()=>{if(!host.current||!circuitData.current||!circuitId)return;let e:Inspector;try{e=new Inspector(circuitData.current,host.current,()=>setReady(true),setSelected,setError,snapshot=>{telemetry.publish(snapshot);setCruise(old=>controlKey(old)===controlKey(snapshot)?old:snapshot);});engine.current=e;}catch{setError('暂时无法显示赛道，请刷新页面或更换浏览器后重试。');}return()=>{e?.dispose();engine.current=null;};},[circuitId!==null]);
const [review,setReview]=useState(false),[historyOpen,setHistoryOpen]=useState(false);
useEffect(()=>{if(!historyOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setHistoryOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[historyOpen]);
const [pressureUnit,setPressureUnit]=useState<PressureUnit>('PSI'),[compound,setCompound]=useState<TyreCompound>('soft');
const [energyUse,setEnergyUse]=useState(false),[tyreWear,setTyreWear]=useState(false);
const [collapsed,setCollapsed]=useState(false),[boards,setBoards]=useState(true);
const [pressure,setPressure]=useState(false);
const [flowVisible,setFlowVisible]=useState(false);
const [aeroVisible,setAeroVisible]=useState(false);

useEffect(()=>{if(engine.current){engine.current.cruise.energyEnabled=energyUse;engine.current.cruise.wearEnabled=tyreWear;}},[energyUse,tyreWear,circuitId]);

useEffect(()=>{if(engine.current){engine.current.cruise.limitKmh=cruiseLimit===-1?Infinity:cruiseLimit;engine.current.cruise.pace=cruiseLimit===-1?.94:1;}},[cruiseLimit,circuitId]);
const circuit=circuits.find(c=>c.id===circuitId)!;
const track=engine.current?.track,turnNames=track?.profile.turnNames??[];
useEffect(()=>{engine.current?.line.setVisible(lineVisible);},[lineVisible,ready,circuitId]);
useEffect(()=>{engine.current?.setTrackSigns(boards);},[boards,circuitId,ready]);
async function chooseCircuit(id:string){
 const request=++selection.current;
 try{const data=await loadCircuit(id);if(request!==selection.current)return;circuitData.current=data;
 setReview(false);
 const e=engine.current;
 if(id!==circuitId){
   e?.switchCircuit(data);
   setFlowVisible(false);setAeroVisible(false);e?.setAirflow(false);setCircuitId(id);setLaps(n=>Math.min(n,data.raceLaps));setWingPreview(false);
 }
 if(id===circuitId)e?.resetCamera();
 setView(defaultView);setRotate(false);setSteer(0);setError('');setTrackPicker(false);
 }catch{setError('赛道暂时无法加载，请重试。');}
}

const phaseLabel=cruise.phase==='in'?'进站圈':'出站圈';
const stage=cruise.recovering?'冲出赛道 · 正在复位':cruise.invalidLap?'无效圈':cruise.status==='complete'?'已结束':cruise.status==='idle'?'待发车':cruise.phase==='timed'?'飞驰圈 '+cruise.lap+'/'+laps:phaseLabel;
const statusLabel=cruise.status==='paused'?'暂停 · '+stage:stage;
function resetCar(){
 setReview(false);engine.current?.resetGrid();
 setView(defaultView);setRotate(false);setSteer(0);setWingPreview(false);
}
function runCruise(){setReview(false);setWingPreview(false);if(engine.current){engine.current.cruise.lapCount=laps;engine.current.toggleCruise();}}
function camera(v:View){setView(v);engine.current?.view(v);}
function toggle(kind:'wire'|'rotate'){const e=engine.current;if(!e)return;if(kind==='wire'){setWire(!wire);e.setWire(!wire);}if(kind==='rotate'){setRotate(!rotate);e.rotate=!rotate;}}
if(!circuitId||!circuit)return <main className="circuit-start"><TrackPicker active={null} onChoose={chooseCircuit} error={error}/></main>;
return <main className={`telemetry-hud console-layout${collapsed?' console-collapsed':''}`}><header className="app-header">
<div className="header-navigation"><div className="brand-track"><Brand/><button className="track-pill" disabled={!ready} aria-haspopup="dialog" aria-expanded={trackPicker} onClick={()=>{engine.current?.free.keys.clear();setTrackPicker(true);}}><CircuitFlag id={circuitId}/>{circuit.shortName}<span aria-hidden="true">⬇</span></button></div>
<div className="header-circuit" role="group" aria-label="赛道信息">
<b className="circuit-spec-name" title={circuit.shortName}>{circuit.shortName}</b>
<span className="circuit-spec-divider" aria-hidden="true"/>
<span className="circuit-spec-value"><strong>{(circuit.length/1000).toFixed(3)}</strong><small>KM</small></span>
<span className="circuit-spec-divider" aria-hidden="true"/>
<span className="circuit-spec-value"><strong>{circuit.turns}</strong><small>TURNS</small></span>
</div></div>
<div className="header-actions"><Segments label="视角" value={view} disabled={!ready} change={camera} options={([['helmet','头盔'],['onboard','车载'],['hero','车尾'],['track','俯瞰'],['free','自由'],...[['trackside','转播']]] as [View,string][])}/>
{<><div className="session-length" title={`最多 ${circuit.raceLaps} 圈`}><LapCount value={laps} maximum={circuit.raceLaps} locked={cruise.status==='running'||cruise.status==='paused'} onChange={setLaps}/><small>/{circuit.raceLaps}</small></div><div className="playback-controls"><button className="run-button icon-button" disabled={!ready} aria-label={cruise.status==='running'?'暂停':cruise.status==='paused'?'继续':'发车'} title={cruise.status==='running'?'暂停':cruise.status==='paused'?'继续':'发车'} onClick={runCruise}><PlaybackIcon kind={cruise.status==='running'?'pause':'play'}/></button><button className="icon-button" disabled={!ready||cruise.status==='idle'} aria-label="重置赛车" title="重置赛车" onClick={resetCar}><PlaybackIcon kind="reset"/></button></div></>}
</div></header>
<section className={view==='helmet'?'stage helmet-stage cockpit-stage':view==='onboard'?'stage cockpit-stage':'stage'}><div className="canvas" ref={host}/>{view==='free' && <div className="camera-tools"><b>自由视角</b><small>拖动环视 · 右键平移 · 滚轮推拉<br/>WASD 水平移动 · Q/E 升降 · Shift 加速</small>
{<select aria-label="选择弯道" defaultValue="" onChange={e=>{if(e.target.value!=='')engine.current?.exploreCorner(+e.target.value);e.target.value='';}}><option value="">选择弯道</option>{turnNames.map((name,i)=><option key={i} value={i}>{i+1} · {name}</option>)}</select>}
<label>移动速度 <select value={flySpeed} onChange={e=>{setFlySpeed(+e.target.value);if(engine.current){engine.current.free.speed=+e.target.value;engine.current.free.canvas.focus();}}}>{[8,35,120].map((v,i)=><option key={v} value={v}>{['慢速','标准','快速'][i]}</option>)}</select></label>
<div className="fly-pad">{[['KeyW','前进'],['KeyS','后退'],['KeyA','左移'],['KeyD','右移'],['KeyQ','下降'],['KeyE','上升']].map(([code,label])=><button key={code} onPointerDown={ev=>{ev.preventDefault();ev.currentTarget.setPointerCapture(ev.pointerId);engine.current?.free.keys.add(code);}} onLostPointerCapture={()=>engine.current?.free.keys.delete(code)}>{label}</button>)}</div></div>}
{view==='onboard'&&<div className="stage-note"><small>拖动环视</small></div>}
{review&&engine.current&&<CornerReview engine={engine.current} close={()=>setReview(false)}/>}
{track&&<CircuitBroadcast store={telemetry} track={track} circuitId={circuitId} inspecting={!!selected} aeroVisible={aeroVisible} flowVisible={flowVisible} pressure={pressure}/>}
{view==='helmet'&&<div className="helmet-visor" aria-hidden="true"><span/></div>}
{cruise.recovering&&<div className="recovery-notice" role="status">冲出赛道 · 正在复位</div>}
{!ready&&!error&&<div className="loading"><i/>赛车准备中…</div>}{error&&<div role="alert" className="loading">{error}</div>}
{selected&&<aside className="part-card"><button className="close" aria-label="关闭部件详情" onClick={()=>engine.current?.select(null)}>×</button><h2>{names[selected]}</h2><LivePartReadout store={telemetry} selected={selected}/>{/^(FL|FR|RL|RR)$/.test(selected)&&<><label className="slider">前轮转向 <b>{steer}°</b><input aria-label="前轮转向角度" disabled={cruise.status==='running'||cruise.status==='paused'} type="range" min="-25" max="25" value={steer} onChange={ev=>{setSteer(+ev.target.value);if(engine.current)engine.current.steering=+ev.target.value*Math.PI/180;}}/></label></>}</aside>}

</section>
<button className="console-collapse" aria-label={collapsed?'展开底栏':'收起底栏'} aria-expanded={!collapsed} onClick={()=>setCollapsed(v=>!v)} title={collapsed?'展开底栏':'收起底栏'}>{collapsed?'⌃':'⌄'}</button>
<div className="control-console" hidden={collapsed}>
<section className="console-zone energy-zone" aria-label="能源与轮胎"><h2>能源与轮胎<div className="tyre-actions"><button disabled={!ready} onClick={()=>setPressureUnit(nextPressureUnit(pressureUnit))} aria-label="切换胎压单位">{pressureUnit}</button><button disabled={!ready} onClick={()=>{const next=nextCompound(compound);engine.current?.setTyreCompound(next);setCompound(next);}} aria-label="切换轮胎配方"><i style={{background:tyreCompounds[compound].color}}/>{tyreCompounds[compound].label}</button><button disabled={!ready} onClick={()=>engine.current?.replaceTyres()}>换新胎</button></div></h2><div className="energy-grid"><div className="energy-controls"><Toggle on={energyUse} change={()=>setEnergyUse(v=>!v)} disabled={!ready}>ERS 消耗</Toggle><LiveErsGauge store={telemetry} enabled={energyUse}/><Toggle on={tyreWear} change={()=>setTyreWear(v=>!v)} disabled={!ready}>轮胎磨损</Toggle></div><LiveVehicleStatus store={telemetry} wearEnabled={tyreWear} unit={pressureUnit}/></div></section>
<section className="console-zone drive-zone" aria-label="驾驶与空力"><h2>驾驶与空力 <span>{cruise.phase==='timed'&&!cruise.invalidLap&&cruise.aeroZone?'直道模式':'基础模式'}</span></h2>
<Segments label="驾驶节奏" value={String(cruiseLimit)} options={[["Infinity","极限推进"],["-1","稳健节奏"],["120","巡航 120"],["60","巡航 60"]]} change={v=>setCruiseLimit(+v)} disabled={!ready}/>
<div className="console-grid"><Toggle on={flowVisible} disabled={!ready} change={()=>{engine.current?.setAirflow(!flowVisible);setFlowVisible(!flowVisible);}}>空气流场</Toggle><Toggle on={pressure} disabled={!ready} change={()=>{engine.current?.setPressure(!pressure);setPressure(!pressure);}}>压力系数</Toggle><Toggle on={aeroVisible} change={()=>setAeroVisible(v=>!v)}>空力读数</Toggle><Toggle on={wingPreview} disabled={!ready||cruise.status!=='idle'} change={()=>{if(engine.current)engine.current.gridWingPreview=!wingPreview;setWingPreview(!wingPreview);}}>主动翼展开</Toggle></div></section>
<section className="console-zone aids-zone" aria-label="视图辅助"><h2>视图辅助</h2><div className="aids-grid">
<Toggle on={lineVisible} disabled={!ready} change={()=>setLineVisible(v=>!v)}>最佳走线</Toggle><Toggle on={boards} change={()=>setBoards(v=>!v)}>赛道提示牌</Toggle><Toggle on={wire} change={()=>toggle('wire')}>结构视图</Toggle><Toggle on={rotate} change={()=>toggle('rotate')}>环绕</Toggle>
</div><div className="view-tools"><div className="view-tool-row"><span>画面</span><Segments label="路面" value={road} options={[["soft","柔焦"],["clear","清晰"],["outline","轮廓"]]} change={v=>{setRoad(v);if(engine.current)engine.current.roadStyle=v;}}/></div><div className="view-tool-row"><span>机位</span><Segments label="观察方向" value={view} options={[["bottom","车底"],["side","侧面"],["top","顶部"],["front","车头"],["rear","车尾"]]} change={camera}/></div></div></section>
<section className="console-zone timing-zone" aria-label="圈速遥测"><h2>圈速遥测 <span>{!ready?'加载中':statusLabel}</span></h2>
<LiveTiming store={telemetry} stage={stage}/>
<div className="timing-actions"><button aria-haspopup="dialog" onClick={()=>setHistoryOpen(true)}>圈速榜 ↗</button>{(engine.current?.cruise.reviews.length??0)>0&&<button onClick={()=>{if(cruise.status==='running')engine.current?.toggleCruise();setReview(true);}}>过弯回放</button>}{cruise.report&&<small title={`${turnNames[cruise.report.i]??'T'+(cruise.report.i+1)} · 出弯 ${cruise.report.exitDelta?.toFixed(0)??'—'} km/h`}>T{cruise.report.i+1} {cruise.report.delta===undefined?'—':(cruise.report.delta>=0?'+':'')+cruise.report.delta.toFixed(2)+' s'}</small>}</div></section>
</div>
{historyOpen&&<div className="history-scrim" onClick={()=>setHistoryOpen(false)}><section className="history-dialog" role="dialog" aria-modal="true" aria-label="圈速榜" onClick={e=>e.stopPropagation()}><button className="close" aria-label="关闭圈速榜" autoFocus onClick={()=>setHistoryOpen(false)}>×</button><LiveHistory store={telemetry} names={turnNames}/></section></div>}
{trackPicker&&<TrackPicker active={circuitId} error={error} onChoose={chooseCircuit} onClose={()=>setTrackPicker(false)}/>}</main>}
